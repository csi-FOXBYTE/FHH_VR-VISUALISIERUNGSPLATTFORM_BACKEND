import { createWorker } from "@csi-foxbyte/fastify-toab";
import { SandboxedJob } from "bullmq";
import defaultConnection from "../../connection.js";
import { getConverter3DService } from "../../@internals/index.js";

const convertWMSWMTSWorker = createWorker()
  .queue("{converter3D-convertWMSWMTS-queue}")
  .sandboxedJob<
    SandboxedJob<
      {
        url: string;
        startZoom: number;
        endZoom: number;
        layer: string;
        containerName: string;
        id: string;
      },
      void
    >
  >()
  .on("active", async ({ services }, job) => {
    try {
      const converter3DService = await getConverter3DService(services);

      await converter3DService.updateBaseLayerStatus(job.data.id, 0, "ACTIVE");
    } catch (e) {
      console.error(e);
    }
  })
  .on("progress", async ({ services }, job) => {
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
  .connection(defaultConnection)
  .processor(new URL("./convertWMSWMTS.sandboxedWorker.js", import.meta.url));

export default convertWMSWMTSWorker;
