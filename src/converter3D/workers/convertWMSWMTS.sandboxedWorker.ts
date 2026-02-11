import "dotenv";
import _ from "lodash";
import { spawn } from "node:child_process";
import path from "node:path";
import type { Converter3DConvertWMSWMTSWorkerJob } from "../../@internals/index.js";
import { initializeContainers } from "../../registries.js";

export default async function run(
  job: Converter3DConvertWMSWMTSWorkerJob,
): Promise<Converter3DConvertWMSWMTSWorkerJob["returnValue"]> {
  const { services } = await initializeContainers();

  const throttledProgress = _.throttle(async (progress: number) => {
    await job.updateProgress(progress);
    job.log(progress);
  }, 5_000);

  let reject = (reason?: any) => {};
  let resolve = () => {};

  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    rej = rej;
  });

  const p = spawn("python3", [
    path.join(process.cwd(), "python/convertWMSWMTSToTMS.py"),
    "-u",
    "https://geodienste.leipzig.de/l2/Portal/Luftbild_2024_mit_Beschriftung/MapServer/WMTS/1.0.0/WMTSCapabilities.xml",
    "-l",
    "Portal_Luftbild_2024_mit_Beschriftung",
    "-z",
    "10-10",
  ]);
  p.stdout.on("data", (data) => {
    try {
      const parsed = JSON.parse(data);

      if (typeof parsed?.event?.progress === "number")
        throttledProgress(data.event.progress * 100);
    } catch (e) {
      console.error(e);
    }
  });

  p.stderr.on("data", (data) => {
    reject(data);
  });

  p.on("close", (code) => {
    resolve();
  });

  await promise;
}
