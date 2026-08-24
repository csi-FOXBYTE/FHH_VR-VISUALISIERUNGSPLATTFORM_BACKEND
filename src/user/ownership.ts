import { $Enums, Prisma } from "@prisma/client";

export const ownershipEntityTypes = [
  "PROJECT",
  "BASE_LAYER",
  "VISUAL_AXIS",
  "EVENT",
] as const;
export type OwnershipEntityType = (typeof ownershipEntityTypes)[number];
export type OwnershipSuccessors = Partial<
  Record<OwnershipEntityType, string>
>;

export type OwnershipRole = {
  isAdminRole: boolean;
  assignedPermissions: $Enums.PERMISSIONS[];
};

export type OwnershipConflictPayload = {
  impact: {
    projects: number;
    baseLayers: number;
    visualAxes: number;
    events: number;
    total: number;
    canDelete: boolean;
  };
  nextSteps: [
    "CONTACT_USER_ADMINISTRATOR",
    "SELECT_SUCCESSORS_BY_ENTITY_TYPE",
  ];
};

export class OwnershipConflictError extends Error {
  readonly statusCode = 409;
  readonly code = "OWNERSHIP_CONFLICT";

  constructor(
    message: string,
    readonly payload: OwnershipConflictPayload,
  ) {
    super(message);
    this.name = "OwnershipConflictError";
  }

  toJSON() {
    return {
      status: "CONFLICT" as const,
      code: this.code,
      message: this.message,
      payload: this.payload,
    };
  }
}

export type OwnershipAuditAction =
  | "OWNER_TRANSFER"
  | "USER_TRANSFER_AND_DELETE"
  | "ORPHAN_REPAIR";

export function ownershipAuditData(input: {
  correlationId: string;
  action: OwnershipAuditAction;
  entityType: OwnershipEntityType;
  entityId?: string;
  entityCount: number;
  actorUserId: string;
  previousOwnerId?: string | null;
  newOwnerId: string;
}) {
  return {
    correlationId: input.correlationId,
    action: input.action,
    entityType: input.entityType,
    ...(input.entityId ? { entityId: input.entityId } : {}),
    entityCount: input.entityCount,
    actorUserId: input.actorUserId,
    previousOwnerId: input.previousOwnerId ?? null,
    newOwnerId: input.newOwnerId,
  };
}

export const requiredSuccessorPermissions: Record<
  OwnershipEntityType,
  $Enums.PERMISSIONS[]
> = {
  PROJECT: [$Enums.PERMISSIONS.PROJECT_OWNER],
  BASE_LAYER: [
    $Enums.PERMISSIONS.BASE_LAYER_OWNER,
    $Enums.PERMISSIONS.DATA_MANAGEMENT_ADMINISTRATOR,
  ],
  VISUAL_AXIS: [$Enums.PERMISSIONS.DATA_MANAGEMENT_ADMINISTRATOR],
  EVENT: [$Enums.PERMISSIONS.EVENT_OWNER],
};

export type OwnershipCountClient = {
  project: { count: (args: object) => Promise<number> };
  baseLayer: { count: (args: object) => Promise<number> };
  visualAxis: { count: (args: object) => Promise<number> };
  event: { count: (args: object) => Promise<number> };
};

type OwnershipPreflightRow = {
  projects: bigint;
  baseLayers: bigint;
  visualAxes: bigint;
  events: bigint;
  invalidReferences: bigint;
};

export async function getOwnershipPreflightWithQuery(
  query: (statement: Prisma.Sql) => Promise<OwnershipPreflightRow[]>,
) {
  const rows = await query(Prisma.sql`
    SELECT
      (SELECT COUNT(*) FROM "Project" WHERE "ownerId" IS NULL)::bigint AS "projects",
      (SELECT COUNT(*) FROM "BaseLayer" WHERE "ownerId" IS NULL)::bigint AS "baseLayers",
      (SELECT COUNT(*) FROM "VisualAxis" WHERE "ownerId" IS NULL)::bigint AS "visualAxes",
      (SELECT COUNT(*) FROM "Event" WHERE "ownerId" IS NULL)::bigint AS "events",
      (
        (SELECT COUNT(*) FROM "Project" p LEFT JOIN "User" u ON u."id" = p."ownerId"
          WHERE p."ownerId" IS NOT NULL AND u."id" IS NULL) +
        (SELECT COUNT(*) FROM "BaseLayer" b LEFT JOIN "User" u ON u."id" = b."ownerId"
          WHERE b."ownerId" IS NOT NULL AND u."id" IS NULL) +
        (SELECT COUNT(*) FROM "VisualAxis" v LEFT JOIN "User" u ON u."id" = v."ownerId"
          WHERE v."ownerId" IS NOT NULL AND u."id" IS NULL) +
        (SELECT COUNT(*) FROM "Event" e LEFT JOIN "User" u ON u."id" = e."ownerId"
          WHERE e."ownerId" IS NOT NULL AND u."id" IS NULL)
      )::bigint AS "invalidReferences"
  `);
  const row = rows[0];
  const result = {
    projects: Number(row?.projects ?? 0),
    baseLayers: Number(row?.baseLayers ?? 0),
    visualAxes: Number(row?.visualAxes ?? 0),
    events: Number(row?.events ?? 0),
    invalidReferences: Number(row?.invalidReferences ?? 0),
  };
  const total =
    result.projects + result.baseLayers + result.visualAxes + result.events;
  return {
    ...result,
    total,
    readyForReleaseB: total === 0 && result.invalidReferences === 0,
  };
}

export async function getDeletionImpactWithClient(
  client: OwnershipCountClient,
  userId: string,
) {
  const [projects, baseLayers, visualAxes, events] = await Promise.all([
    client.project.count({ where: { ownerId: userId } }),
    client.baseLayer.count({ where: { ownerId: userId } }),
    client.visualAxis.count({ where: { ownerId: userId } }),
    client.event.count({ where: { ownerId: userId } }),
  ]);
  const total = projects + baseLayers + visualAxes + events;
  return {
    projects,
    baseLayers,
    visualAxes,
    events,
    total,
    canDelete: total === 0,
  };
}

export function isEligibleSuccessor(
  type: OwnershipEntityType,
  roles: OwnershipRole[],
) {
  return roles.some(
    (role) =>
      role.isAdminRole ||
      requiredSuccessorPermissions[type].some((permission) =>
        role.assignedPermissions.includes(permission),
      ),
  );
}

export function hasUserAdministratorPermission(
  roles: OwnershipRole[],
) {
  return roles.some(
    (role) =>
      role.isAdminRole ||
      role.assignedPermissions.includes(
        $Enums.PERMISSIONS.USER_ADMINISTRATOR,
      ),
  );
}

export function canTransferOwnership(
  actorUserId: string,
  currentOwnerId: string | null,
  roles: OwnershipRole[],
) {
  return (
    actorUserId === currentOwnerId || hasUserAdministratorPermission(roles)
  );
}

export function missingSuccessorTypes(
  counts: Record<OwnershipEntityType, number>,
  successors: OwnershipSuccessors,
) {
  return ownershipEntityTypes.filter(
    (type) => counts[type] > 0 && !successors[type],
  );
}
