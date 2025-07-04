import { parentPort } from "worker_threads";
import { Logger, NodeIO, vec3, Document } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import {
  dedup,
  flatten,
  prune,
  weld,
  simplify,
  draco,
  join,
  textureCompress,
} from "@gltf-transform/functions";
import { Matrix4 } from "three";
import {
  MeshoptDecoder,
  MeshoptEncoder,
  MeshoptSimplifier,
} from "meshoptimizer";
import sharp from "sharp";
// @ts-expect-error has no types
import draco3d from "draco3dgltf";

Logger.DEFAULT_INSTANCE = new Logger(Logger.Verbosity.SILENT);

export default async function run({
  file,
  fileName,
}: {
  file: Buffer;
  fileName: string;
}) {
  const extension = fileName.split(".").slice(-1)[0];

  const io = new NodeIO()
    .registerExtensions([...ALL_EXTENSIONS])
    .registerDependencies({
      "draco3d.decoder": await draco3d.createDecoderModule(),
      "draco3d.encoder": await draco3d.createEncoderModule(),
      "meshopt.decoder": MeshoptDecoder,
      "meshopt.encoder": MeshoptEncoder,
    });

  let document: Document | null = null;

  switch (extension) {
    case "glb": {
      document = await io.readBinary(file);
      break;
    }
    case "ifc": {
      const { convertIfcBuffer } = await import("../../lib/IfcConvert.js");
      document = await io.readBinary(await convertIfcBuffer(file, "glb"));
      break;
    }
    case "fbx":
    case "obj":
    case "dae":
    case "xml":
    case "blend":
    case "stl":
    case "dxf":
    case "3ds":
    case "gltf":
    case "ter":
      const { convertWithAssimpJs } = await import(
        "../../lib/AssimpJsConvert.js"
      );
      document = await io.readBinary(
        await convertWithAssimpJs(extension, file)
      );
      break;
    default:
      throw new Error("Filetype is unsupported!");
  }

  let modelMatrix = new Matrix4();

  await document.transform(
    dedup(),
    flatten(),
    prune(),
    weld({}),
    join({}),
    simplify({
      simplifier: MeshoptSimplifier,
      ratio: 0.0,
      error: 0.001,
      cleanup: true,
      lockBorder: false,
    }),
    draco({}),
    textureCompress({
      encoder: sharp,
      effort: 95,
      quality: 99,
      targetFormat: "png",
    }),
    (document) => {
      let offset: null | vec3 = null;

      for (const node of document.getRoot().listNodes()) {
        const translation = node.getTranslation();

        if (!offset) offset = [...translation];

        node.setTranslation([
          translation[0] - offset[0],
          translation[1] - offset[1],
          translation[2] - offset[2],
        ]);
      }
    }
  );

  return {
    modelMatrix: modelMatrix.toArray(),
    serializedDocument: await io.writeBinary(document),
  };
}
