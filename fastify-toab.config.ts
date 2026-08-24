import {
  defineConfig,
  type FastifyToabConfigOptions,
} from "@csi-foxbyte/fastify-toab";
import { FastifyOtelInstrumentation } from "@fastify/otel";
import json from "./package.json" with { type: "json" };
import { globalOrderMiddleware } from "./src/globalMiddlewares/middleWare.js";
import { Type } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import { ownershipRouteErrorHandler } from "./src/user/ownershipRouteError.js";

const server: NonNullable<FastifyToabConfigOptions["server"]> = {
  fastify: {
    listen: {
      host: "0.0.0.0",
      port: 3000,
    },
  },
  disableWorkers: process.env.WORKER_DISABLED === "true",
};

export const rolldown: NonNullable<FastifyToabConfigOptions["rolldown"]> = {
  external: [
    "sharp",
    "sqlite3",
    "gdal-async",
    "@csi-foxbyte/cityjson-to-3d-tiles",
    "@csi-foxbyte/mesh-dem-to-terrain",
    "7zip-min",
    "assimpjs",
    "draco3dgltf",
  ],
};

export default defineConfig({
  onRouteError: ownershipRouteErrorHandler,
  rolldown,
  env: Type.Object({
    PORT: Type.String(),
    APPLICATIONINSIGHTS_CONNECTION_STRING: Type.Optional(Type.String()),
    REDIS_CONNECTION_STRING: Type.String(),
    REDIS_IS_CLUSTER: Type.Optional(Type.String()),
    AUTH_SECRET: Type.String(),
    AZURE_STORAGE_CONNECTION_STRING: Type.String(),
    WORKER_DISABLED: Type.Optional(Type.String()),
    DATABASE_URL: Type.String(),
  }),
  fastify: ({ isDev }) => ({
    swagger: {
      enabled: true,
      openapi: {
        openapi: "3.0.0",
        info: {
          title: "FHH VR - Backend API",
          description: "This is the backend api for the FHHVR Project.",
          version: json.version,
        },
        servers: [
          {
            url: "/",
            description: "Current server",
          },
        ],
        components: {
          securitySchemes: {
            bearerAuth: {
              type: "http",
              scheme: "bearer",
              bearerFormat: "JWT",
            },
          },
        },
        security: [],
      },
    },
    swaggerUi: {
      enabled: true,
      routePrefix: "/docs",
      uiConfig: {
        docExpansion: "list",
        deepLinking: false,
      },
      staticCSP: true,
      transformSpecificationClone: true,
    },
    rateLimit: {
      enabled: true,
      max: 500,
      timeWindow: "1 minute",
    },
    multipart: {
      enabled: true,
      limits: {
        fileSize: 16_000_000, // 16 mb
        files: 10,
      },
    },
    bullBoard: {
      enabled: isDev,
    }
  }),
  server,
  rootDir: "src",
  globalMiddlewares: [globalOrderMiddleware],
  onPreStart: async (fastify: FastifyInstance): Promise<void> => {
    fastify.get("/ping", async () => "OK");

    const fastifyOtel = new FastifyOtelInstrumentation();

    await fastify.register(fastifyOtel.plugin(), {
      logLevel: "info",
    });

    // This is a workaround for an azure quirk where empty bodied responses are wrongly manipulated
    fastify.addContentTypeParser(
      "*",
      { parseAs: "buffer" },
      (req, body, done) => {
        // Treat zero-length as "no body"
        if (!body || body.length === 0) return done(null, null);

        // Optional: if header is missing but it looks like JSON, try parsing
        const ct = req.headers["content-type"] || "";
        if (!ct && body[0] === 0x7b /* '{' */) {
          try {
            return done(null, JSON.parse(body.toString("utf8")));
          } catch { }
        }

        return done(null, body); // raw Buffer
      },
    );
  },
});
