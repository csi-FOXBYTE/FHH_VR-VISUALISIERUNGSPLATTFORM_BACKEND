import { createController } from "@csi-foxbyte/fastify-toab";
import {
  downloadProjectModelRequestDTIO,
  getProjectModelStatusRequestDTO,
  getProjectModelStatusResponseDTO,
  convert3DTileRequestDTO,
  convert3DTileResponseDTO,
  convertTerrainRequestDTO,
  convertTerrainResponseDTO,
  convertProjectModelRequestDTO,
  convertProjectModelResponseDTO,
} from "./converter3D.dto.js";
import { authMiddleware } from "../auth/auth.middleware.js";
import { Type } from "@sinclair/typebox";
import proj4list from "proj4-list";
import {
  getBlobStorageService,
  getConverter3DService,
} from "../@internals/index.js";

const converter3DController = createController()
  .use(authMiddleware)
  .rootPath("/converter3D");

converter3DController
  .addRoute("POST", "/convertProjectModel")
  .body(convertProjectModelRequestDTO)
  .output(convertProjectModelResponseDTO)
  .handler(async ({ services, body }) => {
    const converter3DService = await getConverter3DService(services);

    const srcSRS = proj4list[body.epsgCode][1];

    if (!srcSRS) throw new Error("No valid epsgcode supplied!");

    return await converter3DService.convertProjectModel(
      body.token,
      body.fileName,
      body.epsgCode
    );
  });

converter3DController
  .addRoute("POST", "/getProjectModelStatus")
  .body(getProjectModelStatusRequestDTO)
  .output(getProjectModelStatusResponseDTO)
  .handler(async ({ body, services }) => {
    const converter3DService = await getConverter3DService(services);

    return await converter3DService.getProjectModelStatus(
      body.jobId,
      body.secret
    );
  });

converter3DController
  .addRoute("POST", "/downloadProjectModel")
  .body(downloadProjectModelRequestDTIO)
  .output(Type.Object({ href: Type.String() }))
  .handler(async ({ body, services }) => {
    const converter3DService = await getConverter3DService(services);

    const { href } = await converter3DService.downloadProjectModel(
      body.jobId,
      body.projectId,
      body.secret
    );

    return { href };
  });

converter3DController
  .addRoute("POST", "/convertTerrain")
  .body(convertTerrainRequestDTO)
  .output(convertTerrainResponseDTO)
  .handler(async ({ services, body }) => {
    const converter3DService = await getConverter3DService(services);

    return await converter3DService.convertTerrain(
      body.token,
      body.name,
      body.srcSRS
    );
  });

converter3DController
  .addRoute("POST", "/convert3DTile")
  .body(convert3DTileRequestDTO)
  .output(convert3DTileResponseDTO)
  .handler(async ({ services, body }) => {
    const converter3DService = await getConverter3DService(services);

    return await converter3DService.convert3DTile(
      body.token,
      body.name,
      body.srcSRS,
      body.appearance
    );
  });

converter3DController
  .addRoute("GET", "/getUploadToken")
  .output(Type.String())
  .handler(async ({ services }) => {
    const blobStorageService = await getBlobStorageService(services);

    return await blobStorageService.createUploadToken("upload-special");
  });

converter3DController
  .addRoute("POST", "/commitUpload")
  .body(
    Type.Object({
      token: Type.String(),
    })
  )
  .output(Type.Boolean())
  .handler(async ({ services, body }) => {
    const blobStorageService = await getBlobStorageService(services);

    await blobStorageService.commitBlock(body.token);

    return true;
  });

converter3DController
  .addRoute("POST", "/uploadBlock")
  .body(
    Type.Object({
      block: Type.String({ format: "binary" }),
      total: Type.String(),
      index: Type.String(),
      token: Type.String(),
    })
  )
  .output(Type.Boolean())
  .handler(
    async ({ services, request }) => {
      const blobStorageService = await getBlobStorageService(services);

      let block: Buffer | null = null;
      let token: string | null = null;

      let total: number | null = null;
      let index: number | null = null;

      for await (const part of request.parts()) {
        if (part.type === "file") {
          if (part.fieldname === "block") {
            block = await part.toBuffer();
          }
        } else {
          const { fieldname, value } = part;

          if (fieldname === "total") total = parseInt(String(value), 10);
          if (fieldname === "token") token = String(value);
          if (fieldname === "index") index = parseInt(String(value), 10);
        }
      }
      if (block === null || token === null || total === null || index === null)
        throw new Error("Not all parts supplied!");

      const blockId = Buffer.from(String(index).padStart(8, "0")).toString(
        "base64"
      );

      await blobStorageService.stageBlock(block, token, blockId);

      return true;
    },
    {
      schema: { consumes: ["multipart/form-data"] },
      validatorCompiler: () => () => ({ value: true }),
    }
  );

export default converter3DController;
