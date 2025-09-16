import { createService } from "@csi-foxbyte/fastify-toab";
import { Readable } from "node:stream";
import {
  getAuthService,
  getBlobStorageService,
  getConfigurationService,
  getConverter3DConvert3DTilesWorkerQueue,
  getConverter3DConvertProjectModelWorkerQueue,
  getConverter3DConvertTerrainWorkerQueue,
  getPrismaService,
} from "../@internals/index.js";

const converter3DService = createService(
  "converter3D",
  async ({ queues, services }) => {
    const tile3DConverterQueue =
      getConverter3DConvert3DTilesWorkerQueue(queues);
    const projectModelConverterQueue =
      getConverter3DConvertProjectModelWorkerQueue(queues);
    const terrainConverterQueue =
      getConverter3DConvertTerrainWorkerQueue(queues);
    const prismaService = await getPrismaService(services);
    const blobStorageService = await getBlobStorageService(services);
    const configurationService = await getConfigurationService(services);

    const projectModel = {
      async convertProjectModel(
        token: string,
        fileName: string,
        srcSRS: string
      ) {
        const { blobName, containerName } =
          await blobStorageService.verifyUploadToken(token);

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
      async convertTerrain(token: string, name: string, srcSRS: string) {
        const authService = await getAuthService(services);

        const { blobName, containerName } =
          await blobStorageService.verifyUploadToken(token);

        const { id } = await prismaService.baseLayer.create({
          data: {
            name: name,
            sizeGB: 0,
            type: "TERRAIN",
            status: "PENDING",
            progress: 0,
            containerName: containerName,
            ownerId: (await authService.getSession())!.user.id,
          },
          select: {
            id: true,
          },
        });

        const job = await terrainConverterQueue.add(id, {
          blobName,
          id,
          threadCount: 4,
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
      async convert3DTile(token: string, name: string, srcSRS: string, appearance: string) {
        const authService = await getAuthService(services);

        const { blobName, containerName } =
          await blobStorageService.verifyUploadToken(token);

        const { id } = await prismaService.baseLayer.create({
          data: {
            name: name,
            sizeGB: 0,
            type: "TILES3D",
            status: "PENDING",
            progress: 0,
            containerName: containerName,
            ownerId: (await authService.getSession())!.user.id,
          },
          select: {
            id: true,
          },
        });

        const job = await tile3DConverterQueue.add(id, {
          blobName,
          srcSRS,
          threadCount: 4,
          id,
          appearance,
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
        return await prismaService.baseLayer.update({
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

export default converter3DService;
