import { createService } from "@csi-foxbyte/fastify-toab";
import { $Enums } from "@prisma/client";
import {
  getAuthService,
  getBlobStorageService,
  getDbService,
} from "../@internals/index.js";

const baseLayerService = createService(
  "baseLayer",
  async ({ services }) => {
    const dbService = await getDbService(services);
    const blobStorageService = await getBlobStorageService(services);
    const authService = await getAuthService(services);

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

    return {
      async delete(id: string) {
        const baseLayer = await dbService.baseLayer.delete({
          where: {
            id,
          },
        });

        if (!baseLayer.containerName) return;
        try {
          await blobStorageService.deleteContainer(baseLayer.containerName);
        } catch {}
      },
      createBaseLayerHref,
      async list() {
        const baseLayers = await dbService.baseLayer.findMany();

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
      },
      async listChanges(lastQueryTime: number) {
        const time = new Date(lastQueryTime);

        const baseLayers = await dbService.baseLayer.findMany({
          where: {
            OR: [
              {
                updatedAt: {
                  gt: time,
                },
              },
              {
                createdAt: {
                  gt: time,
                },
              },
            ],
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
      },
      async add(href: string, name: string, type: $Enums.LAYER_TYPE) {
        const session = await authService.getSession();

        if (!session) throw new Error("User has no session!");

        await dbService.baseLayer.create({
          data: {
            name,
            sizeGB: 0,
            type,
            href,
            owner: {
              connect: {
                id: session.user.id,
              },
            },
          },
        });
      },
      async update(
        id: string,
        href: string | null,
        visibleForGroups: string[],
        isPublic: boolean
      ) {
        const session = await authService.getSession();

        if (!session) throw new Error("User has no session!");

        await dbService.baseLayer.update({
          where: {
            id,
          },
          data: {
            href,
            isPublic,
            visibleForGroups: {
              set: visibleForGroups.map((v) => ({ id: v })),
            },
          },
        });
      },
    };
  },
  { scope: "REQUEST" }
);

export default baseLayerService;
