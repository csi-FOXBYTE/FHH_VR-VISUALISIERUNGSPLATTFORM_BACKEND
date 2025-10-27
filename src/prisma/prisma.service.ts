import { createService } from "@csi-foxbyte/fastify-toab";
import { PrismaClient } from "@prisma/client";
import realtimeExtension from "./extensions/realtimeExtension.js";

const prismaService = createService("prisma", async () => {
  const prisma = new PrismaClient().$extends(realtimeExtension());

  return prisma;
});

export default prismaService;
