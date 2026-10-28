ALTER TABLE "ErpUser"
  ADD COLUMN "lastLoginAt" TIMESTAMP(3),
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "tokensValidAfter" TIMESTAMP(3),
  ADD COLUMN "mfaEnrollmentRequired" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "ErpUser_role_state_deletedAt_createdAt_id_idx" ON "ErpUser"("role", "state", "deletedAt", "createdAt", "id");
CREATE TABLE "AccountResetToken" (
  "id" UUID NOT NULL PRIMARY KEY, "accountId" UUID NOT NULL,
  "tokenHash" VARCHAR(64) NOT NULL UNIQUE, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL, "createdById" UUID NOT NULL,
  "usedAt" TIMESTAMP(3), "invalidatedAt" TIMESTAMP(3), "claimedAt" TIMESTAMP(3),
  "previousState" "UserState" NOT NULL,
  CONSTRAINT "AccountResetToken_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ErpUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "AccountResetToken_accountId_expiresAt_idx" ON "AccountResetToken"("accountId", "expiresAt");
CREATE TABLE "AccountStepUp" (
  "id" UUID NOT NULL PRIMARY KEY, "actorId" UUID NOT NULL, "binding" VARCHAR(64) NOT NULL,
  "encryptedSession" TEXT NOT NULL, "username" TEXT NOT NULL, "challengeName" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL, "verifiedAt" TIMESTAMP(3), "consumedAt" TIMESTAMP(3),
  "proofHash" VARCHAR(64) UNIQUE, "attempts" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "AccountStepUp_actorId_createdAt_idx" ON "AccountStepUp"("actorId", "createdAt");
