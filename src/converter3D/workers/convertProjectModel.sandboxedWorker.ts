import { Document, Logger, NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import "dotenv";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import { Matrix4 } from "three";
// @ts-expect-error has no types
import draco3d from "draco3dgltf";
import { promises as fs } from "fs";
import { temporaryFile } from "tempy";
import { initializeContainers } from "../../@internals/registries.js";
import {
  getBlobStorageService,
  type Converter3DConvertProjectModelWorkerJob,
} from "../../@internals/index.js";
import { assessWebIfcResult, buildDocumentFromIfc } from "../../lib/WebIfcConvert.js";
import { buildIfcIndex } from "../../lib/ifcStoreyIndex.js";
import { buildTransforms, configFromEnv, UNGROUPED_STOREY } from "../../lib/modelPipeline.js";

Logger.DEFAULT_INSTANCE = new Logger(Logger.Verbosity.SILENT);

const ASSIMP_EXTENSIONS = new Set([
  "fbx", "obj", "dae", "xml", "blend", "stl", "dxf", "3ds", "gltf", "ter",
]);

export default async function run(
  job: Converter3DConvertProjectModelWorkerJob
): Promise<Converter3DConvertProjectModelWorkerJob["returnValue"]> {
  const { services } = await initializeContainers();
  const blobStorageService = await getBlobStorageService(services);

  const extension = String(job.data.fileName.split(".").slice(-1)[0]).toLowerCase();
  const sourcePath = temporaryFile({ extension });

  try {
    await job.updateProgress(0);

    // Streamed to disk rather than downloadToBuffer(): the converter reads from
    // a file anyway, and holding the whole upload in memory on top of the
    // conversion is what pushes large models towards an OOM kill.
    await blobStorageService.downloadToFile(
      job.data.containerName,
      job.data.blobName,
      sourcePath
    );
    await job.updateProgress(0.2);

    const io = new NodeIO()
      .registerExtensions([...ALL_EXTENSIONS])
      .registerDependencies({
        "draco3d.decoder": await draco3d.createDecoderModule(),
        "draco3d.encoder": await draco3d.createEncoderModule(),
        "meshopt.decoder": MeshoptDecoder,
        "meshopt.encoder": MeshoptEncoder,
      });

    let document: Document;

    if (extension === "glb") {
      document = await io.read(sourcePath);
    } else if (extension === "ifc") {
      // The storey index has to exist before conversion: merging geometry into
      // storey buckets while it streams is what keeps a model with hundreds of
      // thousands of placements from ever materialising as hundreds of
      // thousands of meshes. Measured on such a model: peak 4.184 -> 3.143 MB,
      // 86,7 -> 24,1 s, with an unchanged triangle count.
      const index = await buildIfcIndex(sourcePath);
      const storeyLabel = new Map(
        index.storeys.map((storey) => [storey.guid, storey.name ?? storey.guid])
      );

      // Storey coverage is now the metric that can quietly collapse: an
      // unassigned element still keeps its geometry, so nothing else would show
      // that the grouping stopped working.
      let assignedToStorey = 0;
      let withoutStorey = 0;

      const { document: built, stats } = await buildDocumentFromIfc(sourcePath, {
        mergeInto: (nodeName) => {
          const storey = index.productToStorey.get(nodeName);
          if (!storey) {
            withoutStorey++;
            return UNGROUPED_STOREY;
          }
          assignedToStorey++;
          return storeyLabel.get(storey) ?? storey;
        },
      });

      // web-ifc reports no per-element errors, so the shape of the output is
      // the only signal that something went wrong.
      const verdict = assessWebIfcResult(stats);
      if (!verdict.usable) {
        throw new Error(`Konvertierung von ${job.data.fileName} unbrauchbar: ${verdict.reason}`);
      }
      if (verdict.warning) {
        console.warn(`${job.data.fileName}: ${verdict.warning}`);
      }

      console.log(
        `${job.data.fileName}: ${stats.elements} Bauteile, ` +
          `${stats.placements} Platzierungen, ${stats.uniqueGeometries} Geometrien, ` +
          `${stats.triangles} Dreiecke, GUID-Anteil ` +
          `${(stats.guidRatio * 100).toFixed(0)} %, ${stats.durationMs} ms`
      );
      console.log(
        `${job.data.fileName}: ${index.storeys.length} Stockwerke, ` +
          `${assignedToStorey} Platzierungen zugeordnet, ${withoutStorey} ohne Stockwerk, ` +
          `Versatz X ${stats.originX} / Z ${stats.originZ} m`
      );
      document = built;
      await job.updateProgress(0.6);
    } else if (ASSIMP_EXTENSIONS.has(extension)) {
      const { convertWithAssimpJs } = await import("../../lib/AssimpJsConvert.js");
      // assimpjs has no file-based entry point, so this path still buffers.
      document = await io.readBinary(
        await convertWithAssimpJs(extension, await fs.readFile(sourcePath))
      );
    } else {
      throw new Error("Filetype is unsupported!");
    }

    await job.updateProgress(0.8);

    const pipelineConfig = configFromEnv();
    console.log(
      `${job.data.fileName}: Draco ${pipelineConfig.draco ? pipelineConfig.dracoMethod : "aus"}`
    );
    await document.transform(...buildTransforms(pipelineConfig));

    const modelMatrix = new Matrix4();

    await blobStorageService.uploadData(
      Buffer.from(await io.writeBinary(document)),
      job.data.containerName,
      job.data.blobName
    );

    await job.updateProgress(1);

    return {
      collectableBlobName: job.data.blobName,
      containerName: job.data.containerName,
      modelMatrix: modelMatrix.toArray(),
      secret: job.data.secret,
    };
  } catch (e) {
    // The source blob is deliberately NOT deleted here. A failed conversion used
    // to remove it, forcing the user to re-upload a multi-GB file to retry. The
    // deleteLater scheduled at enqueue time cleans it up anyway.
    console.error(
      `Project model conversion failed for ${job.data.fileName}:`,
      e instanceof Error ? e.message : e
    );
    throw e;
  } finally {
    await fs.unlink(sourcePath).catch(() => {});
  }
}
