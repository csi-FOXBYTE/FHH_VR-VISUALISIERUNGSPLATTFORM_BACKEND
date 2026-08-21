import { $Enums } from "@prisma/client";

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
  roles: Array<{
    isAdminRole: boolean;
    assignedPermissions: $Enums.PERMISSIONS[];
  }>,
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
  roles: Array<{
    isAdminRole: boolean;
    assignedPermissions: $Enums.PERMISSIONS[];
  }>,
) {
  return roles.some(
    (role) =>
      role.isAdminRole ||
      role.assignedPermissions.includes(
        $Enums.PERMISSIONS.USER_ADMINISTRATOR,
      ),
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
