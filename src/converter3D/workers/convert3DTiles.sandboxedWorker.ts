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
import { cityGMLToCityJSON } from "../../lib/CityGMLTools.js";
import { injectPinoLogger } from "../../lib/pino.js";
import { initializeContainers } from "../../registries.js";
import {
  getBlobStorageService,
  type Converter3DConvert3DTilesWorkerJob,
} from "../../@internals/index.js";
import dayjs from "dayjs";

injectPinoLogger();

function printLogWithDate(log: string) {
  return `${dayjs().format("HH:mm DD.MM.YYYY")}: ${log}`;
}

export default async function run(
  job: Converter3DConvert3DTilesWorkerJob
): Promise<Converter3DConvert3DTilesWorkerJob["returnValue"]> {
  const { services } = await initializeContainers();

  const blobStorageService = await getBlobStorageService(services);

  job.log(printLogWithDate("Initialized worker."));
  const rootPath = path.join(job.data.localProcessorFolder, job.data.id);

  job.log(printLogWithDate("Working in: " + rootPath));

  const throttledProgress = _.throttle(async (progress: number) => {
    await job.updateProgress(progress);
    job.log(printLogWithDate(JSON.stringify(progress)));
  }, 5_000);

  try {
    const zipPath = path.join(rootPath, job.data.id + ".zip");

    try {
      await rm(rootPath, { force: true, recursive: true });
    } catch {}

    await mkdir(rootPath, { recursive: true });

    job.log(printLogWithDate("Downloading zip file..."));
    await blobStorageService.downloadToFile(
      job.data.containerName,
      job.data.blobName,
      zipPath
    );
    job.log(printLogWithDate("Downloaded zip file."));

    await throttledProgress(0.05 * 100);

    // unpack files
    job.log(printLogWithDate("Unpacking files..."));
    const unpackedPath = path.join(rootPath, "unpacked");

    await seven.unpack(zipPath, unpackedPath);

    job.log(printLogWithDate("Unpacked files."));

    await throttledProgress(0.1 * 100);

    // preprocess with citygml tools
    job.log(printLogWithDate("Preprocessing with citygml-tools..."));
    await cityGMLToCityJSON(unpackedPath);
    job.log(printLogWithDate("Preprocessed with citygml-tools."));

    await throttledProgress(0.15 * 100);

    // generate tile db
    job.log(printLogWithDate("Generating tile database..."));
    const { dbFilePath } = await generateTileDatabaseFromCityJSON(
      unpackedPath,
      rootPath,
      job.data.appearance,
      async (progress) =>
        await throttledProgress((0.15 + progress * 0.3) * 100),
      { threadCount: job.data.threadCount, srcSRS: job.data.srcSRS }
    );
    job.log(printLogWithDate("Generated tile database."));

    const tilesPath = path.join(rootPath, "tiles");

    // generate 3d tiles from tile db
    job.log(printLogWithDate("Generating 3d tiles from database..."));
    await generate3DTilesFromTileDatabase(
      dbFilePath,
      tilesPath,
      job.data.hasAlphaEnabled,
      async (progress) => {
        await throttledProgress((0.45 + progress * 0.3) * 100);
      },
      {
        threadCount: job.data.threadCount,
      }
    );
    job.log(printLogWithDate("Generated 3d tiles from database."));

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
      await rm(dbFilePath, { force: true, recursive: true });
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
