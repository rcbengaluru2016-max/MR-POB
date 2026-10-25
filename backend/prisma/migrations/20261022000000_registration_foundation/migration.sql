-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "RegistrationKind" AS ENUM ('customer', 'company', 'patient');

-- CreateEnum
CREATE TYPE "RegistrationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'SUPER_ADMIN', 'CUSTOMER', 'COMPANY', 'PATIENT');

-- CreateEnum
CREATE TYPE "UserState" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateTable
CREATE TABLE "ErpUser" (
    "id" UUID NOT NULL,
    "cognitoSub" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "state" "UserState" NOT NULL DEFAULT 'INACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ErpUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Registration" (
    "id" TEXT NOT NULL,
    "kind" "RegistrationKind" NOT NULL,
    "status" "RegistrationStatus" NOT NULL DEFAULT 'PENDING',
    "mobile" VARCHAR(10) NOT NULL,
    "email" VARCHAR(254),
    "termsAcceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "termsVersion" TEXT NOT NULL DEFAULT 'registration-v1',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "decidedAt" TIMESTAMP(3),
    "decidedById" UUID,
    "rejectionReason" TEXT,
    "ownerId" UUID,
    "idempotencyKey" TEXT,
    "requestHash" TEXT NOT NULL,

    CONSTRAINT "Registration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerRegistration" (
    "registrationId" TEXT NOT NULL,
    "customerName" VARCHAR(200) NOT NULL,
    "businessName" VARCHAR(200) NOT NULL,
    "customerType" VARCHAR(50) NOT NULL,
    "dlNumber1" VARCHAR(100) NOT NULL,
    "dlNumber2" VARCHAR(100) NOT NULL,
    "dlNumber3" VARCHAR(100),
    "fssaiNumber" VARCHAR(100),
    "gstNumber" VARCHAR(100) NOT NULL,
    "creditDays" VARCHAR(50) NOT NULL,
    "paymentMethod" VARCHAR(50) NOT NULL,

    CONSTRAINT "CustomerRegistration_pkey" PRIMARY KEY ("registrationId")
);

-- CreateTable
CREATE TABLE "CustomerAddress" (
    "registrationId" TEXT NOT NULL,
    "addressLine1" VARCHAR(500) NOT NULL,
    "addressLine2" VARCHAR(500),
    "addressLine3" VARCHAR(500),
    "addressLine4" VARCHAR(500),
    "pinCode" VARCHAR(6) NOT NULL,

    CONSTRAINT "CustomerAddress_pkey" PRIMARY KEY ("registrationId")
);

-- CreateTable
CREATE TABLE "CompanyRegistration" (
    "registrationId" TEXT NOT NULL,
    "companyName" VARCHAR(200) NOT NULL,
    "division" VARCHAR(200) NOT NULL,
    "headquarter" VARCHAR(200) NOT NULL,
    "adminFullName" VARCHAR(200) NOT NULL,

    CONSTRAINT "CompanyRegistration_pkey" PRIMARY KEY ("registrationId")
);

-- CreateTable
CREATE TABLE "PatientRegistration" (
    "registrationId" TEXT NOT NULL,
    "patientName" VARCHAR(200) NOT NULL,
    "gender" VARCHAR(30),
    "address" VARCHAR(2000) NOT NULL,
    "paymentMethod" VARCHAR(50) NOT NULL,

    CONSTRAINT "PatientRegistration_pkey" PRIMARY KEY ("registrationId")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" UUID NOT NULL,
    "registrationId" TEXT NOT NULL,
    "slot" VARCHAR(50) NOT NULL,
    "originalName" VARCHAR(200) NOT NULL,
    "objectKey" TEXT NOT NULL,
    "versionId" TEXT,
    "contentType" VARCHAR(100) NOT NULL,
    "size" INTEGER NOT NULL,
    "sha256" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" UUID NOT NULL,
    "actorId" UUID,
    "registrationId" TEXT,
    "action" VARCHAR(100) NOT NULL,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UploadBatch" (
    "id" UUID NOT NULL,
    "registrationId" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3),
    "cleanupStartedAt" TIMESTAMP(3),
    "cleanupAfter" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UploadBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UploadObject" (
    "id" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "objectKey" TEXT NOT NULL,
    "versionId" TEXT,

    CONSTRAINT "UploadObject_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ErpUser_cognitoSub_key" ON "ErpUser"("cognitoSub");

-- CreateIndex
CREATE UNIQUE INDEX "ErpUser_username_key" ON "ErpUser"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Registration_idempotencyKey_key" ON "Registration"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Registration_kind_status_submittedAt_id_idx" ON "Registration"("kind", "status", "submittedAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Registration_kind_mobile_key" ON "Registration"("kind", "mobile");

-- CreateIndex
CREATE UNIQUE INDEX "Registration_kind_email_key" ON "Registration"("kind", "email");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerRegistration_gstNumber_key" ON "CustomerRegistration"("gstNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Document_objectKey_key" ON "Document"("objectKey");

-- CreateIndex
CREATE UNIQUE INDEX "Document_registrationId_slot_key" ON "Document"("registrationId", "slot");

-- CreateIndex
CREATE INDEX "AuditEvent_registrationId_createdAt_idx" ON "AuditEvent"("registrationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "UploadBatch_registrationId_key" ON "UploadBatch"("registrationId");

-- CreateIndex
CREATE INDEX "UploadBatch_completedAt_cleanupAfter_idx" ON "UploadBatch"("completedAt", "cleanupAfter");

-- CreateIndex
CREATE UNIQUE INDEX "UploadObject_objectKey_key" ON "UploadObject"("objectKey");

-- AddForeignKey
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "ErpUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "ErpUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerRegistration" ADD CONSTRAINT "CustomerRegistration_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerAddress" ADD CONSTRAINT "CustomerAddress_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "CustomerRegistration"("registrationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyRegistration" ADD CONSTRAINT "CompanyRegistration_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientRegistration" ADD CONSTRAINT "PatientRegistration_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "ErpUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadObject" ADD CONSTRAINT "UploadObject_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "UploadBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
