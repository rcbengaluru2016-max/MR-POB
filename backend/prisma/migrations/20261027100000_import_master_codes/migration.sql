ALTER TABLE "Registration"
 ADD COLUMN "registrationSource" VARCHAR(30) NOT NULL DEFAULT 'Normal Registration',
 ADD COLUMN "importedById" UUID REFERENCES "ErpUser"("id") ON DELETE RESTRICT,
 ADD COLUMN "importedAt" TIMESTAMP(3),
 ADD COLUMN "importJobId" UUID REFERENCES "ImportJob"("id") ON DELETE RESTRICT;
CREATE INDEX "Registration_importJobId_idx" ON "Registration"("importJobId");
ALTER TYPE "ImportStatus" ADD VALUE 'PARTIALLY_COMPLETED';
ALTER TABLE "ImportRecord" ADD COLUMN "credentialHash" TEXT;
