-- Remove the AuditLog model entirely — no audit trail for demo purposes.

-- DropForeignKey
ALTER TABLE "AuditLog" DROP CONSTRAINT "AuditLog_exceptionId_fkey";

-- DropTable
DROP TABLE "AuditLog";
