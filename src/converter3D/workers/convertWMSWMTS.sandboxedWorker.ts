import { queue } from "async";
import "dotenv/config"; // Ensure config is loaded
import _ from "lodash";
import { spawn } from "node:child_process";
import { readFile, rm, rmdir } from "node:fs/promises";
import path from "node:path";
import {
  getBlobStorageService,
  getConfigurationService,
  type Converter3DConvertWMSWMTSWorkerJob,
} from "../../@internals/index.js";
import { initializeContainers } from "../../registries.js";

export default async function run(
  job: Converter3DConvertWMSWMTSWorkerJob,
): Promise<Converter3DConvertWMSWMTSWorkerJob["returnValue"]> {
  const { services } = await initializeContainers();

  const configurationService = await getConfigurationService(services);
  const blobStorageService = await getBlobStorageService(services);

  const throttledProgress = _.throttle(async (progress: number) => {
    await job.updateProgress(progress);
    job.log(progress);
  }, 5_000);

  const workdir = path.join(
    (await configurationService.getConfiguration()).localProcessorFolder,
    job.data.id,
  );

  try {
    let reject: (reason?: any) => void = () => {};
    let resolve: () => void = () => {};

    const promise = new Promise<void>((res, rej) => {
      resolve = res;
      reject = rej;
    });

    const uploadQueue = queue<string, Error>(async (filePath: string) => {
      const buffer = await readFile(filePath);

      const [z, x, y] = filePath.split(path.sep).slice(-3);

      await blobStorageService.uploadData(
        buffer,
        job.data.containerName,
        `${z}/${x}/${y}`,
      );

      await rm(filePath);
    }, 4);

    const p = spawn(path.join(process.cwd(), ".venv/bin/python3"), [
      path.join(process.cwd(), "python/convertWMSWMTSToTMS.py"),
      "-u",
      job.data.url,
      "-l",
      job.data.layer,
      "-z",
      `${job.data.startZoom}-${job.data.endZoom}`,
      "-o",
      workdir,
    ]);

    let stderrOutput = "";

    p.stdout.on("data", (data) => {
      const lines = data.toString().split("\n");
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line);
          if (typeof parsed?.progress === "number") {
            throttledProgress(parsed.progress * 100);
          }
          if (typeof parsed?.filename === "string") {
            uploadQueue.push(parsed.filename);
          }
        } catch (e) {
          job.log(`Failed to parse chunk: ${e}`);
        }
      }
    });

    p.stderr.on("data", (data) => {
      stderrOutput += data.toString();
    });

    p.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(`Python script failed with code ${code}: ${stderrOutput}`),
        );
      }
    });

    await promise;

    if (!uploadQueue.idle()) await uploadQueue.drain();
  } finally {
    await rmdir(workdir, { recursive: true }); // cleanup
  }
}
