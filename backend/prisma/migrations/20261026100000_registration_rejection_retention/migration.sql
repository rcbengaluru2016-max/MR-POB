ALTER TYPE "NotificationStatus" ADD VALUE 'EXPIRED';
ALTER TABLE "Registration" ADD COLUMN "rejectionReasonCode" VARCHAR(50), ADD COLUMN "rejectionExpiresAt" TIMESTAMP(3);
-- Prefer the original decision/audit time. If legacy metadata is missing,
-- initialize one conservative deadline here; submission time could expire early.
UPDATE "Registration" r SET "rejectionExpiresAt" = COALESCE(r."decidedAt",
  (SELECT MIN(a."createdAt") FROM "AuditEvent" a WHERE a."registrationId" = r."id" AND a."action" = 'REGISTRATION_REJECTED'),
  CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + INTERVAL '30 days' WHERE r."status" = 'REJECTED';
CREATE INDEX "Registration_rejectionExpiresAt_idx" ON "Registration"("rejectionExpiresAt");
-- Keep decision/audit identities; remove legacy free text from security audit.
UPDATE "AuditEvent" SET "detail" = COALESCE("detail", '{}'::jsonb) - 'reason' WHERE "action" = 'REGISTRATION_REJECTED';
