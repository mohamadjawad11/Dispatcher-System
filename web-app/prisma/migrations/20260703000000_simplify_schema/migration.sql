-- Simplify the schema for teaching-demo purposes:
--   1. Collapse the Exception.status 3-state enum (TRIAGE/ACTIONING/RESOLVED)
--      into a single `resolved` boolean. RESOLVED -> true, everything else -> false.
--   2. Drop Shipment.customerPhone (never actually used to send anything).
--   3. Drop AuditLog.changedBy (was always the same hardcoded value).

-- AlterTable: Exception — add `resolved`, backfill from the old `status`, then drop `status`.
ALTER TABLE "Exception" ADD COLUMN "resolved" BOOLEAN NOT NULL DEFAULT false;
UPDATE "Exception" SET "resolved" = true WHERE "status" = 'RESOLVED';
ALTER TABLE "Exception" DROP COLUMN "status";

-- DropEnum
DROP TYPE "ExceptionStatus";

-- AlterTable: Shipment
ALTER TABLE "Shipment" DROP COLUMN "customerPhone";

-- AlterTable: AuditLog
ALTER TABLE "AuditLog" DROP COLUMN "changedBy";
