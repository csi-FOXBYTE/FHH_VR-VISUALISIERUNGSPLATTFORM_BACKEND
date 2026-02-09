import { createService } from "@csi-foxbyte/fastify-toab";
import { Readable } from "node:stream";
import {
  getAuthService,
  getBlobStorageService,
  getConfigurationService,
  getConverter3DConvert3DTilesWorker,
  getConverter3DConvert3DTilesWorkerQueue,
  getConverter3DConvertProjectModelWorkerQueue,
  getConverter3DConvertTerrainWorkerQueue,
  getConverter3DConvertWMSWMTSWorkerQueue,
  getPrismaService,
} from "../@internals/index.js";

const converter3DService = createService(
  "converter3D",
  async ({ queues, services, workers }) => {
    const tile3DConverterQueue =
      getConverter3DConvert3DTilesWorkerQueue(queues);
    const projectModelConverterQueue =
      getConverter3DConvertProjectModelWorkerQueue(queues);
    const terrainConverterQueue =
      getConverter3DConvertTerrainWorkerQueue(queues);
    const convertWMSWMTSWorkerQueue =
      getConverter3DConvertWMSWMTSWorkerQueue(queues);
    const prismaService = await getPrismaService(services);
    const blobStorageService = await getBlobStorageService(services);
    const configurationService = await getConfigurationService(services);

    const projectModel = {
      async convertProjectModel(
        token: string,
        fileName: string,
        srcSRS: string,
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
          24 * 60 * 60 * 1000,
        );

        return { jobId: job.id!, secret: job.data.secret };
      },

      async obliterate3DTilesQueue() {
        await tile3DConverterQueue.obliterate({ force: true });
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
        secret: string,
      ) {
        const job = await projectModelConverterQueue.getJob(jobId);

        if (!job || job.data.secret !== secret)
          throw new Error(`There is no job with id ${jobId}!`);

        const { collectableBlobName } = job.returnvalue;

        const stream = await blobStorageService.downloadToStream(
          job.data.containerName,
          collectableBlobName,
        );

        const { href } = await blobStorageService.uploadStream(
          stream.readableStreamBody as Readable,
          `project-${projectId}`,
        );

        return { href };
      },
    };

    const terrain = {
      async convertTerrain(
        token: string,
        name: string,
        srcSRS: string,
        ownerId: string,
      ) {
        const { blobName, containerName } =
          await blobStorageService.verifyUploadToken(token);

        const { id } = await prismaService.baseLayer.create({
          data: {
            name: name,
            sizeGB: 0,
            type: "TERRAIN",
            status: "PENDING",
            progress: 0,
            ownerId,
          },
          select: {
            id: true,
          },
        });

        await prismaService.baseLayer.update({
          where: { id },
          data: {
            containerName: `terrain-${id}`,
          },
        });

        const job = await terrainConverterQueue.add(id, {
          blobName,
          id,
          threadCount: (await configurationService.getConfiguration())
            .usedTerrainConversionThreads,
          srcSRS,
          containerName,
          localProcessorFolder: (await configurationService.getConfiguration())
            .localProcessorFolder,
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
      async convert3DTile(
        token: string,
        name: string,
        srcSRS: string,
        appearance: string,
        hasAlphaEnabled: boolean,
        ownerId: string,
      ) {
        const { blobName, containerName } =
          await blobStorageService.verifyUploadToken(token);

        const { id } = await prismaService.baseLayer.create({
          data: {
            name: name,
            sizeGB: 0,
            type: "TILES3D",
            status: "PENDING",
            progress: 0,
            containerName: null,
            ownerId,
          },
          select: {
            id: true,
          },
        });

        await prismaService.baseLayer.update({
          where: {
            id,
          },
          data: {
            containerName: `tileset-${id}`,
          },
        });

        const job = await tile3DConverterQueue.add(id, {
          blobName,
          srcSRS,
          threadCount: (await configurationService.getConfiguration())
            .used3DTileConversionThreads,
          id,
          hasAlphaEnabled,
          appearance,
          containerName,
          localProcessorFolder: (await configurationService.getConfiguration())
            .localProcessorFolder,
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

    const wmsWmts = {
      async convertWMSWMTS(
        name: string,
        url: string,
        layer: string,
        startZoom: number,
        endZoom: number,
      ) {
        const { id } = await prismaService.baseLayer.create({
          data: {
            name,
            sizeGB: 0,
            type: "IMAGERY",
            status: "ACTIVE",
            progress: 0,
          },
        });

        const containerName = `imagery-${id}`;

        await prismaService.baseLayer.update({
          where: {
            id,
          },
          data: {
            containerName,
          },
        });

        const job = await convertWMSWMTSWorkerQueue.add(id, {
          url,
          layer,
          startZoom,
          endZoom,
          containerName,
          id,
        });

        return { jobId: job.id! };
      },
    };

    return {
      ...projectModel,
      ...terrain,
      ...tile3D,
      ...wmsWmts,
      async updateBaseLayerStatus(
        id: string,
        progress: number,
        status: "PENDING" | "ACTIVE" | "FAILED" | "COMPLETED",
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
  },
);

export default converter3DService;
