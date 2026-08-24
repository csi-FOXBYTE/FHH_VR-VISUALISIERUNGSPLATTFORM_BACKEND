import { $Enums } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import {
  canTransferOwnership,
  getDeletionImpactWithClient,
  getOwnershipPreflightWithQuery,
  hasUserAdministratorPermission,
  isEligibleSuccessor,
  missingSuccessorTypes,
  ownershipAuditData,
  OwnershipConflictError,
} from "../src/user/ownership.js";

describe("owner lifecycle rules", () => {
  it("counts every ownable type and blocks direct deletion", async () => {
    const client = {
      project: { count: vi.fn().mockResolvedValue(2) },
      baseLayer: { count: vi.fn().mockResolvedValue(1) },
      visualAxis: { count: vi.fn().mockResolvedValue(0) },
      event: { count: vi.fn().mockResolvedValue(3) },
    };
    await expect(getDeletionImpactWithClient(client, "owner")).resolves.toEqual({
      projects: 2,
      baseLayers: 1,
      visualAxes: 0,
      events: 3,
      total: 6,
      canDelete: false,
    });
    expect(client.project.count).toHaveBeenCalledWith({
      where: { ownerId: "owner" },
    });
  });

  it("requires a separate successor for every affected entity type", () => {
    expect(
      missingSuccessorTypes(
        { PROJECT: 1, BASE_LAYER: 0, VISUAL_AXIS: 2, EVENT: 1 },
        { PROJECT: "project-owner", EVENT: "event-owner" },
      ),
    ).toEqual(["VISUAL_AXIS"]);
  });

  it("accepts only type-specific roles or a global admin role", () => {
    const role = (permissions: $Enums.PERMISSIONS[]) => [
      { isAdminRole: false, assignedPermissions: permissions },
    ];
    expect(
      isEligibleSuccessor(
        "PROJECT",
        role([$Enums.PERMISSIONS.PROJECT_OWNER]),
      ),
    ).toBe(true);
    expect(
      isEligibleSuccessor(
        "VISUAL_AXIS",
        role([$Enums.PERMISSIONS.PROJECT_OWNER]),
      ),
    ).toBe(false);
    expect(
      isEligibleSuccessor(
        "BASE_LAYER",
        role([$Enums.PERMISSIONS.DATA_MANAGEMENT_ADMINISTRATOR]),
      ),
    ).toBe(true);
    expect(
      isEligibleSuccessor("EVENT", [
        { isAdminRole: true, assignedPermissions: [] },
      ]),
    ).toBe(true);
  });

  it("allows USER_ADMINISTRATOR and global admins to transfer users", () => {
    expect(
      hasUserAdministratorPermission([
        {
          isAdminRole: false,
          assignedPermissions: [$Enums.PERMISSIONS.USER_ADMINISTRATOR],
        },
      ]),
    ).toBe(true);
    expect(
      hasUserAdministratorPermission([
        { isAdminRole: true, assignedPermissions: [] },
      ]),
    ).toBe(true);
    expect(
      hasUserAdministratorPermission([
        {
          isAdminRole: false,
          assignedPermissions: [$Enums.PERMISSIONS.PROJECT_OWNER],
        },
      ]),
    ).toBe(false);
  });

  it("allows an owner or user administrator to transfer an entity", () => {
    expect(canTransferOwnership("owner", "owner", [])).toBe(true);
    expect(
      canTransferOwnership("administrator", "owner", [
        {
          isAdminRole: false,
          assignedPermissions: [$Enums.PERMISSIONS.USER_ADMINISTRATOR],
        },
      ]),
    ).toBe(true);
    expect(
      canTransferOwnership("other-user", "owner", [
        {
          isAdminRole: false,
          assignedPermissions: [$Enums.PERMISSIONS.PROJECT_OWNER],
        },
      ]),
    ).toBe(false);
    expect(canTransferOwnership("other-user", null, [])).toBe(false);
  });

  it("keeps audit records data-minimized", () => {
    const audit = ownershipAuditData({
      correlationId: "correlation-id",
      action: "OWNER_TRANSFER",
      entityType: "PROJECT",
      entityId: "project-id",
      entityCount: 1,
      actorUserId: "actor-id",
      previousOwnerId: "previous-id",
      newOwnerId: "successor-id",
    });

    expect(audit).toEqual({
      correlationId: "correlation-id",
      action: "OWNER_TRANSFER",
      entityType: "PROJECT",
      entityId: "project-id",
      entityCount: 1,
      actorUserId: "actor-id",
      previousOwnerId: "previous-id",
      newOwnerId: "successor-id",
    });
    expect(Object.keys(audit)).not.toEqual(
      expect.arrayContaining(["name", "email", "filterValue", "content"]),
    );
  });

  it("reports the Release B preflight without exposing record data", async () => {
    const query = vi.fn().mockResolvedValue([
      {
        projects: 1n,
        baseLayers: 2n,
        visualAxes: 0n,
        events: 0n,
        invalidReferences: 1n,
      },
    ]);

    await expect(getOwnershipPreflightWithQuery(query)).resolves.toEqual({
      projects: 1,
      baseLayers: 2,
      visualAxes: 0,
      events: 0,
      invalidReferences: 1,
      total: 3,
      readyForReleaseB: false,
    });
    expect(query).toHaveBeenCalledOnce();
  });

  it("uses HTTP 409 for ownership conflicts", () => {
    const impact = {
      projects: 1,
      baseLayers: 0,
      visualAxes: 0,
      events: 0,
      total: 1,
      canDelete: false,
    };
    const error = new OwnershipConflictError("transfer required", {
      impact,
      nextSteps: [
        "CONTACT_USER_ADMINISTRATOR",
        "SELECT_SUCCESSORS_BY_ENTITY_TYPE",
      ],
    });
    expect(error.statusCode).toBe(409);
    expect(error.code).toBe("OWNERSHIP_CONFLICT");
    expect(error.toJSON()).toEqual({
      status: "CONFLICT",
      code: "OWNERSHIP_CONFLICT",
      message: "transfer required",
      payload: {
        impact,
        nextSteps: [
          "CONTACT_USER_ADMINISTRATOR",
          "SELECT_SUCCESSORS_BY_ENTITY_TYPE",
        ],
      },
    });
  });
});
