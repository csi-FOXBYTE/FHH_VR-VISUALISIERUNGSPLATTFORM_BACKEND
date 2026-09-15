import { Document, type mat4 } from "@gltf-transform/core";
import { promises as fs } from "fs";
import path from "path";
import { IfcAPI } from "web-ifc";

/**
 * IFC -> glTF Document via web-ifc.
 *
 * Alternative to IfcConvert. IfcOpenShell computes exact B-Rep geometry with
 * OpenCASCADE and only tessellates at the end, which is why it needs roughly
 * 9x the file size to parse plus 2x-11x for geometry. For a viewer that only
 * ever renders triangles, that precision is paid for and thrown away.
 *
 * web-ifc tessellates directly, streams meshes one at a time and bounds its own
 * memory via MEMORY_LIMIT. Measured against IfcConvert on the same models:
 * 1.7x-40x faster, roughly half the peak memory, triangle counts within 1%.
 * One 696 MB model that pushed IfcConvert past 22 GB converts here in 8 GB.
 *
 * The trade-off is diagnostics: web-ifc offers only a global log level, no
 * per-element error list, and can drop far-from-origin geometry silently.
 * Callers should sanity-check the result — see the stats returned below.
 */

/** IFC GlobalIds are 22 characters; anything else is an expressID fallback. */
const IFC_GUID = /^[0-9A-Za-z_$]{22}$/;

/** Hard ceiling for web-ifc's own allocator. */
const MEMORY_LIMIT_MB = 4096;
/** Segments approximating a full circle. Higher is smoother and larger. */
const CIRCLE_SEGMENTS = 24;
/** Flush a merge bucket once it holds this many bytes. */
const MERGE_BUDGET_MB = 32;
/** Cap on what all open buckets together may hold before the largest is
 *  flushed. Splitting buckets by colour multiplies how many stay open, so the
 *  per-bucket budget alone no longer bounds memory. */
const TOTAL_BUDGET_MB = MERGE_BUDGET_MB * 8;

export type WebIfcConvertOptions = {
  /** Merge geometry while streaming instead of emitting one mesh per placement.
   *  The callback maps a node name (IFC GlobalId) to a bucket key - pass the
   *  storey lookup to keep floors separable.
   *
   *  Without this, a model with 237k placements produces 237k meshes and 712k
   *  accessors, and the document alone costs over 3 GB before any transform
   *  runs. Merging during the stream keeps that from ever existing. */
  mergeInto?: (nodeName: string) => string | undefined;
  /** Height in metres to subtract from every placement, so the building sits on
   *  the ground instead of at its elevation above sea level.
   *
   *  This cannot be derived here: the elevation enters through each storey's
   *  own placement, not through the site (measured: site placement Z was 0
   *  while every storey carried 220-258 m). The caller knows the storey
   *  elevations from the index and passes the datum in. Leave undefined for
   *  models already modelled on a local datum. */
  originY?: number;
};

export type WebIfcConvertStats = {
  /** IFC products that carried geometry - one per streamed mesh. */
  elements: number;
  /** Node/mesh pairs written, i.e. placements of a geometry. */
  placements: number;
  /** Distinct geometries; placements minus this is what instancing shares. */
  uniqueGeometries: number;
  triangles: number;
  materials: number;
  /** Share of *elements* named with a real IFC GlobalId. */
  guidRatio: number;
  /** Offset subtracted from every placement, in metres. Add it back to recover
   *  the model's original survey coordinates and elevation. */
  originX: number;
  originY: number;
  originZ: number;
  durationMs: number;
};

