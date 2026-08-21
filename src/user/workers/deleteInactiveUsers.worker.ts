import { createWorker } from "@csi-foxbyte/fastify-toab";
import { Job } from "bullmq";
import { BullMQOtel } from "bullmq-otel";
import dayjs from "dayjs";
import { Prisma } from "@prisma/client";
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
      const result = await prisma.$transaction(
        async (tx) => {
          const lockedUser = await tx.$queryRaw<Array<{ id: string }>>`
            SELECT "id" FROM "User" WHERE "id" = ${user.id} FOR UPDATE
          `;
          if (lockedUser.length === 0) return "missing" as const;
          const [projects, baseLayers, visualAxes, events] = await Promise.all([
            tx.project.count({ where: { ownerId: user.id } }),
            tx.baseLayer.count({ where: { ownerId: user.id } }),
            tx.visualAxis.count({ where: { ownerId: user.id } }),
            tx.event.count({ where: { ownerId: user.id } }),
          ]);
          if (projects + baseLayers + visualAxes + events > 0) {
            return "owned-content" as const;
          }
          await tx.user.delete({ where: { id: user.id } });
          return "deleted" as const;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      if (result === "owned-content") {
        skippedOwnedContent += 1;
        continue;
      }
      if (result === "deleted") deleted += 1;
    }

    console.info({
      event: "inactive_user_cleanup_completed",
      candidates: users.length,
      deleted,
      skippedOwnedContent,
    });
  });

export default deleteInactiveUsersWorker;
