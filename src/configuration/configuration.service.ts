import {
  createService,
} from "@csi-foxbyte/fastify-toab";
import { getCacheService, getPrismaService } from "../@internals/index.js";

const configurationService = createService(
  "configuration",
  async ({ services }) => {
    const prismaService = await getPrismaService(services);

    const cacheService = await getCacheService(services);

    return {
      async getConfiguration() {
        return await cacheService.wrap(
          "__config__",
          async () => {
            const config = await prismaService.configuration.findFirstOrThrow();

            return config;
          },
          60_000
        ); // hold in cache for 1 minute
      },
    };
  },
  {
    buildTime: "INSTANT",
  }
);

export default configurationService;
