import "dotenv";
import type { Converter3DConvertWMSWMTSWorkerJob } from "../../@internals/index.js";
import { initializeContainers } from "../../registries.js";
import _ from "lodash";

export default async function run(
  job: Converter3DConvertWMSWMTSWorkerJob,
): Promise<Converter3DConvertWMSWMTSWorkerJob["returnValue"]> {
  const { services } = await initializeContainers();

  const throttledProgress = _.throttle(async (progress: number) => {
    await job.updateProgress(progress);
    job.log(progress);
  }, 5_000);
}
