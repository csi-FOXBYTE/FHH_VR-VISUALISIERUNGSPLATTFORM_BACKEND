import {
  createService,
  InferService,
  ServiceContainer,
} from "@csi-foxbyte/fastify-toab";
import { getAuthService } from "../auth/auth.service.js";
import { getBlobStorageService } from "../blobStorage/blobStorage.service.js";
import { getConfigurationService } from "../configuration/configuration.service.js";
import { getDbService } from "../db/db.service.js";
import { getConvert3DTilesWorkerQueue } from "./workers/convert3DTiles.worker.js";
import { getConvertProjectModelWorkerQueue } from "./workers/convertProjectModel.worker.js";
import { getConvertTerrainWorkerQueue } from "./workers/convertTerrain.worker.js";
import { Readable } from "node:stream";

const converter3DService = createService(
  "converter3D",
  async ({ queues, services }) => {
    const tile3DConverterQueue = getConvert3DTilesWorkerQueue(queues);
    const projectModelConverterQueue =
      getConvertProjectModelWorkerQueue(queues);
    const terrainConverterQueue = getConvertTerrainWorkerQueue(queues);
    const dbService = await getDbService(services);
    const blobStorageService = await getBlobStorageService(services);
    const configurationService = await getConfigurationService(services);

    const projectModel = {
      async convertProjectModel(
        blobRef: string,
        fileName: string,
        srcSRS: string
      ) {
        const blobUrl = new URL(blobRef);

        const [, containerName, blobName] = blobUrl.pathname.split("/");

        const job = await projectModelConverterQueue.add(blobName, {
          blobName,
          fileName,
          srcSRS,
          containerName,
          secret: crypto.randomUUID(),
        });

        await blobStorageService.deleteLater(
          containerName,
          blobName,
          24 * 60 * 60 * 1000
        );

        return { jobId: job.id!, secret: job.data.secret };
      },

      async getProjectModelStatus(jobId: string, secret: string) {
        const job = await projectModelConverterQueue.getJob(jobId);

        if (!job || job.data.secret !== secret)
          throw new Error(`There is no job with id ${jobId}!`);

        const state = await job.getState();

        if (state === "failed") throw new Error("Failed");

        if (state === "completed") {
          const { modelMatrix } = job.returnvalue;

          return {
            state,
            progress: Number(job.progress),
            modelMatrix,
          };
        }

        return { state, progress: Number(job.progress) };
      },

      async downloadProjectModel(
        jobId: string,
        projectId: string,
        secret: string
      ) {
        const job = await projectModelConverterQueue.getJob(jobId);

        if (!job || job.data.secret !== secret)
          throw new Error(`There is no job with id ${jobId}!`);

        const { collectableBlobName } = job.returnvalue;

        const stream = await blobStorageService.downloadToStream(
          job.data.containerName,
          collectableBlobName
        );

        const { href } = await blobStorageService.uploadStream(
          stream.readableStreamBody as Readable,
          `project-${projectId}`
        );

        return { href };
      },
    };

    const terrain = {
      async convertTerrain(blobRef: string, name: string, srcSRS: string) {
        const authService = await getAuthService(services);

        const blobUrl = new URL(blobRef);

        const [, containerName, blobName] = blobUrl.pathname.split("/");

        const { id } = await dbService.rawClient.baseLayer.create({
          data: {
            name: name,
            sizeGB: 0,
            type: "TERRAIN",
            status: "PENDING",
            progress: 0,
            ownerId: (await authService.getSession())!.user.id,
          },
          select: {
            id: true,
          },
        });

        const job = await terrainConverterQueue.add(id, {
          blobName,
          id,
          threadCount: 10, // TODO: make that configurable
          srcSRS,
          containerName,
          localProcessorFolder: (
            await configurationService.getConfiguration()
          ).localProcessorFolder,
        });

        return { jobId: job.id! };
      },

      async getTerrainStatus(jobId: string) {
        const job = await terrainConverterQueue.getJob(jobId);

        if (!job) throw new Error(`There is no job with id ${jobId}!`);

        const state = await job.getState();

        if (state === "failed") throw new Error("Failed");

        return { state, progress: job.progress };
      },
    };

    const tile3D = {
      async convert3DTile(blobRef: string, name: string, srcSRS: string) {
        const authService = await getAuthService(services);

        const blobUrl = new URL(blobRef);

        const [, containerName, blobName] = blobUrl.pathname.split("/");

        const { id } = await dbService.rawClient.baseLayer.create({
          data: {
            name: name,
            sizeGB: 0,
            type: "3D-TILES",
            status: "PENDING",
            progress: 0,
            ownerId: (await authService.getSession())!.user.id,
          },
          select: {
            id: true,
          },
        });

        const job = await tile3DConverterQueue.add(id, {
          blobName,
          srcSRS,
          threadCount: 10, // TODO: make that configurable
          id,
          containerName,
          localProcessorFolder: (
            await configurationService.getConfiguration()
          ).localProcessorFolder,
        });

        return { jobId: job.id! };
      },

      async get3DTileStatus(jobId: string) {
        const job = await tile3DConverterQueue.getJob(jobId);

        if (!job) throw new Error(`There is no job with id ${jobId}!`);

        const state = await job.getState();

        if (state === "failed") throw new Error("Failed");

        return { state, progress: job.progress };
      },
    };

    return {
      ...projectModel,
      ...terrain,
      ...tile3D,
      async updateBaseLayerStatus(
        id: string,
        progress: number,
        status: "PENDING" | "ACTIVE" | "FAILED" | "COMPLETED"
      ) {
        return await dbService.rawClient.baseLayer.update({
          where: {
            id,
          },
          data: {
            progress,
            status,
          },
        });
      },
    };
  }
);

/*
AUTOGENERATED!
*/

export { converter3DService };
export type Converter3DService = InferService<typeof converter3DService>;
export function getConverter3DService(deps: ServiceContainer) {
  return deps.get<Converter3DService>(converter3DService.name);
}
