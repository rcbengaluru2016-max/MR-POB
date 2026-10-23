CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'RETRY', 'PROCESSING', 'MOCKED', 'ACCEPTED', 'DELIVERED', 'BLOCKED', 'UNKNOWN', 'FAILED');

CREATE TABLE "RegistrationNotification" (
  "id" UUID NOT NULL,
  "registrationId" TEXT NOT NULL,
  "event" "RegistrationStatus" NOT NULL,
  "kind" "RegistrationKind" NOT NULL,
  "recipient" VARCHAR(16) NOT NULL,
  "templateKey" VARCHAR(100) NOT NULL,
  "templateId" TEXT,
  "payload" JSONB NOT NULL,
  "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "publishAttempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "enqueueAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseUntil" TIMESTAMP(3),
  "claimToken" UUID,
  "providerMessageId" TEXT,
  "lastError" VARCHAR(100),
  "deadLetteredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RegistrationNotification_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RegistrationNotification_decision_check" CHECK ("event" IN ('APPROVED', 'REJECTED')),
  CONSTRAINT "RegistrationNotification_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "RegistrationNotification_registrationId_event_key" ON "RegistrationNotification"("registrationId", "event");
CREATE INDEX "RegistrationNotification_status_enqueueAfter_nextAttemptAt_idx" ON "RegistrationNotification"("status", "enqueueAfter", "nextAttemptAt");
CREATE INDEX "RegistrationNotification_status_leaseUntil_idx" ON "RegistrationNotification"("status", "leaseUntil");

CREATE TABLE "NotificationAttempt" (
  "id" UUID NOT NULL,
  "notificationId" UUID NOT NULL,
  "number" INTEGER NOT NULL,
  "outcome" VARCHAR(30) NOT NULL,
  "errorCode" VARCHAR(100),
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  CONSTRAINT "NotificationAttempt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "NotificationAttempt_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "RegistrationNotification"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "NotificationAttempt_notificationId_number_key" ON "NotificationAttempt"("notificationId", "number");
