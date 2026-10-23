-- Preserve existing identities, registration and audit relationships.
BEGIN;
ALTER TABLE "ErpUser" ALTER COLUMN "cognitoSub" DROP NOT NULL;
ALTER TABLE "ErpUser" ADD COLUMN "email" VARCHAR(254), ADD COLUMN "createdById" UUID;
CREATE UNIQUE INDEX "ErpUser_email_key" ON "ErpUser"("email");
CREATE UNIQUE INDEX "ErpUser_username_ci_key" ON "ErpUser"(lower("username"));
CREATE UNIQUE INDEX "ErpUser_email_ci_key" ON "ErpUser"(lower("email"));
ALTER TABLE "ErpUser" ADD CONSTRAINT "ErpUser_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "ErpUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "ErpUser_role_createdAt_id_idx" ON "ErpUser"("role", "createdAt", "id");
COMMIT;
