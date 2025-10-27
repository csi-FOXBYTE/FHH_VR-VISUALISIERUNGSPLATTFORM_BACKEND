import { createService } from "@csi-foxbyte/fastify-toab";

const statsService = createService("stats", async () => {
  return {};
});

export default statsService;
