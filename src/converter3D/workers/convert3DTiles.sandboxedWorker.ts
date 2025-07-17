import seven from "7zip-min";
import {
  generate3DTilesFromTileDatabase,
  generateTileDatabaseFromCityJSON,
} from "@csi-foxbyte/cityjson-to-3d-tiles";
import { JobProgress } from "bullmq";
import "dotenv";
import { createReadStream } from "fs";
import { mkdir, rm } from "fs/promises";
import _ from "lodash";
import path from "path";
import glob from "tiny-glob";
import { cityGMLToCityJSON } from "../../lib/CityGMLTools.js";
import { injectPinoLogger } from "../../lib/pino.js";
import { Convert3DTilesWorkerJob } from "./convert3DTiles.worker.js";
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
  job: Convert3DTilesWorkerJob
): Promise<Convert3DTilesWorkerJob["returnValue"]> {
  const { services } = await initializeContainers();

  const blobStorageService = await getBlobStorageService(services);

  console.log("Converting 3D Tiles...");
  const rootPath = path.join(job.data.localProcessorFolder, job.data.blobName);

  const throttledProgress = _.throttle(async (progress: JobProgress) => {
    await job.updateProgress(progress);
    console.log({ progress });
  }, 1_000);

  try {
    const zipPath = path.join(rootPath, job.data.blobName + ".zip");

    try {
      await rm(rootPath, { force: true, recursive: true });
    } catch {}

    await mkdir(rootPath, { recursive: true });

    await blobStorageService.downloadToFile(
      job.data.containerName,
      job.data.blobName,
      zipPath
    );

    await throttledProgress(0.05);

    // unpack files
    const unpackedPath = path.join(rootPath, "unpacked");

    await seven.unpack(zipPath, unpackedPath);

    await throttledProgress(0.1);

    // preprocess with citygml tools
    await cityGMLToCityJSON(unpackedPath);

    await throttledProgress(0.15);

    // generate tile db
    const { dbFilePath } = await generateTileDatabaseFromCityJSON(
      unpackedPath,
      rootPath,
      "rgbTexture",
      async (progress) => await throttledProgress(0.15 + progress * 0.3),
      { threadCount: 4 }
    );

    const tilesPath = path.join(rootPath, "tiles");

    // generate 3d tiles from tile db
    await generate3DTilesFromTileDatabase(
      dbFilePath,
      tilesPath,
      async (progress) => {
        await throttledProgress(0.45 + progress * 0.3);
      },
      {
        threadCount: 4,
      }
    );

    const files = await glob(tilesPath.split("\\").join("/") + "/*", {
      filesOnly: true,
      cwd: tilesPath,
    });

    let uploadedFiles = 0;

    for (const file of files) {
      const readStream = createReadStream(path.join(tilesPath, file));

      await blobStorageService.uploadStream(
        readStream,
        `tileset-${job.data.blobName}`,
        `${file}`
      );

      uploadedFiles++;

      await throttledProgress(0.75 + (uploadedFiles / files.length) * 0.25);
    }

    // cleanup
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
