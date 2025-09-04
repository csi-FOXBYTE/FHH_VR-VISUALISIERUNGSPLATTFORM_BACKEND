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

    return {
      async delete(id: string) {
        const baseLayer = await dbService.baseLayer.delete({
          where: {
            id,
          },
        });

        if (!baseLayer.containerName) return;

        await blobStorageService.deleteContainer(baseLayer.containerName);
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
    };
  },
  { scope: "REQUEST" }
);

export default baseLayerService;
