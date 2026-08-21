import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import {
  createService,
  GenericRouteError,
} from "@csi-foxbyte/fastify-toab";
import {
  getAuthService,
  getConfigurationService,
  getNotificationService,
  getPrismaService,
  getTranslationService,
} from "../@internals/index.js";
import dayjs from "dayjs";
import {
  getDeletionImpactWithClient,
  hasUserAdministratorPermission,
  ownershipAuditData,
  ownershipEntityTypes,
  requiredSuccessorPermissions,
  type OwnershipCountClient,
  type OwnershipEntityType,
  type OwnershipSuccessors,
} from "./ownership.js";

type OwnershipClient = Pick<
  Prisma.TransactionClient,
  "project" | "baseLayer" | "visualAxis" | "event" | "user"
>;

function asOwnershipClient(client: unknown): OwnershipClient {
  return client as OwnershipClient;
}

function asOwnershipCountClient(client: unknown): OwnershipCountClient {
  return client as OwnershipCountClient;
}

const userService = createService(
  "user",
  async ({ services }) => {
    const prismaService = await getPrismaService(services);
    const authService = await getAuthService(services);
    const notificationService = await getNotificationService(services);
    const translationService = await getTranslationService(services);
    const configService = await getConfigurationService(services);

    async function requireUserAdministrator() {
      const session = await authService.getSession();
      if (!session) {
        throw new GenericRouteError("UNAUTHORIZED", "ACCESS_DENIED");
      }
      const roles = session.user.assignedGroups.flatMap(
        (group) => group.assignedRoles,
      );
      const permitted = hasUserAdministratorPermission(roles);
      if (!permitted) {
        throw new GenericRouteError("FORBIDDEN", "USER_ADMINISTRATOR_REQUIRED");
      }
      return session;
    }

    async function validateSuccessor(
      client: OwnershipClient,
      type: OwnershipEntityType,
      successorId: string,
      previousOwnerId?: string,
    ) {
      if (successorId === previousOwnerId) {
        throw new GenericRouteError(
          "BAD_REQUEST",
          "SUCCESSOR_MUST_DIFFER_FROM_PREVIOUS_OWNER",
        );
      }
      const successor = await client.user.findFirst({
        where: {
          id: successorId,
          assignedGroups: {
            some: {
              assignedRoles: {
                some: {
                  OR: [
                    { isAdminRole: true },
                    {
                      assignedPermissions: {
                        hasSome: requiredSuccessorPermissions[type],
                      },
                    },
                  ],
                },
              },
            },
          },
        },
        select: { id: true },
      });
      if (!successor) {
        throw new GenericRouteError(
          "BAD_REQUEST",
          `INVALID_SUCCESSOR_FOR_${type}`,
        );
      }
    }

    async function getDeletionImpact(userId: string) {
      await requireUserAdministrator();
      await prismaService.user.findUniqueOrThrow({
        where: { id: userId },
        select: { id: true },
      });
      return getDeletionImpactWithClient(
        asOwnershipCountClient(prismaService),
        userId,
      );
    }

    async function getOwnershipSuccessors(
      type: OwnershipEntityType,
      excludedUserId?: string,
    ) {
      await requireUserAdministrator();
      return prismaService.user.findMany({
        where: {
          ...(excludedUserId ? { id: { not: excludedUserId } } : {}),
          assignedGroups: {
            some: {
              assignedRoles: {
                some: {
                  OR: [
                    { isAdminRole: true },
                    {
                      assignedPermissions: {
                        hasSome: requiredSuccessorPermissions[type],
                      },
                    },
                  ],
                },
              },
            },
          },
        },
        orderBy: [{ name: "asc" }, { id: "asc" }],
        select: { id: true, name: true, email: true },
      });
    }

    async function getDeletionSuccessors(
      userId: string,
      type: OwnershipEntityType,
    ) {
      return getOwnershipSuccessors(type, userId);
    }

    async function transferAndDelete(
      userId: string,
      successors: OwnershipSuccessors,
    ) {
      const session = await requireUserAdministrator();
      if (session.user.id === userId) {
        throw new GenericRouteError(
          "FORBIDDEN",
          "USE_SELF_DELETION_FOR_CURRENT_USER",
        );
      }
      const correlationId = randomUUID();

      const impact = await prismaService.$transaction(
        async (tx) => {
          await tx.user.findUniqueOrThrow({
            where: { id: userId },
            select: { id: true },
          });
          const currentImpact = await getDeletionImpactWithClient(
            asOwnershipCountClient(tx),
            userId,
          );
          const counts: Record<OwnershipEntityType, number> = {
            PROJECT: currentImpact.projects,
            BASE_LAYER: currentImpact.baseLayers,
            VISUAL_AXIS: currentImpact.visualAxes,
            EVENT: currentImpact.events,
          };

          for (const type of ownershipEntityTypes) {
            if (counts[type] === 0) continue;
            const successorId = successors[type];
            if (!successorId) {
              throw new GenericRouteError(
                "BAD_REQUEST",
                `SUCCESSOR_REQUIRED_FOR_${type}`,
                currentImpact,
              );
            }
            await validateSuccessor(
              asOwnershipClient(tx),
              type,
              successorId,
              userId,
            );
          }

          const updates = {
            PROJECT: () =>
              tx.project.updateMany({
                where: { ownerId: userId },
                data: { ownerId: successors.PROJECT },
              }),
            BASE_LAYER: () =>
              tx.baseLayer.updateMany({
                where: { ownerId: userId },
                data: { ownerId: successors.BASE_LAYER },
              }),
            VISUAL_AXIS: () =>
              tx.visualAxis.updateMany({
                where: { ownerId: userId },
                data: { ownerId: successors.VISUAL_AXIS },
              }),
            EVENT: () =>
              tx.event.updateMany({
                where: { ownerId: userId },
                data: { ownerId: successors.EVENT },
              }),
          } satisfies Record<OwnershipEntityType, () => Promise<unknown>>;

          for (const type of ownershipEntityTypes) {
            if (counts[type] === 0) continue;
            await updates[type]();
            await tx.ownershipAuditEvent.create({
              data: ownershipAuditData({
                correlationId,
                action: "USER_TRANSFER_AND_DELETE",
                entityType: type,
                entityCount: counts[type],
                actorUserId: session.user.id,
                previousOwnerId: userId,
                newOwnerId: successors[type]!,
              }),
            });
          }

          await tx.user.delete({ where: { id: userId } });
          return currentImpact;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );

      return { correlationId, impact };
    }

    async function deleteSelf(userId: string) {
      const impact = await getDeletionImpactWithClient(
        asOwnershipCountClient(prismaService),
        userId,
      );
      if (!impact.canDelete) {
        throw new GenericRouteError(
          "BAD_REQUEST",
          "OWNED_CONTENT_REQUIRES_ADMINISTRATIVE_TRANSFER",
          impact,
        );
      }
      await prismaService.user.delete({ where: { id: userId } });
    }

    async function getOwnershipPreflight() {
      await requireUserAdministrator();
      const [projects, baseLayers, visualAxes, events, invalidRows] = await Promise.all([
        prismaService.project.count({ where: { ownerId: null } }),
        prismaService.baseLayer.count({ where: { ownerId: null } }),
        prismaService.visualAxis.count({ where: { ownerId: null } }),
        prismaService.event.count({ where: { ownerId: null } }),
        prismaService.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
          SELECT (
            (SELECT COUNT(*) FROM "Project" p LEFT JOIN "User" u ON u."id" = p."ownerId"
              WHERE p."ownerId" IS NOT NULL AND u."id" IS NULL) +
            (SELECT COUNT(*) FROM "BaseLayer" b LEFT JOIN "User" u ON u."id" = b."ownerId"
              WHERE b."ownerId" IS NOT NULL AND u."id" IS NULL) +
            (SELECT COUNT(*) FROM "VisualAxis" v LEFT JOIN "User" u ON u."id" = v."ownerId"
              WHERE v."ownerId" IS NOT NULL AND u."id" IS NULL) +
            (SELECT COUNT(*) FROM "Event" e LEFT JOIN "User" u ON u."id" = e."ownerId"
              WHERE e."ownerId" IS NOT NULL AND u."id" IS NULL)
          )::bigint AS "count"
        `),
      ]);
      const total = projects + baseLayers + visualAxes + events;
      const invalidReferences = Number(invalidRows[0]?.count ?? 0);
      return {
        projects,
        baseLayers,
        visualAxes,
        events,
        total,
        invalidReferences,
        readyForReleaseB: total === 0 && invalidReferences === 0,
      };
    }

    async function repairOrphanedOwnership(successors: OwnershipSuccessors) {
      const session = await requireUserAdministrator();
      const correlationId = randomUUID();
      const repaired = await prismaService.$transaction(
        async (tx) => {
          const counts = {
            PROJECT: await tx.project.count({ where: { ownerId: null } }),
            BASE_LAYER: await tx.baseLayer.count({ where: { ownerId: null } }),
            VISUAL_AXIS: await tx.visualAxis.count({
              where: { ownerId: null },
            }),
            EVENT: await tx.event.count({ where: { ownerId: null } }),
          } satisfies Record<OwnershipEntityType, number>;

          for (const type of ownershipEntityTypes) {
            if (counts[type] === 0) continue;
            const successorId = successors[type];
            if (!successorId) {
              throw new GenericRouteError(
                "BAD_REQUEST",
                `SUCCESSOR_REQUIRED_FOR_${type}`,
                counts,
              );
            }
            await validateSuccessor(
              asOwnershipClient(tx),
              type,
              successorId,
            );
          }

          const updates = {
            PROJECT: () =>
              tx.project.updateMany({
                where: { ownerId: null },
                data: { ownerId: successors.PROJECT },
              }),
            BASE_LAYER: () =>
              tx.baseLayer.updateMany({
                where: { ownerId: null },
                data: { ownerId: successors.BASE_LAYER },
              }),
            VISUAL_AXIS: () =>
              tx.visualAxis.updateMany({
                where: { ownerId: null },
                data: { ownerId: successors.VISUAL_AXIS },
              }),
            EVENT: () =>
              tx.event.updateMany({
                where: { ownerId: null },
                data: { ownerId: successors.EVENT },
              }),
          } satisfies Record<OwnershipEntityType, () => Promise<unknown>>;

          for (const type of ownershipEntityTypes) {
            if (counts[type] === 0) continue;
            await updates[type]();
            await tx.ownershipAuditEvent.create({
              data: ownershipAuditData({
                correlationId,
                action: "ORPHAN_REPAIR",
                entityType: type,
                entityCount: counts[type],
                actorUserId: session.user.id,
                previousOwnerId: null,
                newOwnerId: successors[type]!,
              }),
            });
          }
          return counts;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      return { correlationId, repaired };
    }

    return {
      getDeletionImpact,
      getDeletionSuccessors,
      getOwnershipSuccessors,
      transferAndDelete,
      deleteSelf,
      getOwnershipPreflight,
      repairOrphanedOwnership,
      async informInactiveUsersPreRemoval() {
        const users = await prismaService.user.findMany({
          where: {
            sessions: {
              every: {
                updatedAt: {
                  lt: dayjs().subtract(365, "day").add(30, "day").toISOString(),
                },
              },
            },
          },
        });
        const config = await configService.getConfiguration();
        const translators = {
          DE: translationService.getTranslator("de"),
          EN: translationService.getTranslator("en"),
        };
        const templates = {
          DE: Handlebars.compile(config.predeletionEmailDE),
          EN: Handlebars.compile(config.predeletionEmailEN),
        };
        await notificationService.notify(
          users.map((user) => ({
            attachments: [],
            content: templates[user.language ?? "EN"]({
              user: { name: user.name, email: user.email },
            }),
            from: null,
            to: user.email,
            title: translators[user.language ?? "EN"](
              "notifications.predeletion-due-to-inactivity-title",
            ),
          })),
        );
      },
      async removeInactiveUsers() {
        const users = await prismaService.user.findMany({
          where: {
            sessions: {
              every: {
                updatedAt: {
                  lt: dayjs().subtract(365, "day").toISOString(),
                },
              },
            },
          },
          select: { id: true },
        });
        let deleted = 0;
        let skippedOwnedContent = 0;
        for (const user of users) {
          const impact = await getDeletionImpactWithClient(
            asOwnershipCountClient(prismaService),
            user.id,
          );
          if (!impact.canDelete) {
            skippedOwnedContent += 1;
            continue;
          }
          await prismaService.user.delete({ where: { id: user.id } });
          deleted += 1;
        }
        return { candidates: users.length, deleted, skippedOwnedContent };
      },
      async cleanupOwnershipAudit() {
        return prismaService.ownershipAuditEvent.deleteMany({
          where: {
            createdAt: { lt: dayjs().subtract(365, "day").toISOString() },
          },
        });
      },
      async info(id: string) {
        const user = await prismaService.user.findFirstOrThrow({
          where: { id },
          select: { name: true, email: true, image: true },
        });
        return { ...user, name: user.name ?? "-" };
      },
    };
  },
  { scope: "REQUEST" },
);

export default userService;
