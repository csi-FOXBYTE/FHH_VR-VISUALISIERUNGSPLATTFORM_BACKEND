import "dotenv";
import fastifyCors from "@fastify/cors";
import fastifyHelmet from "@fastify/helmet";
import fastifyMultipart from "@fastify/multipart";
import fastifyRateLimit, { } from "@fastify/rate-limit";
import fastifySwagger from "@fastify/swagger";
import fastifySwaggerUi from "@fastify/swagger-ui";
import fastifyUnderPressure from "@fastify/under-pressure";
import { registerControllers } from "@tganzhorn/fastify-modular";
import Fastify from "fastify";
import json from "../package.json" with { type: "json" };
import { registerAuth } from "./auth/index.js";
import { Converter3DController } from "./converter3D/converter3D.controller.js";
import { EventsController } from "./events/events.controller.js";
import { StatsController } from "./stats/stats.controller.js";
import { createCache } from "cache-manager";
import { injectPinoLogger, loggerOptions } from "./lib/pino.js";

injectPinoLogger();

const fastify = Fastify({
  logger: loggerOptions,
});

process.on("unhandledRejection", (reason) => {
  fastify.log.error({ err: reason, type: "UNHANDLED_REJECTION" });
});

fastify.register(fastifyHelmet, {});
fastify.register(fastifyRateLimit, {
  max: 50,
  timeWindow: "1 minute",
});
fastify.register(fastifyUnderPressure, {});
fastify.register(fastifyCors, {});

fastify.register(fastifyMultipart, {
  limits: {
    fileSize: 50_000_000_000, // 50 gb
    files: 10,
  },
});

fastify.register(fastifySwagger, {
  openapi: {
    openapi: "3.0.0",
    info: {
      title: "FHH VR - Backend API",
      description: "This is the backend api for the FHHVR Project.",
      version: json.version,
    },
    servers: [
      {
        url: "http://localhost:5000",
        description: "Development server",
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
});

fastify.register(fastifySwaggerUi, {
  routePrefix: "/docs",
  uiConfig: {
    docExpansion: "list",
    deepLinking: false,
  },
  staticCSP: true,
  transformSpecificationClone: true,
});

const cache = createCache();

registerControllers(fastify, { cache, controllers: [EventsController, Converter3DController, StatsController], bullMqConnection: {
  host: "localhost",
  port: 6379,
},});

fastify.route({
  method: "GET",
  url: "/ping",
  handler: (_, reply) => {
    reply.send("OK");
  },
});

(async () => {
  try {
    await registerAuth(fastify, cache);
    await fastify.ready();
    fastify.swagger();
    await fastify.listen({
      host: "0.0.0.0",
      port: parseInt(process.env.PORT!),
    });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
})();

