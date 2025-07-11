import "dotenv";
import { Document, Logger, NodeIO, vec3 } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import {
  dedup,
  draco,
  flatten,
  join,
  prune,
  simplify,
  textureCompress,
  weld,
} from "@gltf-transform/functions";
import {
  MeshoptDecoder,
  MeshoptEncoder,
  MeshoptSimplifier,
} from "meshoptimizer";
import sharp from "sharp";
import { Matrix4 } from "three";
// @ts-expect-error has no types
import draco3d from "draco3dgltf";
import { ConvertProjectModelJob } from "../jobs/convertProjectModel.job.js";
import { BlobStorageService } from "../../blobStorage/blobStorage.service.js";
import { injectPinoLogger } from "../../lib/pino.js";

injectPinoLogger();

Logger.DEFAULT_INSTANCE = new Logger(Logger.Verbosity.SILENT);

export default async function run(
  job: ConvertProjectModelJob
): Promise<ConvertProjectModelJob["returnValue"]> {
  console.log("Converting Project Model...");
  try {
    await job.updateProgress(0);

    const {
      data: { blobName, fileName, srcSRS, containerName },
    } = job;

    const blobStorageService = new BlobStorageService();

    const file = await blobStorageService.downloadToBuffer(
      containerName,
      blobName
    );

    await job.updateProgress(0.25);

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

    await job.updateProgress(0.75);

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

    // overwrite blob
    await blobStorageService.uploadData(
      Buffer.from(await io.writeBinary(document)),
      containerName,
      blobName
    );

    await job.updateProgress(1);

    return {
      collectableBlobName: blobName,
      modelMatrix: modelMatrix.toArray(),
    };
  } catch (e) {
    console.error(e);
    throw e;
  }
}
