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
  /** Height references the file declares, in file units, in the order IFC
   *  intends them to be trusted. Unset or zero means the exporter left it out;
   *  measured across seven real models, all four were empty or zero. */
  declaredHeights: {
    /** IfcMapConversion.OrthogonalHeight - the georeferencing offset. */
    mapConversion: number | null;
    /** IfcBuilding.ElevationOfRefHeight - "usually ground floor level". */
    buildingRefHeight: number | null;
    /** IfcBuilding.ElevationOfTerrain. */
    buildingTerrain: number | null;
    /** IfcSite.RefElevation. */
    siteRefElevation: number | null;
  };
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
const MAP_CONVERSION = /^#\d+\s*=\s*IFCMAPCONVERSION\(/;

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

/** Splits a STEP argument list at top level, respecting nesting and quotes. */
function stepArgs(statement: string): string[] {
  const open = statement.indexOf("(");
  if (open === -1) return [];
  const inner = statement.slice(open + 1, statement.lastIndexOf(")"));
  const out: string[] = [];
  let depth = 0;
  let quoted = false;
  let current = "";
  for (const character of inner) {
    if (quoted) {
      current += character;
      if (character === "'") quoted = false;
      continue;
    }
    if (character === "'") {
      quoted = true;
      current += character;
      continue;
    }
    if (character === "(") depth++;
    if (character === ")") depth--;
    if (character === "," && depth === 0) {
      out.push(current.trim());
      current = "";
      continue;
    }
    current += character;
  }
  out.push(current.trim());
  return out;
}

/** A STEP numeric argument, or null for "$" and anything unparsable. */
function stepNumber(value: string | undefined): number | null {
  if (!value || value === "$" || value === "*") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** A storey this close to zero means the model already uses a local datum. */
const LOCAL_DATUM_TOLERANCE_M = 1;

/** How far below the lowest storey a declared datum may still be believed. */
const PLAUSIBLE_BELOW_LOWEST_M = 50;

/**
 * Names that mark the storey at grade.
 *
 * Nothing in IFC identifies it: IfcBuilding.ElevationOfTerrain and
 * IfcSite.RefElevation were both unset on the model this was written for, and
 * the site carried no terrain geometry. The name is the only signal left, so a
 * miss must stay harmless - it falls back to the lowest storey.
 */
const GROUND_STOREY = /^(eg|e\.?g\.?\d*|erdgeschoss|ground(\s*floor)?|level\s*0+|l0+|0+|±\s*0)/i;

export type VerticalDatum = {
  /** Metres to subtract from every placement. */
  metres: number;
  /** Which rule produced it, so a job log can say why. */
  source:
    | "keiner"
    | "IfcMapConversion.OrthogonalHeight"
    | "IfcBuilding.ElevationOfRefHeight"
    | "IfcBuilding.ElevationOfTerrain"
    | "IfcSite.RefElevation"
    | "Geschossname"
    | "unterstes Geschoss";
};

/**
 * Height in metres to subtract so the building sits on the ground.
 *
 * Storey elevations are given against the project's vertical datum, and which
 * datum that is has to be inferred. A local datum puts the ground floor at or
 * near zero and must not be touched - shifting one raised a building by exactly
 * its basement depth. A survey datum puts every storey at its height above sea
 * level: measured on a Stuttgart model, the ground floor sat at 222,86 m, which
 * left the whole building floating that far in the air.
 *
 * IFC provides four attributes for this and they are consulted first, most
 * specific to least. Measured across seven real models, every one of them was
 * either absent or zero, and IfcMapConversion never appeared at all - so the
 * name-based step below is the one that actually fires. It is a convention, not
 * a fact, which is why it runs last and why the chosen source is reported.
 */
export function verticalDatumOf(index: IfcIndex): VerticalDatum {
  const levelled = index.storeys
    .filter((storey) => storey.elevation !== null)
    .map((storey) => ({
      name: storey.name?.trim() ?? "",
      elevation: storey.elevation! * index.lengthUnitToMetres,
    }));

  // Without storey elevations nothing can be corroborated, so nothing is moved.
  // Measured: one model declared IfcSite.RefElevation = -300 m and had no
  // storeys at all; trusting it would have lifted the building 300 m.
  if (levelled.length === 0) return { metres: 0, source: "keiner" };

  // Already modelled on a local datum: the ground floor is where it belongs.
  if (levelled.some((s) => Math.abs(s.elevation) < LOCAL_DATUM_TOLERANCE_M)) {
    return { metres: 0, source: "keiner" };
  }

  // From here the model is on a survey datum. What the standard says comes
  // first, most specific to least - but only where the storeys agree with it.
  // A declared zero is treated as unset: next to storeys hundreds of metres up
  // it is a contradiction, and honouring it would leave the model in the air.
  const lowest = Math.min(...levelled.map((s) => s.elevation));
  const highest = Math.max(...levelled.map((s) => s.elevation));
  const plausible = (value: number) =>
    value >= lowest - PLAUSIBLE_BELOW_LOWEST_M && value <= highest;

  const declared = index.declaredHeights;
  const fromSpec: Array<[number | null, VerticalDatum["source"]]> = [
    [declared.mapConversion, "IfcMapConversion.OrthogonalHeight"],
    [declared.buildingRefHeight, "IfcBuilding.ElevationOfRefHeight"],
    [declared.buildingTerrain, "IfcBuilding.ElevationOfTerrain"],
    [declared.siteRefElevation, "IfcSite.RefElevation"],
  ];
  for (const [raw, source] of fromSpec) {
    if (raw === null || raw === 0) continue;
    const metres = raw * index.lengthUnitToMetres;
    if (plausible(metres)) return { metres, source };
  }

  // The storey at grade belongs at zero, not the lowest one - putting a
  // basement at zero lifts everything below grade above it.
  const ground = levelled
    .filter((s) => GROUND_STOREY.test(s.name))
    .sort((a, b) => a.elevation - b.elevation)[0];

  return ground
    ? { metres: ground.elevation, source: "Geschossname" }
    : { metres: Math.min(...levelled.map((s) => s.elevation)), source: "unterstes Geschoss" };
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
  const declared: IfcIndex["declaredHeights"] = {
    mapConversion: null,
    buildingRefHeight: null,
    buildingTerrain: null,
    siteRefElevation: null,
  };

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
        return;
      }

      // IfcSite(.., CompositionType[8], RefLatitude[9], RefLongitude[10],
      //         RefElevation[11], ..)
      if (type === "SITE" && declared.siteRefElevation === null) {
        declared.siteRefElevation = stepNumber(stepArgs(statement)[11]);
      }
      // IfcBuilding(.., CompositionType[8], ElevationOfRefHeight[9],
      //             ElevationOfTerrain[10], ..)
      if (type === "BUILDING" && declared.buildingRefHeight === null) {
        const fields = stepArgs(statement);
        declared.buildingRefHeight = stepNumber(fields[9]);
        declared.buildingTerrain = stepNumber(fields[10]);
      }
      return;
    }

    // IfcMapConversion carries no GlobalId, so it needs its own branch.
    // IfcMapConversion(SourceCRS[0], TargetCRS[1], Eastings[2], Northings[3],
    //                  OrthogonalHeight[4], ..)
    if (MAP_CONVERSION.test(statement)) {
      declared.mapConversion = stepNumber(stepArgs(statement)[4]);
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
    declaredHeights: declared,
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
