import { InstrumentationInput } from "@csi-foxbyte/fastify-toab";

export default async function ({ fastify }: InstrumentationInput) {
    fastify.log.info("[OTEL] Bootstrapping otel...")
    await import("./bootstrap-otel.js");
    fastify.log.info("[OTEL] Otel Bootstrapped!")
}