import { BlockBlobUploadStreamOptions } from "@azure/storage-blob";
import { ContextService, Service } from "@tganzhorn/fastify-modular";
import { Queue } from "bullmq";
import { Readable } from "node:stream";
import { BlobStorageService } from "../blobStorage/blobStorage.service.js";
import {
  Convert3DTilesJob,
  Convert3DTilesQueueName,
} from "./jobs/convert3DTiles.job.js";
import {
  ConvertProjectModelJob,
  ConvertProjectModelQueueName,
} from "./jobs/convertProjectModel.job.js";
import {
  ConvertTerrainJob,
  ConvertTerrainQueueName,
} from "./jobs/convertTerrain.job.js";
import { DbService } from "../db/db.service.js";
import { AuthService } from "../auth/auth.service.js";
import { ConfigurationService } from "../configuration/configuration.service.js";

@Service([
  BlobStorageService,
  ContextService,
  DbService,
  AuthService,
  ConfigurationService,
])
export class Converter3DService {
  constructor(
    private blobStorageService: BlobStorageService,
    private contextService: ContextService,
    private dbService: DbService,
    private authService: AuthService,
    private configurationService: ConfigurationService
  ) {}

  // #region project model
  private readonly projectModelUploadContainerName =
    "converter-project-model-upload";

  private _projectModelConverterQueue: Queue<
    ConvertProjectModelJob["data"],
    ConvertProjectModelJob["returnValue"]
  > | null = null;

  private get projectModelConverterQueue() {
    if (this._projectModelConverterQueue)
      return this._projectModelConverterQueue;

    this._projectModelConverterQueue = this.contextService.ctx.queues.get(
      ConvertProjectModelQueueName
    ) as Queue<
      ConvertProjectModelJob["data"],
      ConvertProjectModelJob["returnValue"]
    >;

    return this._projectModelConverterQueue;
  }

  async uploadProjectModel(file: Readable, fileName: string, srcSRS: string) {
    const { blobName } = await this.blobStorageService.uploadStream(
      file,
      this.projectModelUploadContainerName
    );

    await this.projectModelConverterQueue.add(
      blobName,
      {
        blobName,
        fileName,
        srcSRS,
        containerName: this.projectModelUploadContainerName,
      },
      {
        jobId: blobName,
      }
    );

    return { blobName };
  }

  async deleteProjectModelRemnants(blobName: string) {
    try {
      await this.blobStorageService.delete(
        this.projectModelUploadContainerName,
        blobName
      );
    } catch (e) {
      console.error(e);
    }
  }

  async getProjectModelStatus(blobName: string) {
    const job = await this.projectModelConverterQueue.getJob(blobName);

    if (!job) throw new Error(`There is no job with id ${blobName}!`);

    const state = await job.getState();

    if (state === "failed") throw new Error("Failed");

    if (state === "completed") {
      const { collectableBlobName, modelMatrix } = job.returnvalue;

      const file = await this.blobStorageService.downloadToBuffer(
        this.projectModelUploadContainerName,
        collectableBlobName
      );
      return {
        state,
        buffer64: file.toString("base64"),
        progress: Number(job.progress),
        modelMatrix,
      };
    }

    return { state, progress: Number(job.progress) };
  }

  // #endregion

  // #region terrain
  private readonly terrainUploadContainerName = "converter-terrain-upload";

  private _terrainConverterQueue: Queue<
    ConvertTerrainJob["data"],
    ConvertTerrainJob["returnValue"]
  > | null = null;

  private get terrainConverterQueue() {
    if (this._terrainConverterQueue) return this._terrainConverterQueue;

    this._terrainConverterQueue = this.contextService.ctx.queues.get(
      ConvertTerrainQueueName
    ) as Queue<ConvertTerrainJob["data"], ConvertTerrainJob["returnValue"]>;

    return this._terrainConverterQueue;
  }

  async uploadTerrain(
    stream: Readable,
    name: string,
    srcSRS: string,
    onProgress?: BlockBlobUploadStreamOptions["onProgress"]
  ) {
    const { id } = await this.dbService.subscriberClient.baseLayer.create({
      data: {
        name: name,
        sizeGB: 0,
        type: "TERRAIN",
        status: "PENDING",
        progress: 0,
        ownerId: (await this.authService.getSession())!.user.id,
      },
      select: {
        id: true,
      },
    });

    await this.blobStorageService.uploadStream(
      stream,
      this.terrainUploadContainerName,
      id,
      onProgress
    );

    const job = await this.terrainConverterQueue.add(id, {
      blobName: id,
      srcSRS,
      containerName: this.terrainUploadContainerName,
      localProcessorFolder: (
        await this.configurationService.getConfiguration()
      ).localProcessorFolder,
    });

    return { jobId: job.id! };
  }

  async getTerrainStatus(jobId: string) {
    const job = await this.terrainConverterQueue.getJob(jobId);

    if (!job) throw new Error(`There is no job with id ${jobId}!`);

    const state = await job.getState();

    if (state === "failed") throw new Error("Failed");

    return { state, progress: job.progress };
  }
  // #endregion

  //#region 3d tile
  private readonly tile3DUploadContainerName = "converter-tile-3d-upload";

  private _tile3DConverterQueue: Queue<
    Convert3DTilesJob["data"],
    Convert3DTilesJob["returnValue"]
  > | null = null;

  private get tile3DConverterQueue() {
    if (this._tile3DConverterQueue) return this._tile3DConverterQueue;

    this._tile3DConverterQueue = this.contextService.ctx.queues.get(
      Convert3DTilesQueueName
    ) as Queue<Convert3DTilesJob["data"], Convert3DTilesJob["returnValue"]>;

    return this._tile3DConverterQueue;
  }

  async upload3DTile(
    stream: Readable,
    name: string,
    srcSRS: string,
    onProgress?: BlockBlobUploadStreamOptions["onProgress"]
  ) {
    const { id } = await this.dbService.subscriberClient.baseLayer.create({
      data: {
        name: name,
        sizeGB: 0,
        type: "3D-TILES",
        status: "PENDING",
        progress: 0,
        ownerId: (await this.authService.getSession())!.user.id,
      },
      select: {
        id: true,
      },
    });

    await this.blobStorageService.uploadStream(
      stream,
      this.tile3DUploadContainerName,
      id,
      onProgress
    );

    const job = await this.tile3DConverterQueue.add(id, {
      blobName: id,
      srcSRS,
      containerName: this.tile3DUploadContainerName,
      localProcessorFolder: (
        await this.configurationService.getConfiguration()
      ).localProcessorFolder,
    });

    return { jobId: job.id! };
  }

  async get3DTileStatus(jobId: string) {
    const job = await this.tile3DConverterQueue.getJob(jobId);

    if (!job) throw new Error(`There is no job with id ${jobId}!`);

    const state = await job.getState();

    if (state === "failed") throw new Error("Failed");

    return { state, progress: job.progress };
  }
  // #endregion

  async updateBaseLayerStatus(
    id: string,
    progress: number,
    status: "PENDING" | "ACTIVE" | "FAILED" | "COMPLETED"
  ) {
    return await this.dbService.subscriberClient.baseLayer.update({
      where: {
        id,
      },
      data: {
        progress,
        status,
      },
    });
  }
}
