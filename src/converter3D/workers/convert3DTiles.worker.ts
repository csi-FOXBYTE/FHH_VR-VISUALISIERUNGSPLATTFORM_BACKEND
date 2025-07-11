import seven from "7zip-min";
import {
  generate3DTilesFromTileDatabase,
  generateTileDatabaseFromCityJSON,
} from "@csi-foxbyte/cityjson-to-3d-tiles";
import "dotenv";
import { createReadStream } from "fs";
import { mkdir, rm } from "fs/promises";
import path from "path";
import glob from "tiny-glob";
import { BlobStorageService } from "../../blobStorage/blobStorage.service.js";
import { cityGMLToCityJSON } from "../../lib/CityGMLTools.js";
import { Convert3DTilesJob } from "../jobs/convert3DTiles.job.js";
import _ from "lodash";
import { JobProgress } from "bullmq";
import { injectPinoLogger } from "../../lib/pino.js";

injectPinoLogger();

export default async function run(
  job: Convert3DTilesJob
): Promise<Convert3DTilesJob["returnValue"]> {
  console.log("Converting 3D Tiles...");
  const rootPath = path.join(job.data.localProcessorFolder, job.data.blobName);

  const throttledProgress = _.throttle(async (progress: JobProgress) => {
    await job.updateProgress(progress);
    console.log({ progress });
  }, 1_000);

  try {
    const blobStorageService = new BlobStorageService();

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
        "tilesets",
        `${job.data.blobName}/${file}`
      );

      uploadedFiles++;

      await throttledProgress(0.75 + (uploadedFiles / files.length) * 0.25);
    }

    // cleanup
    try {
      await rm(rootPath, { force: true, recursive: true });
    } catch {}
  } catch (e) {
    console.error(e);
    try {
      await rm(rootPath, { force: true, recursive: true });
    } catch {}
    throw e;
  }
}
