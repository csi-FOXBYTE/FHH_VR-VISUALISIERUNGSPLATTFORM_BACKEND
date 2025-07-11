import "dotenv";

import { generate, preprocess } from "@csi-foxbyte/mesh-dem-to-terrain";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { BlobStorageService } from "../../blobStorage/blobStorage.service.js";
import { ConvertTerrainJob } from "../jobs/convertTerrain.job.js";
import _ from "lodash";
import { JobProgress } from "bullmq";
import { injectPinoLogger } from "../../lib/pino.js";

injectPinoLogger();

export default async function run(
  job: ConvertTerrainJob
): Promise<ConvertTerrainJob["returnValue"]> {
  console.log("Converting Terrain...")
  try {
    const throttledProgress = _.throttle(async (progress: JobProgress) => {
      await job.updateProgress(progress);
      console.log({ progress });
    }, 1_000);

    const rootPath = path.join(job.data.localProcessorFolder, job.data.blobName);

    const blobStorageService = new BlobStorageService();

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
            await blobStorageService.uploadData(
              Buffer.from(file),
              "terrains",
              `${job.data.blobName}/${terrainTile.zoom}/${terrainTile.x}/${terrainTile.y}.terrain`
            );
            return;
          }

          await blobStorageService.uploadData(
            Buffer.from(file),
            "terrain",
            "layer.json"
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
    throw e;
  }
}
