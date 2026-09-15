import {
  createWorker,
} from "@csi-foxbyte/fastify-toab";
import { SandboxedJob } from "bullmq";
import defaultConnection from "../../connection.js";
import { BullMQOtel } from "bullmq-otel";
import { getBlobStorageService, getConverter3DService } from "../../@internals/index.js";

const convertProjectModelWorker = createWorker()
  .queue("{converter3D-convertProjectModel-queue}")
  .sandboxedJob<
    SandboxedJob<
      {
        blobName: string;
        fileName: string;
        containerName: string;
        srcSRS: string;
        secret: string;
      },
      {
        modelMatrix: number[];
        collectableBlobName: string;
        containerName: string;
        secret: string;
      }
    >
  >()
  .on("failed", async ({ services }, job) => {
    if (!job) return;

    const converter3DService = await getConverter3DService(services);
  })
  .on("completed", async ({ services }, job) => {
    const blobStorageService = await getBlobStorageService(services);

    await blobStorageService.deleteLater(
      job.data.containerName,
      job.data.blobName,
      2 * 60 * 60 * 1000
    );
  })
  .options({
    // One at a time. Measured peak for a single IFC conversion: 3.576 MB, so
    // two in parallel need ~7 GB and an 8 GB instance gets OOM-killed. Until
    // this branch, large models crashed early on a maxBuffer limit and never
    // reached that peak - the ceiling was hidden by a bug, not by headroom.
    concurrency: 1,
    removeOnFail: { count: 200, age: 24 * 3600 },
    stalledInterval: 120_000,
    telemetry: new BullMQOtel("bullmq")
  })
  .connection(defaultConnection)
  .processor(
    new URL("./converter3D/workers/convertProjectModel.sandboxedWorker.js", import.meta.url)
  );

export default convertProjectModelWorker;
