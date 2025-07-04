import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Rep,
  Schema,
} from "@tganzhorn/fastify-modular";
import { FastifyReply } from "fastify";
import proj4list from "proj4-list";
import { BlobStorageService } from "../blobStorage/blobStorage.service.js";
import { StorageQueueService } from "../storageQueue/storageQueue.service.js";
import {
  UploadProjectObjectRequestDTO,
  uploadProjectObjectRequestDTO,
  uploadProjectObjectResponseDTO,
} from "./converter3D.dto.js";
import { Converter3DService } from "./converter3D.service.js";

@Controller("/converter3D", [
  Converter3DService,
  BlobStorageService,
  StorageQueueService,
])
export class Converter3DController {
  constructor(private converter3DService: Converter3DService) {}

  @Post("/upload")
  @Schema({
    // @ts-ignore
    consumes: ["multipart/form-data"],
    body: uploadProjectObjectRequestDTO,
    response: {
      200: uploadProjectObjectResponseDTO,
    },
  })
  async upload(
    @Body() body: UploadProjectObjectRequestDTO,
    @Rep() reply: FastifyReply
  ) {
    const file = Buffer.from(body.file);
    const fileName = body.fileName;
    const epsgCode = body.epsgCode;

    const srcSRS = proj4list[epsgCode][1];

    if (!srcSRS)
      return reply.code(400).send({ message: "Epsg code not found!" });

    try {
      const result = await this.converter3DService.upload(
        file,
        fileName,
        srcSRS
      );

      this.converter3DService.checkForConvertable();

      return result;
    } catch (e) {
      console.error(e);
      return "WRONG";
    }
  }

  @Get("/collect")
  async collect(@Query("blobName") blobName: string) {
    return await this.converter3DService.collect(blobName);
  }
}
