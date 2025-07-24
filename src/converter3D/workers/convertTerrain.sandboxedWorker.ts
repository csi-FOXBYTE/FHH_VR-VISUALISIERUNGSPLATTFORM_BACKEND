import "dotenv";
import { generate, preprocess } from "@csi-foxbyte/mesh-dem-to-terrain";
import _ from "lodash";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { getBlobStorageService } from "../../blobStorage/blobStorage.service.js";
import { injectPinoLogger } from "../../lib/pino.js";
import { getRegistries } from "../../registries.js";
import type { ConvertTerrainWorkerJob } from "./convertTerrain.worker.js";

async function initializeContainers() {
  const { serviceRegistry, workerRegistry } = await getRegistries();

  return {
    services: serviceRegistry.resolve(),
    queues: { get: workerRegistry.getQueue.bind(workerRegistry) },
  };
}

injectPinoLogger();

export default async function run(
  job: ConvertTerrainWorkerJob
): Promise<ConvertTerrainWorkerJob["returnValue"]> {
  const { services } = await initializeContainers();

  const blobStorageService = await getBlobStorageService(services);

  job.log("Converting Terrain...");

  const rootPath = path.join(job.data.localProcessorFolder, job.data.id);

  try {
    const throttledProgress = _.throttle(async (progress: number) => {
      await job.updateProgress(progress);
      job.log(progress);
    }, 5_000);

    const zipPath = path.join(rootPath, job.data.id);

    await mkdir(rootPath, { recursive: true });

    job.log("Downloading zip...");
    await blobStorageService.downloadToFile(
      job.data.containerName,
      job.data.blobName,
      zipPath
    );
    job.log("Downloaded zip.");

    const preprocessedDir = path.join(rootPath, "preprocessed");

    await mkdir(preprocessedDir, { recursive: true });

    job.log("Preprocessing...");
    await preprocess(
      zipPath,
      preprocessedDir,
      (progress) => throttledProgress(progress * 0.5 * 100),
      job.data.srcSRS
    );
    job.log("Preprocessed.");

    try {
      job.log("Generating...");
      await generate(
        preprocessedDir,
        (progress) => throttledProgress((progress * 0.5 + 0.5) * 100),
        {
          writeFile: async (_, file, terrainTile) => {
            try {
              if (terrainTile) {
                await blobStorageService.uploadData(
                  Buffer.from(file),
                  `terrain-${job.data.id}`,
                  `${terrainTile.zoom}/${terrainTile.x}/${terrainTile.y}.terrain`
                );
                return;
              }

              await blobStorageService.uploadData(
                Buffer.from(file),
                `terrain-${job.data.id}`,
                `layer.json`
              );
            } catch (e) {
              job.log(JSON.stringify(e));
              console.error(e);
              throw e;
            }
          },
          threadCount: Math.min(job.data.threadCount, 4),
        }
      );
      job.log("Generated.");
    } catch (e) {
      console.error(e);
      throw e;
    }

    try {
      await blobStorageService.delete(
        job.data.containerName,
        job.data.blobName
      );
      await rm(rootPath, { force: true, recursive: true });
    } catch {}
    job.log("Finished.");
    job.updateProgress(100);
  } catch (e) {
    job.log(e);
    try {
      await blobStorageService.delete(
        job.data.containerName,
        job.data.blobName
      );
      await rm(rootPath, { force: true, recursive: true });
    } catch {}
    throw e;
  }
}
