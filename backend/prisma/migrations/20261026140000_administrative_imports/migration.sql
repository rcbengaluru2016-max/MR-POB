CREATE TYPE "ImportStatus" AS ENUM ('PENDING_VALIDATION', 'VALIDATING', 'VALIDATION_FAILED', 'READY', 'IMPORTING', 'COMPLETED', 'FAILED', 'CANCELLED');
CREATE TABLE "ImportJob" (
  "id" UUID NOT NULL PRIMARY KEY,
  "kind" "RegistrationKind" NOT NULL,
  "importType" VARCHAR(10) NOT NULL,
  "fileName" VARCHAR(200) NOT NULL,
  "uploadedById" UUID NOT NULL REFERENCES "ErpUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "status" "ImportStatus" NOT NULL DEFAULT 'PENDING_VALIDATION',
  "requestHash" VARCHAR(64) NOT NULL,
  "idempotencyKey" VARCHAR(128),
  "totalRecords" INTEGER NOT NULL DEFAULT 0,
  "validRecords" INTEGER NOT NULL DEFAULT 0,
  "importedRecords" INTEGER NOT NULL DEFAULT 0,
  "progress" INTEGER NOT NULL DEFAULT 0,
  "errorSummary" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "confirmedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "ImportJob_counts_check" CHECK ("totalRecords" BETWEEN 0 AND 250 AND "validRecords" BETWEEN 0 AND "totalRecords" AND "importedRecords" BETWEEN 0 AND "validRecords" AND "progress" BETWEEN 0 AND 100),
  CONSTRAINT "ImportJob_completed_check" CHECK ("status" <> 'COMPLETED' OR ("importedRecords" = "totalRecords" AND "progress" = 100 AND "completedAt" IS NOT NULL)),
  CONSTRAINT "ImportJob_type_check" CHECK ("importType" IN ('Bulk', 'Single'))
);
CREATE UNIQUE INDEX "ImportJob_idempotencyKey_key" ON "ImportJob"("idempotencyKey");
CREATE INDEX "ImportJob_deletedAt_uploadedAt_id_idx" ON "ImportJob"("deletedAt", "uploadedAt", "id");
CREATE INDEX "ImportJob_status_expiresAt_idx" ON "ImportJob"("status", "expiresAt");
CREATE TABLE "ImportRecord" (
  "id" UUID NOT NULL PRIMARY KEY,
  "jobId" UUID NOT NULL REFERENCES "ImportJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "rowNumber" INTEGER NOT NULL,
  "registrationId" TEXT,
  "masterCode" TEXT,
  "data" JSONB NOT NULL,
  "errors" TEXT[] NOT NULL,
  "duplicate" BOOLEAN NOT NULL DEFAULT false,
  "batchId" UUID,
  "documents" JSONB NOT NULL,
  CONSTRAINT "ImportRecord_safe_fields_check" CHECK (NOT ("data" ?| ARRAY['password', 'confirmPassword', 'passwordHash', 'passwordSalt'])),
  CONSTRAINT "ImportRecord_row_check" CHECK ("rowNumber" BETWEEN 2 AND 251)
);
CREATE UNIQUE INDEX "ImportRecord_jobId_rowNumber_key" ON "ImportRecord"("jobId", "rowNumber");
