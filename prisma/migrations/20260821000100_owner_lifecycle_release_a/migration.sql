-- Durable, data-minimized ownership audit. Owner columns remain nullable in
-- Release A so existing orphaned records can be repaired before Release B.
CREATE TYPE "OWNERSHIP_ENTITY_TYPE" AS ENUM (
    'PROJECT',
    'BASE_LAYER',
    'VISUAL_AXIS',
    'EVENT'
);

CREATE TYPE "OWNERSHIP_AUDIT_ACTION" AS ENUM (
    'OWNER_TRANSFER',
    'USER_TRANSFER_AND_DELETE',
    'ORPHAN_REPAIR'
);

CREATE TABLE "OwnershipAuditEvent" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "correlationId" TEXT NOT NULL,
    "action" "OWNERSHIP_AUDIT_ACTION" NOT NULL,
    "entityType" "OWNERSHIP_ENTITY_TYPE" NOT NULL,
    "entityId" TEXT,
    "entityCount" INTEGER NOT NULL DEFAULT 1,
    "actorUserId" TEXT NOT NULL,
    "previousOwnerId" TEXT,
    "newOwnerId" TEXT NOT NULL,

    CONSTRAINT "OwnershipAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OwnershipAuditEvent_createdAt_idx"
    ON "OwnershipAuditEvent"("createdAt");
CREATE INDEX "OwnershipAuditEvent_correlationId_idx"
    ON "OwnershipAuditEvent"("correlationId");
