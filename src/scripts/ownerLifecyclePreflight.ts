import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

try {
  const [projects, baseLayers, visualAxes, events, invalidRows] =
    await Promise.all([
      prisma.project.count({ where: { ownerId: null } }),
      prisma.baseLayer.count({ where: { ownerId: null } }),
      prisma.visualAxis.count({ where: { ownerId: null } }),
      prisma.event.count({ where: { ownerId: null } }),
      prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
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

  const invalidReferences = Number(invalidRows[0]?.count ?? 0);
  const result = {
    projects,
    baseLayers,
    visualAxes,
    events,
    invalidReferences,
  };
  const ready =
    projects + baseLayers + visualAxes + events + invalidReferences === 0;

  console.info(JSON.stringify({ readyForReleaseB: ready, ...result }));
  if (!ready) process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
