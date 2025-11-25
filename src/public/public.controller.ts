import { createController } from "@csi-foxbyte/fastify-toab";
import { Type } from "@sinclair/typebox";
import {
  getBlobStorageService,
  getConverter3DService,
  getPrismaService,
} from "../@internals/index.js";

const publicController = createController().rootPath("/public");

publicController
  .addRoute("GET", "/obliterate3DTiles")
  .output(Type.String())
  .handler(async ({ services }) => {
    const s = await getConverter3DService(services);

    await s.obliterate3DTilesQueue(); // TODO ONLY FOR DEBUGGING REMOVE THIS!!!!

    return "Obliterated";
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
