import { createReadStream } from "fs";

/**
 * Reads storey structure straight out of the IFC STEP file without a full IFC
 * parser.
 *
 * IfcConvert needs roughly 9x the file size in RAM just to parse, so a second
 * parse purely to learn which element sits on which floor is not affordable.
 * This scan is regex-based, streaming, and bounded by the number of entities
 * that carry a GlobalId rather than by the file size.
 */

export type StoreyInfo = {
  guid: string;
  name: string | null;
  /** In the file's own length unit. Multiply by lengthUnitToMetres for metres. */
  elevation: number | null;
};

export type IfcIndex = {
  storeys: StoreyInfo[];
  /** Product GlobalId -> storey GlobalId. */
  productToStorey: Map<string, string>;
  /** Product GlobalId -> IFC entity type, e.g. "WALL", "SLAB". */
  guidToType: Map<string, string>;
  /** e.g. 0.001 when the file is modelled in millimetres. */
  lengthUnitToMetres: number;
  stats: {
    entitiesWithGuid: number;
    containmentRelations: number;
    aggregateRelations: number;
    /** Products attached to a storey only via IFCRELAGGREGATES. */
    resolvedViaAggregates: number;
    /** Products whose container was a space, lifted to the enclosing storey. */
    resolvedViaContainerChain: number;
    durationMs: number;
  };
};

const SI_PREFIX: Record<string, number> = {
  EXA: 1e18, PETA: 1e15, TERA: 1e12, GIGA: 1e9, MEGA: 1e6, KILO: 1e3,
  HECTO: 1e2, DECA: 1e1, DECI: 1e-1, CENTI: 1e-2, MILLI: 1e-3,
  MICRO: 1e-6, NANO: 1e-9, PICO: 1e-12, FEMTO: 1e-15, ATTO: 1e-18,
};

// Exporters differ in whitespace: "#1=IFCWALL('..." and "#1 = IFCWALL( '..."
// are both valid STEP. Anchoring without tolerating it silently matched nothing
// on pretty-printed files, which disabled storey grouping with no error.
const ENTITY_WITH_GUID = /^#(\d+)\s*=\s*IFC([A-Z0-9]+)\(\s*'([^']{22})'/;
const STOREY = /^#(\d+)\s*=\s*IFCBUILDINGSTOREY\(\s*'([^']{22})'/;
const CONTAINS = /IFCRELCONTAINEDINSPATIALSTRUCTURE\(.*?\(([^)]*)\)\s*,\s*#(\d+)\s*\)/;
const AGGREGATES = /IFCRELAGGREGATES\(.*?,\s*#(\d+)\s*,\s*\(([^)]*)\)\s*\)/;
// A file may declare several length units - a property set can carry its own.
// Picking any match took the wrong one on a real model (DECI instead of the
// project's METRE), so the unit is resolved through IFCUNITASSIGNMENT instead.
// The prefix slot is either an enum like .DECI. or an unset "$" - matching only
// the enum form silently skipped the plain-metre declaration and left the file
// looking like decimetres, which scaled every storey elevation by ten.
const LENGTH_SI =
  /^#(\d+)\s*=\s*IFCSIUNIT\([^,]*,\s*\.LENGTHUNIT\.\s*,\s*(\$|\.[A-Z]+\.)\s*,\s*\.([A-Z]+)\./;
const UNIT_ASSIGNMENT = /^#\d+\s*=\s*IFCUNITASSIGNMENT\(\s*\(([^)]*)\)/;

/** Trailing numeric argument of IFCBUILDINGSTOREY is its elevation. */
function parseElevation(statement: string): number | null {
  const m = statement.match(/,\s*(-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)\s*\)\s*$/);
  return m ? Number(m[1]) : null;
}

