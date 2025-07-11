import { SandboxedJob } from "bullmq";

export const ConvertTerrainQueueName = "converter3D.convert-terrain";

export type ConvertTerrainJob = SandboxedJob<
  {
    blobName: string;
    srcSRS: string;
    containerName: string;
    localProcessorFolder: string;
  },
  void
>;
