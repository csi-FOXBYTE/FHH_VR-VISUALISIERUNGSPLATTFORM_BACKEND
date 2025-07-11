import { SandboxedJob } from "bullmq";

export const Convert3DTilesQueueName = "converter3D.convert-3d-tile";

export type Convert3DTilesJob = SandboxedJob<
  {
    blobName: string;
    containerName: string;
    srcSRS: string;
    localProcessorFolder: string;
  },
  void
>;
