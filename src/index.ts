import "./bootstrap-otel.js"; // this must be at first position!
import "dotenv/config";
import fastifyToab from "@csi-foxbyte/fastify-toab";
import fastifyCors from "@fastify/cors";
import fastifyHelmet from "@fastify/helmet";
import fastifyMultipart from "@fastify/multipart";
import fastifySwagger from "@fastify/swagger";
import fastifySwaggerUi from "@fastify/swagger-ui";
import fastifyUnderPressure from "@fastify/under-pressure";
import Fastify from "fastify";
import json from "../package.json" with { type: "json" };
import { injectPinoLogger, loggerOptions } from "./lib/pino.js";
import { createBullBoard } from '@bull-board/api';
import {BullMQAdapter} from "@bull-board/api/bullMQAdapter";
import { FastifyAdapter } from '@bull-board/fastify';
import fastifyRateLimit from "@fastify/rate-limit"
import {FastifyOtelInstrumentation} from "@fastify/otel";

injectPinoLogger();

const fastify = await Fastify({
  logger: loggerOptions,
});

const fastifyOtel = new FastifyOtelInstrumentation();

await fastify.register(fastifyOtel.plugin(), {
  logLevel: "info",
});

// This is a workaround for an azure quirk where empty bodied responses are wrongly manipulated
fastify.addContentTypeParser(
  '*',
  { parseAs: 'buffer' },
  (req, body, done) => {
    // Treat zero-length as "no body"
    if (!body || body.length === 0) return done(null, null);

    // Optional: if header is missing but it looks like JSON, try parsing
    const ct = req.headers['content-type'] || '';
    if (!ct && body[0] === 0x7B /* '{' */) {
      try { return done(null, JSON.parse(body.toString('utf8'))); }
      catch { }
    }

    return done(null, body); // raw Buffer
  }
);

process.on("unhandledRejection", (reason) => {
  fastify.log.error({ err: reason, type: "UNHANDLED_REJECTION" });
});

fastify.register(fastifyHelmet, {});
fastify.register(fastifyRateLimit, {
  max: 500,
  timeWindow: "1 minute",
});
fastify.register(fastifyUnderPressure, {});
fastify.register(fastifyCors, {});

fastify.register(fastifyMultipart, {
  limits: {
    fileSize: 16_000_000, // 16 mb
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

const {getRegistries} = await import("./registries.js");

const registries = await getRegistries(process.env.WORKER_DISABLED === "true");

fastify.register(fastifyToab, {
  async getRegistries() {
    return registries;
  },
})

fastify.route({
  method: "GET",
  url: "/ping",
  handler: (_, reply) => {
    reply.send("OK");
  },
});

(async () => {
  try {
    const serverAdapter = new FastifyAdapter();

    createBullBoard({
      //@ts-expect-error wrong types here
      queues: Array.from(registries.workerRegistry.queues.values()).map(queue => new BullMQAdapter(queue)),
      serverAdapter,
    })

    serverAdapter.setBasePath("/bullMQ")

    fastify.register(serverAdapter.registerPlugin(), { prefix: "/bullMQ"});

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

