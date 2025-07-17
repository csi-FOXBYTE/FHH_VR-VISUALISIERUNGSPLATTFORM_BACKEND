import "dotenv";

import { generate, preprocess } from "@csi-foxbyte/mesh-dem-to-terrain";
import { JobProgress } from "bullmq";
import _ from "lodash";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { injectPinoLogger } from "../../lib/pino.js";
import type { ConvertTerrainWorkerJob } from "./convertTerrain.worker.js";
import { getRegistries } from "../../registries.js";
import { getBlobStorageService } from "../../blobStorage/blobStorage.service.js";

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

  console.log("Converting Terrain...");

  const rootPath = path.join(job.data.localProcessorFolder, job.data.blobName);

  try {
    const throttledProgress = _.throttle(async (progress: JobProgress) => {
      await job.updateProgress(progress);
    }, 1_000);

    const zipPath = path.join(rootPath, job.data.blobName);

    await mkdir(rootPath, { recursive: true });

    await blobStorageService.downloadToFile(
      job.data.containerName,
      job.data.blobName,
      zipPath
    );

    const preprocessedDir = path.join(rootPath, "preprocessed");

    await mkdir(preprocessedDir, { recursive: true });

    await preprocess(
      zipPath,
      preprocessedDir,
      (progress) => throttledProgress(progress * 0.5),
      job.data.srcSRS
    );

    await generate(
      preprocessedDir,
      (progress) => throttledProgress(progress * 0.5 + 0.5),
      {
        writeFile: async (_, file, terrainTile) => {
          if (terrainTile) {
            console.log({
              path: `${terrainTile.zoom}/${terrainTile.x}/${terrainTile.y}.terrain`,
              terrainTile,
            });
            await blobStorageService.uploadData(
              Buffer.from(file),
              `terrain-${job.data.blobName}`,
              `${terrainTile.zoom}/${terrainTile.x}/${terrainTile.y}.terrain`
            );
            return;
          }

          await blobStorageService.uploadData(
            Buffer.from(file),
            `terrain-${job.data.blobName}`,
            `layer.json`
          );
        },
      }
    );

    try {
      await blobStorageService.delete(
        job.data.containerName,
        job.data.blobName
      );
      await rm(rootPath, { force: true, recursive: true });
    } catch {}
  } catch (e) {
    console.error(e);
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