function parseName(statement: string): string | null {
  // GlobalId, OwnerHistory, Name -> third argument
  const m = statement.match(/\('[^']{22}'\s*,\s*[^,]*,\s*'([^']*)'/);
  return m ? m[1] : null;
}

function refsIn(list: string): string[] {
  return [...list.matchAll(/#(\d+)/g)].map((m) => m[1]);
}

/** A storey this close to zero means the model already uses a local datum. */
const LOCAL_DATUM_TOLERANCE_M = 1;

/**
 * Height in metres to subtract so the building sits on the ground.
 *
 * Storey elevations are given against the project's vertical datum, and which
 * datum that is has to be inferred. A local datum puts the ground floor at or
 * near zero and must not be touched - shifting one earlier raised a building by
 * exactly its basement depth. A survey datum puts every storey at its height
 * above sea level: measured on a Stuttgart model, the lowest storey sat at
 * 220,86 m, which left the whole building floating that far in the air.
 *
 * The elevation cannot be read off the site: on that same model the site
 * placement carried Z = 0 while each storey placement carried its own height.
 */
export function verticalDatumOf(index: IfcIndex): number {
  const elevations = index.storeys
    .map((storey) => storey.elevation)
    .filter((elevation): elevation is number => elevation !== null)
    .map((elevation) => elevation * index.lengthUnitToMetres);

  if (elevations.length === 0) return 0;
  if (elevations.some((e) => Math.abs(e) < LOCAL_DATUM_TOLERANCE_M)) return 0;

  return Math.min(...elevations);
}

export async function buildIfcIndex(filePath: string): Promise<IfcIndex> {
  const startedAt = Date.now();

  const refToGuid = new Map<string, string>();
  const guidToType = new Map<string, string>();
  const storeyRefToGuid = new Map<string, string>();
  const storeys: StoreyInfo[] = [];
  const containment: Array<{ products: string[]; storeyRef: string }> = [];
  const aggregates: Array<{ parentRef: string; childRefs: string[] }> = [];
  // ref -> metres per unit, for every IFCSIUNIT declaring a length.
  const lengthUnits = new Map<string, number>();
  // Refs listed in IFCUNITASSIGNMENT, i.e. the units the project actually uses.
  const assignedUnitRefs = new Set<string>();

  // STEP statements end with ';' and may span any number of physical lines, so
  // split on the terminator rather than on newlines.
  let pending = "";
  const stream = createReadStream(filePath, { encoding: "latin1", highWaterMark: 4 * 1024 * 1024 });

  const handle = (raw: string) => {
    const statement = raw.replace(/[\r\n]+/g, "").trim();
    if (!statement) return;

    // Relationship entities carry a GlobalId too, so they must be recognised
    // before the generic GlobalId branch claims them.
    const contains = CONTAINS.exec(statement);
    if (contains) {
      containment.push({ products: refsIn(contains[1]), storeyRef: contains[2] });
      return;
    }

    const aggregate = AGGREGATES.exec(statement);
    if (aggregate) {
      aggregates.push({ parentRef: aggregate[1], childRefs: refsIn(aggregate[2]) });
      return;
    }

    const guidMatch = ENTITY_WITH_GUID.exec(statement);
    if (guidMatch) {
      const [, ref, type, guid] = guidMatch;
      refToGuid.set(ref, guid);
      guidToType.set(guid, type);

      const storeyMatch = STOREY.exec(statement);
      if (storeyMatch) {
        storeyRefToGuid.set(storeyMatch[1], storeyMatch[2]);
        storeys.push({
          guid: storeyMatch[2],
          name: parseName(statement),
          elevation: parseElevation(statement),
        });
      }
      return;
    }

    const assignment = UNIT_ASSIGNMENT.exec(statement);
    if (assignment) {
      for (const ref of refsIn(assignment[1]!)) assignedUnitRefs.add(ref);
      return;
    }

    const unit = LENGTH_SI.exec(statement);
    if (unit && unit[3] === "METRE") {
      const prefix = unit[2] === "$" ? null : unit[2]!.replaceAll(".", "");
      lengthUnits.set(unit[1]!, prefix ? (SI_PREFIX[prefix] ?? 1) : 1);
    }
  };

  for await (const chunk of stream) {
    pending += chunk;
    const parts = pending.split(";");
    pending = parts.pop() ?? "";
    for (const part of parts) handle(part);
  }
  if (pending.trim()) handle(pending);

  // Prefer the length unit the project assigns; fall back to any declared one.
  let lengthUnitToMetres = 1;
  const assigned = [...lengthUnits].find(([ref]) => assignedUnitRefs.has(ref));
  const fallback = [...lengthUnits.values()][0];
  if (assigned) lengthUnitToMetres = assigned[1];
  else if (fallback !== undefined) lengthUnitToMetres = fallback;

  // Aggregation parent of every entity, used to walk the spatial tree upwards.
  const parentOfRef = new Map<string, string>();
  for (const { parentRef, childRefs } of aggregates) {
    for (const ref of childRefs) if (!parentOfRef.has(ref)) parentOfRef.set(ref, parentRef);
  }

  /** A container is often an IfcSpace, which is itself aggregated into the
   *  storey. Walking up finds the storey; accepting only a direct storey
   *  reference dropped two thirds of the geometry on a measured model, where 5
   *  of 78 containment relations pointed at a storey and the rest at spaces. */
  const storeyForContainer = (ref: string): string | undefined => {
    let current: string | undefined = ref;
    for (let depth = 0; current !== undefined && depth < 16; depth++) {
      const storey = storeyRefToGuid.get(current);
      if (storey) return storey;
      current = parentOfRef.get(current);
    }
    return undefined;
  };

  // Containment: IFCRELCONTAINEDINSPATIALSTRUCTURE, via the container's storey.
  const productToStorey = new Map<string, string>();
  let resolvedViaContainerChain = 0;
  for (const { products, storeyRef } of containment) {
    const storeyGuid = storeyForContainer(storeyRef);
    if (!storeyGuid) continue;
    const indirect = !storeyRefToGuid.has(storeyRef);
    for (const ref of products) {
      const guid = refToGuid.get(ref);
      if (!guid) continue;
      productToStorey.set(guid, storeyGuid);
      if (indirect) resolvedViaContainerChain++;
    }
  }

  // Parts (IfcBuildingElementPart and friends) hang off a parent element via
  // IFCRELAGGREGATES instead of off the storey. Inherit the parent's storey,
  // repeating until nothing new resolves so nested aggregates settle too.
  let resolvedViaAggregates = 0;
  for (let pass = 0; pass < 8; pass++) {
    let changed = 0;
    for (const { parentRef, childRefs } of aggregates) {
      const parentGuid = refToGuid.get(parentRef);
      // The parent may be a storey itself, or a space below one.
      const storeyGuid =
        (parentGuid ? productToStorey.get(parentGuid) : undefined) ??
        storeyForContainer(parentRef);
      if (!storeyGuid) continue;
      for (const ref of childRefs) {
        const guid = refToGuid.get(ref);
        if (guid && !productToStorey.has(guid)) {
          productToStorey.set(guid, storeyGuid);
          changed++;
        }
      }
    }
    resolvedViaAggregates += changed;
    if (!changed) break;
  }

  storeys.sort((a, b) => (a.elevation ?? 0) - (b.elevation ?? 0));

  return {
    storeys,
    productToStorey,
    guidToType,
    lengthUnitToMetres,
    stats: {
      entitiesWithGuid: refToGuid.size,
      containmentRelations: containment.length,
      aggregateRelations: aggregates.length,
      resolvedViaAggregates,
      resolvedViaContainerChain,
      durationMs: Date.now() - startedAt,
    },
  };
}
