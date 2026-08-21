import { randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";

const databaseUrl = process.env.TEST_DATABASE_URL;
const integrationDescribe = databaseUrl ? describe : describe.skip;

integrationDescribe("owner lifecycle PostgreSQL integration", () => {
  const db = new PrismaClient({ datasourceUrl: databaseUrl });
  const prefix = `owner-lifecycle-${Date.now()}`;

  afterAll(async () => {
    await db.ownershipAuditEvent.deleteMany({
      where: { correlationId: { startsWith: prefix } },
    });
    await db.project.deleteMany({ where: { title: { startsWith: prefix } } });
    await db.user.deleteMany({ where: { email: { startsWith: prefix } } });
    await db.$disconnect();
  });

  it("makes every owner column mandatory and every owner FK restrictive", async () => {
    const columns = await db.$queryRaw<
      Array<{ tableName: string; nullable: string }>
    >(Prisma.sql`
      SELECT table_name AS "tableName", is_nullable AS "nullable"
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND column_name = 'ownerId'
        AND table_name IN ('Project', 'BaseLayer', 'VisualAxis', 'Event')
      ORDER BY table_name
    `);
    expect(columns).toEqual([
      { tableName: "BaseLayer", nullable: "NO" },
      { tableName: "Event", nullable: "NO" },
      { tableName: "Project", nullable: "NO" },
      { tableName: "VisualAxis", nullable: "NO" },
    ]);

    const constraints = await db.$queryRaw<
      Array<{ tableName: string; deleteRule: string }>
    >(Prisma.sql`
      SELECT tc.table_name AS "tableName", rc.delete_rule AS "deleteRule"
      FROM information_schema.table_constraints tc
      JOIN information_schema.referential_constraints rc
        ON rc.constraint_schema = tc.constraint_schema
       AND rc.constraint_name = tc.constraint_name
      WHERE tc.constraint_schema = 'public'
        AND tc.constraint_name IN (
          'Project_ownerId_fkey',
          'BaseLayer_ownerId_fkey',
          'VisualAxis_ownerId_fkey',
          'Event_ownerId_fkey'
        )
      ORDER BY tc.table_name
    `);
    expect(constraints).toEqual([
      { tableName: "BaseLayer", deleteRule: "RESTRICT" },
      { tableName: "Event", deleteRule: "RESTRICT" },
      { tableName: "Project", deleteRule: "RESTRICT" },
      { tableName: "VisualAxis", deleteRule: "RESTRICT" },
    ]);
  });

  it("rejects a project without an owner at the database boundary", async () => {
    const id = randomUUID();
    await expect(
      db.$executeRaw(Prisma.sql`
        INSERT INTO "Project" ("id", "updatedAt", "title", "description")
        VALUES (${id}, CURRENT_TIMESTAMP, ${`${prefix}-null-owner`}, '')
      `),
    ).rejects.toThrow();
  });

  it("prevents deletion of an owner while owned content exists", async () => {
    const owner = await db.user.create({
      data: { email: `${prefix}-restrict@example.invalid` },
    });
    await db.project.create({
      data: {
        ownerId: owner.id,
        title: `${prefix}-restrict`,
        description: "",
      },
    });

    await expect(db.user.delete({ where: { id: owner.id } })).rejects.toThrow();
    await expect(
      db.project.count({ where: { ownerId: owner.id } }),
    ).resolves.toBe(1);
  });

  it("rolls ownership and audit changes back atomically", async () => {
    const [owner, successor] = await Promise.all([
      db.user.create({
        data: { email: `${prefix}-atomic-owner@example.invalid` },
      }),
      db.user.create({
        data: { email: `${prefix}-atomic-successor@example.invalid` },
      }),
    ]);
    const project = await db.project.create({
      data: {
        ownerId: owner.id,
        title: `${prefix}-atomic`,
        description: "",
      },
    });
    const correlationId = `${prefix}-${randomUUID()}`;

    await expect(
      db.$transaction(async (tx) => {
        await tx.project.update({
          where: { id: project.id },
          data: { ownerId: successor.id },
        });
        await tx.ownershipAuditEvent.create({
          data: {
            correlationId,
            action: "OWNER_TRANSFER",
            entityType: "PROJECT",
            entityId: project.id,
            actorUserId: owner.id,
            previousOwnerId: owner.id,
            newOwnerId: successor.id,
          },
        });
        throw new Error("simulate deletion failure");
      }),
    ).rejects.toThrow("simulate deletion failure");

    await expect(
      db.project.findUniqueOrThrow({
        where: { id: project.id },
        select: { ownerId: true },
      }),
    ).resolves.toEqual({ ownerId: owner.id });
    await expect(
      db.ownershipAuditEvent.count({ where: { correlationId } }),
    ).resolves.toBe(0);
  });

  it("keeps the audit table free of personal and domain-content columns", async () => {
    const columns = await db.$queryRaw<Array<{ columnName: string }>>(
      Prisma.sql`
        SELECT column_name AS "columnName"
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'OwnershipAuditEvent'
      `,
    );
    const names = columns.map(({ columnName }) => columnName);
    expect(names).not.toEqual(
      expect.arrayContaining([
        "name",
        "email",
        "filterValue",
        "content",
        "title",
        "description",
      ]),
    );
  });
});
