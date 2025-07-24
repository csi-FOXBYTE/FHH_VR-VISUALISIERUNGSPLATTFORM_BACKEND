import seven from "7zip-min";
import {
  generate3DTilesFromTileDatabase,
  generateTileDatabaseFromCityJSON,
} from "@csi-foxbyte/cityjson-to-3d-tiles";
import "dotenv";
import { createReadStream } from "fs";
import { mkdir, rm } from "fs/promises";
import _ from "lodash";
import path from "path";
import glob from "tiny-glob";
import { getBlobStorageService } from "../../blobStorage/blobStorage.service.js";
import { cityGMLToCityJSON } from "../../lib/CityGMLTools.js";
import { injectPinoLogger } from "../../lib/pino.js";
import { getRegistries } from "../../registries.js";
import { Convert3DTilesWorkerJob } from "./convert3DTiles.worker.js";

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

  job.log("Initialized worker.");
  const rootPath = path.join(job.data.localProcessorFolder, job.data.id);

  const throttledProgress = _.throttle(async (progress: number) => {
    await job.updateProgress(progress);
    job.log(JSON.stringify(progress));
  }, 5_000);

  try {
    const zipPath = path.join(rootPath, job.data.id + ".zip");

    try {
      await rm(rootPath, { force: true, recursive: true });
    } catch {}

    await mkdir(rootPath, { recursive: true });

    job.log("Downloading zip file...");
    await blobStorageService.downloadToFile(
      job.data.containerName,
      job.data.blobName,
      zipPath
    );
    job.log("Downloaded zip file.");

    await throttledProgress(0.05 * 100);

    // unpack files
    job.log("Unpacking files...");
    const unpackedPath = path.join(rootPath, "unpacked");
    job.log("Unpacked files.");

    await seven.unpack(zipPath, unpackedPath);

    await throttledProgress(0.1 * 100);

    // preprocess with citygml tools
    job.log("Preprocessing with citygml-tools...");
    await cityGMLToCityJSON(unpackedPath);
    job.log("Preprocessed with citygml-tools.");

    await throttledProgress(0.15 * 100);

    // generate tile db
    job.log("Generating tile database...");
    const { dbFilePath } = await generateTileDatabaseFromCityJSON(
      unpackedPath,
      rootPath,
      "rgbTexture",
      async (progress) =>
        await throttledProgress((0.15 + progress * 0.3) * 100),
      { threadCount: 4 }
    );
    job.log("Generated tile database.");

    const tilesPath = path.join(rootPath, "tiles");

    // generate 3d tiles from tile db
    job.log("Generating 3d tiles from database...");
    await generate3DTilesFromTileDatabase(
      dbFilePath,
      tilesPath,
      async (progress) => {
        await throttledProgress((0.45 + progress * 0.3) * 100);
      },
      {
        threadCount: 12,
      }
    );
    job.log("Generated 3d tiles from database.");

    const files = await glob("./*", {
      filesOnly: true,
      cwd: tilesPath,
    });

    let uploadedFiles = 0;

    for (const file of files) {
      const readStream = createReadStream(path.join(tilesPath, file));

      await blobStorageService.uploadStream(
        readStream,
        `tileset-${job.data.id}`,
        `${file}`
      );

      uploadedFiles++;

      await throttledProgress(
        (0.75 + (uploadedFiles / files.length) * 0.25) * 100
      );
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
    job.log(JSON.stringify(e));
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
