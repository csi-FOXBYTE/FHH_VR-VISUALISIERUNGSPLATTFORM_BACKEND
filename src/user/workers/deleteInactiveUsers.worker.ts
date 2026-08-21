import { createWorker } from "@csi-foxbyte/fastify-toab";
import { Job } from "bullmq";
import { BullMQOtel } from "bullmq-otel";
import dayjs from "dayjs";
import defaultConnection from "../../connection.js";
import { getPrismaService } from "../../@internals/index.js";

const deleteInactiveUsersWorker = createWorker()
  .queue("{user-deleteInactiveUsers-queue}")
  .job<Job<void, void>>()
  .upsertJobScheduler("user-deleteInactiveUsers-jobScheduler", {
    pattern: "0 0 * * *",
  })
  .options({ telemetry: new BullMQOtel("bullmq") })
  .connection(defaultConnection)
  .processor(async (_, { services }) => {
    const prisma = await getPrismaService(services);
    const cutoff = dayjs().subtract(365, "day").toISOString();

    await prisma.ownershipAuditEvent.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });

    const users = await prisma.user.findMany({
      where: {
        createdAt: { lt: cutoff },
        sessions: { every: { updatedAt: { lt: cutoff } } },
      },
      select: { id: true },
    });

    let deleted = 0;
    let skippedOwnedContent = 0;
    for (const user of users) {
      const [projects, baseLayers, visualAxes, events] = await Promise.all([
        prisma.project.count({ where: { ownerId: user.id } }),
        prisma.baseLayer.count({ where: { ownerId: user.id } }),
        prisma.visualAxis.count({ where: { ownerId: user.id } }),
        prisma.event.count({ where: { ownerId: user.id } }),
      ]);
      if (projects + baseLayers + visualAxes + events > 0) {
        skippedOwnedContent += 1;
        continue;
      }
      await prisma.user.delete({ where: { id: user.id } });
      deleted += 1;
    }

    console.info({
      event: "inactive_user_cleanup_completed",
      candidates: users.length,
      deleted,
      skippedOwnedContent,
    });
  });

export default deleteInactiveUsersWorker;