export async function buildDocumentFromIfc(
  inputPath: string,
  options: WebIfcConvertOptions = {}
): Promise<{ document: Document; stats: WebIfcConvertStats }> {
  const startedAt = Date.now();

  const api = new IfcAPI();
  // web-ifc resolves its .wasm relative to this path; the trailing separator
  // is required.
  api.SetWasmPath(path.join(process.cwd(), "node_modules", "web-ifc") + path.sep, true);
  await api.Init();

  const bytes = await fs.readFile(inputPath);
  const modelID = api.OpenModel(new Uint8Array(bytes), {
    // web-ifc's own re-origining shifts ALL THREE axes. Measured: a model whose
    // ground floor belongs at 0 m came out 2.50 m too high. Horizontal centring
    // happens further down instead, which leaves height alone.
    COORDINATE_TO_ORIGIN: false,
    MEMORY_LIMIT: MEMORY_LIMIT_MB * 1024 * 1024,
    TAPE_SIZE: 128 * 1024 * 1024,
    CIRCLE_SEGMENTS,
  });

  const document = new Document();
  const buffer = document.createBuffer();
  const scene = document.createScene();

  const materials = new Map<string, ReturnType<Document["createMaterial"]>>();
  const colourKey = (c: { x: number; y: number; z: number; w: number }) =>
    [c.x, c.y, c.z, c.w].map((v) => v.toFixed(3)).join(",");
  const materialFor = (c: { x: number; y: number; z: number; w: number }) => {
    const key = colourKey(c);
    let material = materials.get(key);
    if (!material) {
      material = document
        .createMaterial(`m${materials.size}`)
        .setBaseColorFactor([c.x, c.y, c.z, c.w])
        // IFC solids are frequently modelled as open shells; without this they
        // show holes wherever a face points away from the camera.
        .setDoubleSided(true);
      if (c.w < 1) material.setAlphaMode("BLEND");
      materials.set(key, material);
    }
    return material;
  };

  // web-ifc reuses a geometry across placements (the same window type in many
  // openings). Caching keeps one copy and lets many nodes reference it, which
  // is also what dedup() would otherwise have to reconstruct.
  const meshCache = new Map<number, ReturnType<Document["createMesh"]>>();

  // --- merge-while-streaming ------------------------------------------------
  // Accumulates transformed geometry per bucket and flushes to a mesh once the
  // budget is reached, so the document never holds hundreds of thousands of
  // tiny meshes.
  type Bucket = {
    /** The grouping key the caller asked for, e.g. the storey name. */
    storey: string;
    pos: number[];
    nrm: number[];
    idx: number[];
    colour: { x: number; y: number; z: number; w: number };
  };
  // Keyed by storey AND colour. Merging a whole storey into one primitive
  // leaves room for only one material on it, which repainted every floor in
  // whichever colour happened to arrive first.
  const buckets = new Map<string, Bucket>();
  const mergeBudget = MERGE_BUDGET_MB * 1024 * 1024;
  const totalBudget = TOTAL_BUDGET_MB * 1024 * 1024;
  const bucketNodes = new Map<string, number>();
  // One parent node per storey. join() merges only within a shared parent, so a
  // flat scene lets it merge by material straight across floors - measured: 150
  // storey-tagged nodes collapsed into 48 material blobs, losing the grouping
  // the whole pipeline exists to produce.
  const storeyParents = new Map<string, ReturnType<Document["createNode"]>>();
  const parentFor = (storey: string) => {
    let parent = storeyParents.get(storey);
    if (!parent) {
      parent = document.createNode(storey);
      parent.setExtras({ storey });
      scene.addChild(parent);
      storeyParents.set(storey, parent);
    }
    return parent;
  };
  const bucketBytes = (b: Bucket) => b.pos.length * 8 + b.idx.length * 4;
  let heldBytes = 0;

  const flushBucket = (key: string) => {
    const bucket = buckets.get(key);
    if (!bucket || bucket.idx.length === 0) return;
    const primitive = document
      .createPrimitive()
      .setAttribute(
        "POSITION",
        document.createAccessor().setType("VEC3").setArray(new Float32Array(bucket.pos)).setBuffer(buffer)
      )
      .setAttribute(
        "NORMAL",
        document.createAccessor().setType("VEC3").setArray(new Float32Array(bucket.nrm)).setBuffer(buffer)
      )
      .setIndices(
        document.createAccessor().setType("SCALAR").setArray(new Uint32Array(bucket.idx)).setBuffer(buffer)
      )
      .setMaterial(materialFor(bucket.colour));
    const part = (bucketNodes.get(bucket.storey) ?? 0) + 1;
    bucketNodes.set(bucket.storey, part);
    const name = `${bucket.storey}#${part}`;
    const node = document
      .createNode(name)
      .setMesh(document.createMesh(name).addPrimitive(primitive));
    node.setExtras({ ...node.getExtras(), mergedBucket: bucket.storey });
    parentFor(bucket.storey).addChild(node);
    heldBytes -= bucketBytes(bucket);
    buckets.delete(key);
  };

  /** Keeps total unflushed geometry under totalBudget. */
  const flushLargest = () => {
    let largestKey: string | undefined;
    let largest = -1;
    for (const [candidate, bucket] of buckets) {
      const bytes = bucketBytes(bucket);
      if (bytes > largest) {
        largest = bytes;
        largestKey = candidate;
      }
    }
    if (largestKey === undefined) return false;
    flushBucket(largestKey);
    return true;
  };

  const appendToBucket = (
    storey: string,
    mesh: ReturnType<Document["createMesh"]>,
    matrix: ArrayLike<number>,
    colour: { x: number; y: number; z: number; w: number }
  ) => {
    const key = `${storey}\u0000${colourKey(colour)}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { storey, pos: [], nrm: [], idx: [], colour };
      buckets.set(key, bucket);
    }
    const bytesBefore = bucketBytes(bucket);
    const m = matrix;
    for (const primitive of mesh.listPrimitives()) {
      const position = primitive.getAttribute("POSITION")?.getArray();
      const normal = primitive.getAttribute("NORMAL")?.getArray();
      const indices = primitive.getIndices()?.getArray();
      if (!position || !indices) continue;

      const base = bucket.pos.length / 3;
      for (let v = 0; v < position.length; v += 3) {
        const x = position[v]!, y = position[v + 1]!, z = position[v + 2]!;
        // Column-major 4x4, as web-ifc delivers it.
        bucket.pos.push(
          m[0]! * x + m[4]! * y + m[8]! * z + m[12]!,
          m[1]! * x + m[5]! * y + m[9]! * z + m[13]!,
          m[2]! * x + m[6]! * y + m[10]! * z + m[14]!
        );
        if (normal) {
          const nx = normal[v]!, ny = normal[v + 1]!, nz = normal[v + 2]!;
          // Rotation part only; IFC placements carry no non-uniform scale.
          bucket.nrm.push(
            m[0]! * nx + m[4]! * ny + m[8]! * nz,
            m[1]! * nx + m[5]! * ny + m[9]! * nz,
            m[2]! * nx + m[6]! * ny + m[10]! * nz
          );
        } else {
          bucket.nrm.push(0, 1, 0);
        }
      }
      for (let i = 0; i < indices.length; i++) bucket.idx.push(base + indices[i]!);
    }
    // Rough byte estimate: 3 floats position + 3 normal + 1 index per entry.
    const bytesAfter = bucketBytes(bucket);
    heldBytes += bytesAfter - bytesBefore;
    if (bytesAfter > mergeBudget) {
      flushBucket(key);
      return;
    }
    while (heldBytes > totalBudget && flushLargest()) {
      /* flushLargest reduces heldBytes each time */
    }
  };

  let elements = 0;
  let placements = 0;
  let triangles = 0;
  let guidNamed = 0;
  // Horizontal shift applied to every placement, taken from the first one.
  // It only has to land near the model, not at its exact centre.
  let originX = 0;
  let originZ = 0;
  let originTaken = false;
  const originY = options.originY ?? 0;

  api.StreamAllMeshes(modelID, (flatMesh) => {
    elements++;
    let name = String(flatMesh.expressID);
    try {
      const line = api.GetLine(modelID, flatMesh.expressID);
      if (line?.GlobalId?.value) name = line.GlobalId.value;
    } catch {
      /* fall back to the expressID */
    }
    if (IFC_GUID.test(name)) guidNamed++;

    const geometryCount = flatMesh.geometries.size();
    for (let i = 0; i < geometryCount; i++) {
      const placed = flatMesh.geometries.get(i);
      let mesh = meshCache.get(placed.geometryExpressID);

      if (!mesh) {
        const geometry = api.GetGeometry(modelID, placed.geometryExpressID);
        const raw = api.GetVertexArray(
          geometry.GetVertexData(),
          geometry.GetVertexDataSize()
        );
        const indices = api.GetIndexArray(
          geometry.GetIndexData(),
          geometry.GetIndexDataSize()
        );

        // web-ifc interleaves position and normal per vertex: px,py,pz,nx,ny,nz
        const vertexCount = raw.length / 6;
        const positions = new Float32Array(vertexCount * 3);
        const normals = new Float32Array(vertexCount * 3);
        for (let v = 0; v < vertexCount; v++) {
          positions[v * 3] = raw[v * 6]!;
          positions[v * 3 + 1] = raw[v * 6 + 1]!;
          positions[v * 3 + 2] = raw[v * 6 + 2]!;
          normals[v * 3] = raw[v * 6 + 3]!;
          normals[v * 3 + 1] = raw[v * 6 + 4]!;
          normals[v * 3 + 2] = raw[v * 6 + 5]!;
        }

        const primitive = document
          .createPrimitive()
          .setAttribute(
            "POSITION",
            document.createAccessor().setType("VEC3").setArray(positions).setBuffer(buffer)
          )
          .setAttribute(
            "NORMAL",
            document.createAccessor().setType("VEC3").setArray(normals).setBuffer(buffer)
          )
          .setIndices(
            document
              .createAccessor()
              .setType("SCALAR")
              .setArray(new Uint32Array(indices))
              .setBuffer(buffer)
          )
          .setMaterial(materialFor(placed.color));

        mesh = document.createMesh(`g${placed.geometryExpressID}`).addPrimitive(primitive);
        meshCache.set(placed.geometryExpressID, mesh);
        geometry.delete();
      }

      // IFC models are routinely modelled on survey coordinates. Measured: a
      // building 59 m across sat at X 3.517.450 / Z -5.405.163, i.e. 6.449 km
      // from the origin, where a 32-bit float resolves to only ~0,4 m. Shifting
      // has to happen here, while the values still come from web-ifc as
      // doubles - a later pass would only move geometry that is already coarse.
      //
      // Height is deliberately untouched: storey elevations are relative to the
      // IFC's own vertical datum and the ground floor belongs at its own level.
      const placement = placed.flatTransformation;
      if (!originTaken) {
        originTaken = true;
        originX = Math.round(placement[12]!);
        originZ = Math.round(placement[14]!);
      }
      const matrix = Array.from(placement);
      matrix[12] = placement[12]! - originX;
      matrix[13] = placement[13]! - originY;
      matrix[14] = placement[14]! - originZ;

      const bucketKey = options.mergeInto?.(name);
      if (bucketKey !== undefined) {
        appendToBucket(bucketKey, mesh, matrix, placed.color);
      } else {
        const node = document.createNode(name).setMesh(mesh);
        node.setMatrix(matrix as mat4);
        scene.addChild(node);
      }
      placements++;

      for (const primitive of mesh.listPrimitives()) {
        triangles += (primitive.getIndices()?.getCount() ?? 0) / 3;
      }
    }

    // The streamed mesh belongs to web-ifc and is released when this returns.
  });

  // Deleting the current entry while iterating a Map is well defined, and
  // flushBucket only ever deletes the key it was handed.
  for (const key of buckets.keys()) flushBucket(key);

  // Read before the merge path empties the cache below - otherwise this stat is
  // always 0 on exactly the path production uses.
  const uniqueGeometries = meshCache.size;

  if (options.mergeInto) {
    // Merged geometry is baked into world space; the per-placement meshes that
    // fed it are no longer referenced and would otherwise linger.
    for (const mesh of meshCache.values()) mesh.dispose();
    meshCache.clear();
  }

  api.CloseModel(modelID);

  return {
    document,
    stats: {
      elements,
      placements,
      uniqueGeometries,
      triangles: Math.round(triangles),
      materials: materials.size,
      // Per element, not per placement: an element commonly carries several
      // geometries, which would deflate the ratio by exactly that factor.
      guidRatio: elements > 0 ? guidNamed / elements : 0,
      originX,
      originY,
      originZ,
      durationMs: Date.now() - startedAt,
    },
  };
}

/*
 * There used to be a ceiling on distinct geometries here (60.000). It was
 * written when the pipeline still ran dedup() over one mesh per placement: a
 * 110 MB model with 237.325 geometries and 711.975 accessors did not finish
 * within 20 minutes, one core at 100 %, memory flat.
 *
 * It never actually fired, because uniqueGeometries was read after the merge
 * path had already cleared the cache and was therefore always 0. Fixing that
 * made the ceiling reachable - and it immediately rejected that very model,
 * which by then converted fine: 23,2 s end to end (15,5 s conversion, 4,5 s
 * post-processing, 0,8 s write), peak 3.576 MB, 716.985 triangles, 2,1 MB GLB.
 *
 * dedup() is gone and geometry is merged while streaming, so the shape it
 * guarded against no longer costs what it did. Removed rather than retuned: a
 * higher number would only look principled. The real limit is memory, and that
 * does not follow from the geometry count.
 */

export type WebIfcVerdict =
  | { usable: true; warning?: string }
  | { usable: false; reason: string };

/**
 * Decides whether a web-ifc result can go through the normal pipeline.
 *
 * web-ifc offers no per-element error list, so the shape of the output is the
 * only signal available. Only an empty result is rejected outright - that one
 * is unambiguous, and catching it here beats failing an hour later downstream.
 *
 * Everything else is reported, not refused. Thin GUID coverage still keeps its
 * geometry and lands in the "ohne Stockwerk" group, so only the storey split
 * degrades. A guard that rejects a model the pipeline can actually handle costs
 * more than the case it prevents; see the note above the verdict type.
 */
export function assessWebIfcResult(stats: WebIfcConvertStats): WebIfcVerdict {
  if (stats.placements === 0 || stats.triangles === 0) {
    return {
      usable: false,
      reason:
        `keine Geometrie erzeugt (${stats.placements} Platzierungen, ` +
        `${stats.triangles} Dreiecke)`,
    };
  }

  if (stats.guidRatio < 0.5) {
    return {
      usable: true,
      warning:
        `nur ${(stats.guidRatio * 100).toFixed(1)} % der Bauteile tragen eine ` +
        `IFC-GlobalId - der Rest landet in der Gruppe ohne Stockwerk`,
    };
  }

  return { usable: true };
}
