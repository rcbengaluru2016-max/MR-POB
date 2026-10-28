-- Preserve every existing primary key, profile, document and audit reference.
-- Sequences are intentionally non-transactional: failed submissions may leave gaps.
BEGIN;
LOCK TABLE "Registration", "UploadBatch", "ErpUser" IN ACCESS EXCLUSIVE MODE;
ALTER TABLE "Registration" ADD COLUMN "masterCode" TEXT;
ALTER TABLE "Registration" ADD COLUMN "passwordHash" TEXT;
CREATE UNIQUE INDEX "Registration_masterCode_key" ON "Registration"("masterCode");

CREATE SEQUENCE registration_submission_seq AS BIGINT MINVALUE 1 NO CYCLE;
SELECT setval('registration_submission_seq', GREATEST(COALESCE(MAX(serial), 0) + 1, 1), false)
FROM (
  SELECT substring("id" from '^REG-(?:CUS|PAT|COM)-ZI([0-9]+)$')::bigint AS serial FROM "Registration"
  UNION ALL
  SELECT substring("registrationId" from '^REG-(?:CUS|PAT|COM)-ZI([0-9]+)$')::bigint FROM "UploadBatch"
) existing;

CREATE SEQUENCE approved_master_seq AS BIGINT MINVALUE 1 NO CYCLE;
-- Reserve any existing ZI account usernames before allocating historical approvals.
SELECT setval('approved_master_seq', GREATEST(COALESCE(MAX(substring(upper("username") from '^ZI([0-9]+)$')::bigint), 0) + 1, 1), false)
FROM "ErpUser";

DO $$
DECLARE
  registration RECORD;
  serial TEXT;
  code TEXT;
  account_id UUID;
BEGIN
  FOR registration IN
    SELECT r.*, COALESCE(c."customerName", co."adminFullName", p."patientName", r."id") AS name
    FROM "Registration" r
    LEFT JOIN "CustomerRegistration" c ON c."registrationId" = r."id"
    LEFT JOIN "CompanyRegistration" co ON co."registrationId" = r."id"
    LEFT JOIN "PatientRegistration" p ON p."registrationId" = r."id"
    WHERE r."status" = 'APPROVED'
    ORDER BY COALESCE(r."decidedAt", r."submittedAt"), r."submittedAt", r."id"
  LOOP
    serial := nextval('approved_master_seq')::text;
    code := 'ZI' || lpad(serial, GREATEST(4, length(serial)), '0');
    account_id := registration."ownerId";
    IF account_id IS NULL THEN
      account_id := gen_random_uuid();
      INSERT INTO "ErpUser" ("id", "username", "email", "displayName", "role", "state", "createdAt", "updatedAt")
      VALUES (account_id, code,
        CASE WHEN EXISTS (SELECT 1 FROM "ErpUser" WHERE lower("email") = lower(registration."email")) THEN NULL ELSE registration."email" END,
        registration.name, upper(registration."kind"::text)::"Role", 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
    END IF;
    UPDATE "Registration" SET "masterCode" = code, "ownerId" = account_id WHERE "id" = registration."id";
    INSERT INTO "AuditEvent" ("id", "registrationId", "action", "detail")
    VALUES (gen_random_uuid(), registration."id", 'LEGACY_MASTER_CODE_ASSIGNED', jsonb_build_object('masterCode', code));
  END LOOP;
END $$;
-- Historical credentials were discarded by earlier releases; they cannot be recovered.
-- Historical notifications are not created here, avoiding unsolicited messages.
COMMIT;
