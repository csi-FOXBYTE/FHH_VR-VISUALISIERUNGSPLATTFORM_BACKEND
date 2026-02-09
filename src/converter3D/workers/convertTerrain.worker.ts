import { createWorker } from "@csi-foxbyte/fastify-toab";
import { SandboxedJob } from "bullmq";
import defaultConnection from "../../connection.js";
import { BullMQOtel } from "bullmq-otel";
import { getConverter3DService } from "../../@internals/index.js";

const convertTerrainWorker = createWorker()
  .queue("{converter3D-convertTerrain-queue}")
  .sandboxedJob<
    SandboxedJob<
      {
        blobName: string;
        srcSRS: string;
        id: string;
        containerName: string;
        localProcessorFolder: string;
        threadCount: number;
      },
      void
    >
  >()
  .on("active", async ({ services }, job) => {
    console.log({ services });
    try {
      const converter3DService = await getConverter3DService(services);

      await converter3DService.updateBaseLayerStatus(job.data.id, 0, "ACTIVE");
    } catch (e) {
      console.error(e);
    }
  })
  .on("progress", async ({ services }, job) => {
    console.log({ services });
    try {
      const converter3DService = await getConverter3DService(services);

      await converter3DService.updateBaseLayerStatus(
        job.data.id,
        +job.progress.valueOf(),
        "ACTIVE",
      );
    } catch (e) {
      console.error(e);
    }
  })
  .on("completed", async ({ services }, job) => {
    try {
      const converter3DService = await getConverter3DService(services);

      await converter3DService.updateBaseLayerStatus(
        job.data.id,
        1,
        "COMPLETED",
      );
    } catch (e) {
      console.error(e);
    }
  })
  .on("failed", async ({ services }, job) => {
    try {
      if (!job) return;

      const converter3DService = await getConverter3DService(services);

      await converter3DService.updateBaseLayerStatus(
        job.data.id,
        +job.progress.valueOf(),
        "FAILED",
      );
    } catch (e) {
      console.error(e);
    }
  })
  .options({
    concurrency: 1,
    removeOnComplete: { count: 100, age: 3600 },
    removeOnFail: { count: 200, age: 24 * 3600 },
    stalledInterval: 120_000,
    telemetry: new BullMQOtel("bullmq"),
  })
  .connection(defaultConnection)
  .processor(new URL("./convertTerrain.sandboxedWorker.js", import.meta.url));

export default convertTerrainWorker;
