import { Document, Transform } from "@gltf-transform/core";
import { Matrix4 as ThreeMatrix4, Vector3 as ThreeVector3 } from "three";
import proj4 from "proj4";
import {
  Cartesian3,
  Cartographic,
  Ellipsoid,
  Matrix4,
  Transforms,
} from "cesium";

// WGS84 EPSG3857
const destSRS =
  "+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +wktext +no_defs +type=crs";

/**
 * !!!Important!!! Input document needs to be flattened!
 * @param document
 */
export default function convertPositions(
  srcSRS: string,
  modelMatrix: ThreeMatrix4
): Transform {
  return (document: Document) => {
    const nodes = document.getRoot().listNodes();

    const transformer = proj4(srcSRS, destSRS);

    let nodeOffset: ThreeVector3 | null = null;

    for (const node of nodes) {
      const rootMatrix = node.getMatrix();

      if (node.getParentNode() !== null)
        throw new Error("Document is not flattened!");

      const transformationMatrix = new ThreeMatrix4().fromArray(rootMatrix);

      const mesh = node.getMesh();

      if (!mesh) continue;

      const tempVec = new ThreeVector3();

      let offset: ThreeVector3 | null = null;

      for (const primitive of mesh.listPrimitives()) {
        const positionAttribute = primitive.getAttribute("POSITION");

        if (!positionAttribute) continue;

        const positionArray = positionAttribute.getArray();

        if (!positionArray) continue;

        const newPositions = new Float32Array(positionArray.length);

        for (let i = 0; i < positionArray.length; i += 3) {
          tempVec
            .set(positionArray[i], positionArray[i + 1], positionArray[i + 2])
            .applyMatrix4(transformationMatrix);

          // we have to flip here because of coordinate system
          const [newX, newY, newZ] = transformer.forward([
            tempVec.x,
            -tempVec.z,
            tempVec.y,
          ]);

          if (!offset) offset = new ThreeVector3(newX, newZ, -newY);

          newPositions[i] = newX - offset.x;
          newPositions[i + 1] = newZ - offset.y;
          newPositions[i + 2] = -newY - offset.z;
        }

        positionAttribute.setArray(newPositions);
      }

      if (!offset) continue;

      if (!nodeOffset) nodeOffset = offset.clone();

      node.setMatrix(
        new ThreeMatrix4()
          .makeTranslation(offset.clone().sub(nodeOffset))
          .toArray()
      );
    }

    if (!nodeOffset) return;

    // into cartographic
    const transformerWGS84 = proj4(
      destSRS,
      "+proj=longlat +datum=WGS84 +no_defs +type=crs"
    );
    const transformedCarto = transformerWGS84.forward([
      nodeOffset.x,
      -nodeOffset.z,
      nodeOffset.y,
    ]);

    const carto = new Cartographic(
      (transformedCarto[0] / 180) * Math.PI,
      (transformedCarto[1] / 180) * Math.PI,
      transformedCarto[2]
    );

    const anchorCartesian = Ellipsoid.WGS84.cartographicToCartesian(
      carto,
      new Cartesian3()
    );

    const enuToECEF = Transforms.eastNorthUpToFixedFrame(anchorCartesian);

    modelMatrix.fromArray(Matrix4.toArray(enuToECEF));
  };
}
