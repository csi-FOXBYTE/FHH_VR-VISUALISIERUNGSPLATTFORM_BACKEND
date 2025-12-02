import { createController } from "@csi-foxbyte/fastify-toab";
import { Type } from "@sinclair/typebox";
import {
  getBlobStorageService,
  getPrismaService,
} from "../@internals/index.js";

const publicController = createController().rootPath("/public");

publicController
  .addRoute("GET", "/visualAxes")
  .output(
    Type.Array(
      Type.Object({
        name: Type.String(),
        id: Type.String(),
        description: Type.String(),
        startPoint: Type.Object({
          x: Type.Number(),
          y: Type.Number(),
          z: Type.Number(),
        }),
        endPoint: Type.Object({
          x: Type.Number(),
          y: Type.Number(),
          z: Type.Number(),
        }),
      })
    )
  )
  .handler(async ({ services }) => {
    const prisma = await getPrismaService(services);

    const result = await prisma.visualAxis.findMany({
      select: {
        startPointX: true,
        startPointY: true,
        startPointZ: true,
        endPointX: true,
        endPointY: true,
        endPointZ: true,
        id: true,
        name: true,
        description: true,
      },
    });

    return result.map((r) => ({
      description: r.description,
      name: r.name,
      id: r.id,
      startPoint: {
        x: r.startPointX,
        y: r.startPointY,
        z: r.startPointZ,
      },
      endPoint: {
        x: r.endPointX,
        y: r.endPointY,
        z: r.endPointZ,
      },
    }));
  });

publicController
  .addRoute("GET", "/baseLayer/list")
  .output(
    Type.Array(
      Type.Object({
        id: Type.String(),
        name: Type.String(),
        href: Type.String(),
        type: Type.String(),
        description: Type.String(),
      })
    )
  )
  .handler(async ({ services }) => {
    const prismaService = await getPrismaService(services);
    const blobStorageService = await getBlobStorageService(services);

    function createBaseLayerHref(baseLayer: {
      type: string;
      containerName: string;
    }) {
      const url = blobStorageService.getContainerReadSASUrl(
        baseLayer.containerName
      );

      if (baseLayer.type === "TILES3D") {
        const newUrl = new URL(url);

        return `${newUrl.protocol}//${newUrl.host}${newUrl.pathname}/tileset.json${newUrl.search}`;
      } else {
        return url;
      }
    }

    const baseLayers = await prismaService.baseLayer.findMany({
      where: {
        isPublic: true,
      },
    });

    return baseLayers.map((baseLayer) => ({
      name: baseLayer.name,
      description: baseLayer.description,
      id: baseLayer.id,
      type: baseLayer.type,
      href: baseLayer.containerName
        ? createBaseLayerHref({
            containerName: baseLayer.containerName,
            type: baseLayer.type,
          })
        : baseLayer.href!,
    }));
  });

export default publicController;
