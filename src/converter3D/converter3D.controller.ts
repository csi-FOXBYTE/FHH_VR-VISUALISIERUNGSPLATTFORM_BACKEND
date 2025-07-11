import {
  Controller,
  Get,
  OnEvent,
  Post,
  Query,
  Rep,
  Req,
  Schema,
  Worker,
} from "@tganzhorn/fastify-modular";
import { FastifyReply, FastifyRequest } from "fastify";
import proj4list from "proj4-list";
import { BlobStorageService } from "../blobStorage/blobStorage.service.js";
import {
  GetProjectModelStatusResponseDTO,
  getProjectModelStatusResponseDTO,
  upload3DTileRequestDTO,
  uploadProjectModelRequestDTO,
  uploadProjectModelResponseDTO,
  uploadTerrainRequestDTO,
} from "./converter3D.dto.js";
import { Converter3DService } from "./converter3D.service.js";
import { Convert3DTilesQueueName } from "./jobs/convert3DTiles.job.js";
import {
  ConvertProjectModelJob,
  ConvertProjectModelQueueName,
} from "./jobs/convertProjectModel.job.js";
import {
  ConvertTerrainJob,
  ConvertTerrainQueueName,
} from "./jobs/convertTerrain.job.js";
import { Type } from "@sinclair/typebox";

@Controller("/converter3D", [Converter3DService, BlobStorageService])
export class Converter3DController {
  constructor(private converter3DService: Converter3DService) {}

  // #region project model

  @Schema({
    consumes: ["multipart/form-data"],
    body: uploadProjectModelRequestDTO,
    response: { 200: uploadProjectModelResponseDTO },
  })
  @Post("/uploadProjectModel", {
    validatorCompiler: () => () => ({ value: true }),
  })
  async uploadProjectModel(
    @Req() request: FastifyRequest,
    @Rep() reply: FastifyReply
  ) {
    let fileName = "";
    let epsgCode = "";

    for await (const part of request.parts()) {
      if (part.fieldname === "fileName" && part.type === "field")
        fileName = part.value as string;
      if (part.fieldname === "epsgCode" && part.type === "field")
        epsgCode = part.value as string;
      if (part.type === "file") {
        const srcSRS = proj4list[epsgCode][1];

        if (!srcSRS) {
          return reply.code(400).send({ message: "Epsg code not found!" });
        }

        return this.converter3DService.uploadProjectModel(
          part.file,
          fileName,
          srcSRS
        );
      }
    }

    throw new Error("Bad request");
  }

  @Schema({
    querystring: Type.Object({ blobName: Type.String() }),
    response: {
      200: getProjectModelStatusResponseDTO,
    },
  })
  @Get("/getProjectModelStatus")
  async getProjectModelStatus(
    @Query("blobName") blobName: string
  ): Promise<GetProjectModelStatusResponseDTO> {
    return await this.converter3DService.getProjectModelStatus(blobName);
  }

  @OnEvent(
    "failed",
    async (controller: Converter3DController, job: ConvertProjectModelJob) => {
      await controller.converter3DService.deleteProjectModelRemnants(
        job.data.blobName
      );
    }
  )
  @Worker(
    ConvertProjectModelQueueName,
    new URL("./workers/convertProjectModel.worker.js", import.meta.url),
    {
      concurrency: 2,
      useWorkerThreads: true,
      removeOnComplete: { count: 100, age: 3600 },
      removeOnFail: { count: 200, age: 24 * 3600 },
    }
  )
  async convertProjectModel() {}

  // #endregion

  // #region terrain

  @Schema({
    consumes: ["multipart/form-data"],
    body: uploadTerrainRequestDTO,
  })
  @Post("/uploadTerrain", {
    validatorCompiler: () => () => ({ value: true }),
  })
  async uploadTerrain(@Req() request: FastifyRequest) {
    let srcSRS: null | string = null;
    let name: null | string = null;
    for await (const part of request.parts()) {
      if (part.type === "field" && part.fieldname === "srcSRS")
        srcSRS = part.value as string;
      if (part.type === "field" && part.fieldname === "name")
        name = part.value as string;
      if (part.type === "file") {
        if (!srcSRS) throw new Error("No src srs provided!");
        if (!name) throw new Error("No name provided!");
        return await this.converter3DService.uploadTerrain(
          part.file,
          name,
          srcSRS
        );
      }
    }

    throw new Error("No file supplied!");
  }

