import {
  createWorker,
} from "@csi-foxbyte/fastify-toab";
import defaultConnection from "../../connection.js";
import { Job } from "bullmq";
import { BullMQOtel } from "bullmq-otel";
import { getBlobStorageService } from "../../@internals/index.js";

const deleteBlobWorker = createWorker()
  .queue("{deleteBlob-queue}")
  .job<Job<{ containerName: string; blobName: string }, void>>()
  .options({
    removeOnComplete: { count: 0 },
    removeOnFail: { count: 100 },
    telemetry: new BullMQOtel("bullmq"),
  })
  .connection(defaultConnection)
  .processor(async (job, { services }) => {
    const blobStorageService = await getBlobStorageService(services);

    await blobStorageService.delete(job.data.containerName, job.data.blobName);

    return;
  });

export default deleteBlobWorker;