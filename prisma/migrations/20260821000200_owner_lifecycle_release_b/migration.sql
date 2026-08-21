-- Release B is intentionally self-guarding. The table locks close the race
-- between the preflight and the constraint changes; any finding aborts the
-- complete transaction without a partial schema update.
BEGIN;

LOCK TABLE "User", "Project", "BaseLayer", "VisualAxis", "Event"
    IN SHARE ROW EXCLUSIVE MODE;

DO $$
DECLARE
    project_nulls BIGINT;
    base_layer_nulls BIGINT;
    visual_axis_nulls BIGINT;
    event_nulls BIGINT;
    invalid_references BIGINT;
BEGIN
    SELECT COUNT(*) INTO project_nulls FROM "Project" WHERE "ownerId" IS NULL;
    SELECT COUNT(*) INTO base_layer_nulls FROM "BaseLayer" WHERE "ownerId" IS NULL;
    SELECT COUNT(*) INTO visual_axis_nulls FROM "VisualAxis" WHERE "ownerId" IS NULL;
    SELECT COUNT(*) INTO event_nulls FROM "Event" WHERE "ownerId" IS NULL;

    SELECT
        (SELECT COUNT(*) FROM "Project" p LEFT JOIN "User" u ON u."id" = p."ownerId"
            WHERE p."ownerId" IS NOT NULL AND u."id" IS NULL) +
        (SELECT COUNT(*) FROM "BaseLayer" b LEFT JOIN "User" u ON u."id" = b."ownerId"
            WHERE b."ownerId" IS NOT NULL AND u."id" IS NULL) +
        (SELECT COUNT(*) FROM "VisualAxis" v LEFT JOIN "User" u ON u."id" = v."ownerId"
            WHERE v."ownerId" IS NOT NULL AND u."id" IS NULL) +
        (SELECT COUNT(*) FROM "Event" e LEFT JOIN "User" u ON u."id" = e."ownerId"
            WHERE e."ownerId" IS NOT NULL AND u."id" IS NULL)
    INTO invalid_references;

    IF project_nulls + base_layer_nulls + visual_axis_nulls + event_nulls +
       invalid_references > 0 THEN
        RAISE EXCEPTION
            'Owner Release B preflight failed (Project %, BaseLayer %, VisualAxis %, Event %, invalid references %)',
            project_nulls, base_layer_nulls, visual_axis_nulls, event_nulls,
            invalid_references
            USING ERRCODE = '23502';
    END IF;
END $$;

ALTER TABLE "Project" DROP CONSTRAINT "Project_ownerId_fkey";
ALTER TABLE "BaseLayer" DROP CONSTRAINT "BaseLayer_ownerId_fkey";
ALTER TABLE "VisualAxis" DROP CONSTRAINT "VisualAxis_ownerId_fkey";
ALTER TABLE "Event" DROP CONSTRAINT "Event_ownerId_fkey";

ALTER TABLE "Project" ALTER COLUMN "ownerId" SET NOT NULL;
ALTER TABLE "BaseLayer" ALTER COLUMN "ownerId" SET NOT NULL;
ALTER TABLE "VisualAxis" ALTER COLUMN "ownerId" SET NOT NULL;
ALTER TABLE "Event" ALTER COLUMN "ownerId" SET NOT NULL;

ALTER TABLE "Project" ADD CONSTRAINT "Project_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BaseLayer" ADD CONSTRAINT "BaseLayer_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VisualAxis" ADD CONSTRAINT "VisualAxis_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Event" ADD CONSTRAINT "Event_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