  @OnEvent(
    "active",
    async (controller: Converter3DController, job: ConvertTerrainJob) => {
      await controller.converter3DService.updateBaseLayerStatus(
        job.data.blobName,
        0,
        "ACTIVE"
      );
    }
  )
  @OnEvent(
    "progress",
    async (controller: Converter3DController, job: ConvertTerrainJob) => {
      await controller.converter3DService.updateBaseLayerStatus(
        job.data.blobName,
        +job.progress.valueOf(),
        "ACTIVE"
      );
    }
  )
  @OnEvent(
    "completed",
    async (controller: Converter3DController, job: ConvertTerrainJob) => {
      await controller.converter3DService.updateBaseLayerStatus(
        job.data.blobName,
        1,
        "COMPLETED"
      );
    }
  )
  @OnEvent(
    "failed",
    async (controller: Converter3DController, job: ConvertTerrainJob) => {
      await controller.converter3DService.updateBaseLayerStatus(
        job.data.blobName,
        1,
        "FAILED"
      );
    }
  )
  @OnEvent(
    "stalled",
    async (controller: Converter3DController, job: ConvertTerrainJob) => {
      await controller.converter3DService.updateBaseLayerStatus(
        job.data.blobName,
        1,
        "FAILED"
      );
    }
  )
  @Worker(
    ConvertTerrainQueueName,
    new URL("./workers/convertTerrain.worker.js", import.meta.url),
    {
      concurrency: 1,
      useWorkerThreads: true,
      removeOnComplete: { count: 100, age: 3600 },
      removeOnFail: { count: 200, age: 24 * 3600 },
    }
  )
  async convertTerrain() {}

  // #endregion

  // #region 3d tile

  @Schema({
    consumes: ["multipart/form-data"],
    body: upload3DTileRequestDTO,
  })
  @Post("/upload3DTile", {
    validatorCompiler: () => () => ({ value: true }),
  })
  async upload3DTile(@Req() request: FastifyRequest) {
    let srcSRS: null | string = null;
    let name: null | string = null;
    for await (const part of request.parts()) {
      if (part.type === "field" && part.fieldname === "srcSRS")
        srcSRS = part.value as string;
      if (part.type === "field" && part.fieldname === "name")
        name = part.value as string;
      if (part.type === "file") {
        if (!srcSRS) throw new Error("No src srs provided!");
        if (!name) throw new Error("No name provided!");
        return await this.converter3DService.upload3DTile(
          part.file,
          name,
          srcSRS
        );
      }
    }

    throw new Error("No file supplied!");
  }

  @OnEvent(
    "active",
    async (controller: Converter3DController, job: ConvertProjectModelJob) => {
      await controller.converter3DService.updateBaseLayerStatus(
        job.data.blobName,
        0,
        "ACTIVE"
      );
    }
  )
  @OnEvent(
    "progress",
    async (controller: Converter3DController, job: ConvertProjectModelJob) => {
      await controller.converter3DService.updateBaseLayerStatus(
        job.data.blobName,
        +job.progress.valueOf(),
        "ACTIVE"
      );
    }
  )
  @OnEvent(
    "completed",
    async (controller: Converter3DController, job: ConvertProjectModelJob) => {
      await controller.converter3DService.updateBaseLayerStatus(
        job.data.blobName,
        1,
        "COMPLETED"
      );
    }
  )
  @OnEvent(
    "failed",
    async (controller: Converter3DController, job: ConvertProjectModelJob) => {
      await controller.converter3DService.updateBaseLayerStatus(
        job.data.blobName,
        1,
        "FAILED"
      );
    }
  )
  @OnEvent(
    "stalled",
    async (controller: Converter3DController, job: ConvertProjectModelJob) => {
      await controller.converter3DService.updateBaseLayerStatus(
        job.data.blobName,
        1,
        "FAILED"
      );
    }
  )
  @Worker(
    Convert3DTilesQueueName,
    new URL("./workers/convert3DTiles.worker.js", import.meta.url),
    {
      concurrency: 1,
      useWorkerThreads: true,
      removeOnComplete: { count: 100, age: 3600 },
      removeOnFail: { count: 200, age: 24 * 3600 },
    }
  )
  async convert3DTile() {}

  // #endregion
}
