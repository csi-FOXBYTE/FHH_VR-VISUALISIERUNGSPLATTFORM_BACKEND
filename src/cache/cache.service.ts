import {
  createService,
} from "@csi-foxbyte/fastify-toab";
import { createKeyv as createKeyvRedis } from "@keyv/redis";
import { createCache } from "cache-manager";
import { createKeyv } from "cacheable";

const cacheService = createService(
  "cache",
  async () => {
    const redisStore = createKeyvRedis(process.env.REDIS_CONNECTION_STRING, {
      throwOnConnectError: true,
    });

    const memoryStore = createKeyv({
      ttl: "1h",
      useClone: true,
      lruSize: 1_000,
    });

    const cache = createCache({
      stores: [memoryStore as any, redisStore],
    });

    return cache;
  },
  { buildTime: "INSTANT" }
);

export default cacheService;
