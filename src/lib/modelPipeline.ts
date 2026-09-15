import { Document, Transform } from "@gltf-transform/core";
import { draco, join, prune } from "@gltf-transform/functions";

/**
 * Post-processing for a glTF document produced from IFC.
 *
 * Deliberately short. Every stage here earned its place in measurements on six
 * real models; the ones that did not are recorded in the commit history rather
 * than kept around as dead options:
 *
 *   dedup()            pointless before join(), which merges the very instances
 *                      dedup creates - identical output, 15 s slower, and on a
 *                      model with 237k meshes it never finished
 *   flatten()          would collapse the storey grouping back into one mesh
 *   weld()             no effect on the final size once draco runs
 *   simplify()         cost up to 64 % of the triangles for no size benefit
 *   quantize()         cut payload by 60 % but the peak by only 13 %
 *   textureCompress()  IFC output is untextured; a measured no-op
 */

/** Bucket name for geometry that could not be assigned to a storey. */
export const UNGROUPED_STOREY = "ohne-stockwerk";

export type PipelineConfig = {
  prune: boolean;
  /** Merge meshes sharing a material. Scoped to each node's parent, so the
   *  grouping decides whether this yields one mesh per model or per storey. */
  join: boolean;
  /** Cap on bytes per join group. Without it a single primitive grew to 338 of
   *  407 MB, and serialising that one primitive set the memory peak. */
  joinBudgetMb: number;
  /** Cap on meshes per join group. Bytes alone are not enough: 237k tiny meshes
   *  stay below any byte budget and still make join() allocate gigabytes. */
  joinBudgetCount: number;
  draco: boolean;
  /** Shift the scene horizontally towards the origin. Height is never touched:
   *  storey elevations are given relative to the IFC's vertical datum, with
   *  ground floor typically at 0. */
  recenter: boolean;
};

export const DEFAULT_CONFIG: PipelineConfig = {
  prune: true,
  join: true,
  joinBudgetMb: 32,
  joinBudgetCount: 5_000,
  draco: true,
  recenter: true,
};

/**
 * Splits each parent's children into bounded groups before join() runs, so a
 * single merged primitive can never exceed the budget.
 */
function bucketForJoin(budgetMb: number, budgetCount: number): Transform {
  return (document: Document) => {
    const budgetBytes = budgetMb > 0 ? budgetMb * 1024 * 1024 : Infinity;
    const budgetNodes = budgetCount > 0 ? budgetCount : Infinity;

    // Size from metadata only. Calling getArray() here would materialise every
    // accessor just to measure it, which is exactly what this exists to avoid.
    const byteLengthOf = (accessor: ReturnType<Document["createAccessor"]> | null) =>
      accessor
        ? accessor.getCount() * accessor.getElementSize() * accessor.getComponentSize()
        : 0;

    const sizeOf = (node: ReturnType<Document["createNode"]>) => {
      const mesh = node.getMesh();
      if (!mesh) return 0;
      let bytes = 0;
      for (const primitive of mesh.listPrimitives()) {
        bytes += byteLengthOf(primitive.getIndices());
        for (const attribute of primitive.listAttributes()) bytes += byteLengthOf(attribute);
      }
      return bytes;
    };

    for (const scene of document.getRoot().listScenes()) {
      for (const parent of scene.listChildren()) {
        const children = parent.listChildren().filter((child) => child.getMesh());
        if (children.length < 2) continue;

        const label = parent.getName() || "gruppe";
        let bucket = document.createNode(`${label}_b0`);
        let index = 0;
        let accumulated = 0;
        let count = 0;
        parent.addChild(bucket);

        for (const child of children) {
          const bytes = sizeOf(child);
          if (count > 0 && (accumulated + bytes > budgetBytes || count + 1 > budgetNodes)) {
            bucket = document.createNode(`${label}_b${++index}`);
            parent.addChild(bucket);
            accumulated = 0;
            count = 0;
          }
          parent.removeChild(child);
          bucket.addChild(child);
          accumulated += bytes;
          count++;
        }
      }
    }
  };
}

/**
 * Shifts the scene horizontally so it sits near the origin.
 *
 * HEIGHT IS DELIBERATELY NOT TOUCHED. An earlier version subtracted the first
 * node's full translation including Y, and "first node" is whatever happens to
 * come first in the file. Measured on a model whose first element sat in the
 * basement: the whole building rose by exactly 2.92 m, the basement elevation,
 * leaving the ground floor floating above grade.
 */
function recenterTransform(): Transform {
  return (document: Document) => {
    const root = document.getRoot();
    const firstMeshNode = root.listNodes().find((node) => node.getMesh());
    if (!firstMeshNode) return;

    const [offsetX, , offsetZ] = firstMeshNode.getTranslation();

    for (const scene of root.listScenes()) {
      for (const node of scene.listChildren()) {
        const translation = node.getTranslation();
        node.setTranslation([translation[0] - offsetX, translation[1], translation[2] - offsetZ]);
      }
    }
  };
}

export function buildTransforms(config: PipelineConfig): Transform[] {
  const transforms: Transform[] = [];

  if (config.prune) transforms.push(prune());
  if (config.join) {
    if (config.joinBudgetMb > 0 || config.joinBudgetCount > 0) {
      transforms.push(bucketForJoin(config.joinBudgetMb, config.joinBudgetCount));
    }
    transforms.push(join({}));
  }
  if (config.draco) transforms.push(draco({}));
  if (config.recenter) transforms.push(recenterTransform());

  return transforms;
}
