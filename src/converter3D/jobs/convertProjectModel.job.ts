import { SandboxedJob } from "bullmq";

export const ConvertProjectModelQueueName = "converter3D.convert-project-model";

export type ConvertProjectModelJob = SandboxedJob<
  {
    blobName: string;
    fileName: string;
    containerName: string;
    srcSRS: string;
  },
  {
    modelMatrix: number[];
    collectableBlobName: string;
  }
>;
