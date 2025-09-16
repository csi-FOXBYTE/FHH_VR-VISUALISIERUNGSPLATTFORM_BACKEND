import {
  createWorker,
} from "@csi-foxbyte/fastify-toab";
import { SandboxedJob } from "bullmq";
import { getConverter3DService } from "../../@internals/index.js";
import defaultConnection from "../../connection.js";
import { BullMQOtel } from "bullmq-otel";

const convert3DTilesWorker = createWorker()
  .queue("{converter3D-convert3DTiles-queue}")
  .sandboxedJob<
    SandboxedJob<
      {
        blobName: string;
        containerName: string;
        id: string;
        srcSRS: string;
        appearance: string;
        localProcessorFolder: string;
        threadCount: number;
      },
      void
    >
  >()
  .on("active", async ({ services }, job) => {
    const converter3DService = await getConverter3DService(services);

    await converter3DService.updateBaseLayerStatus(job.data.id, 0, "ACTIVE");
  })
  .on("progress", async ({ services }, job) => {
    const converter3DService = await getConverter3DService(services);

    await converter3DService.updateBaseLayerStatus(
      job.data.id,
      +job.progress.valueOf(),
      "ACTIVE"
    );
  })
  .on("completed", async ({ services }, job) => {
    const converter3DService = await getConverter3DService(services);

    await converter3DService.updateBaseLayerStatus(job.data.id, 1, "COMPLETED");
  })
  .on("failed", async ({ services }, job) => {
    if (!job) return;

    const converter3DService = await getConverter3DService(services);

    await converter3DService.updateBaseLayerStatus(
      job.data.id,
      +job.progress.valueOf(),
      "FAILED"
    );
  })
  .options({
    concurrency: 1,
    removeOnComplete: { count: 100, age: 24 * 3600 },
    removeOnFail: { count: 200, age: 24 * 3600 },
    stalledInterval: 120_000,
    telemetry: new BullMQOtel("bullmq"),
  })
  .connection(defaultConnection)
  .processor(new URL("./convert3DTiles.sandboxedWorker.js", import.meta.url));

export default convert3DTilesWorker;