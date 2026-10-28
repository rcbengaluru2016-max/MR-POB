import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { startTestDatabase } from './database';

describe('rejection retention migration for existing data', () => {
  let database: Awaited<ReturnType<typeof startTestDatabase>>;
  let prisma: PrismaClient;
  beforeAll(async () => { database = await startTestDatabase(); prisma = new PrismaClient(); });
  afterAll(async () => { await prisma?.$disconnect(); await database?.stop(); });
  it('uses the original decision or audit time and never expires unknown legacy dates from submission time', async () => {
    await prisma.$executeRawUnsafe('CREATE SCHEMA "rejection_migration_fixture"');
    try {
      await prisma.$transaction(async tx => {
        await tx.$executeRawUnsafe('SET LOCAL search_path TO "rejection_migration_fixture"');
        await tx.$executeRawUnsafe(`CREATE TYPE "NotificationStatus" AS ENUM ('PENDING')`);
        await tx.$executeRawUnsafe('CREATE TABLE "Registration" ("id" text PRIMARY KEY, "status" text, "decidedAt" timestamp(3), "submittedAt" timestamp(3))');
        await tx.$executeRawUnsafe('CREATE TABLE "AuditEvent" ("registrationId" text, "action" text, "detail" jsonb, "createdAt" timestamp(3))');
        await tx.$executeRawUnsafe(`INSERT INTO "Registration" VALUES ('decision', 'REJECTED', '2026-01-01', '2020-01-01'), ('audit', 'REJECTED', NULL, '2020-01-01'), ('unknown', 'REJECTED', NULL, '2020-01-01'), ('approved', 'APPROVED', '2026-01-01', '2020-01-01')`);
        await tx.$executeRawUnsafe(`INSERT INTO "AuditEvent" VALUES ('decision', 'REGISTRATION_REJECTED', '{"status":"REJECTED","reason":"Legacy correction instructions"}', '2026-01-02'), ('audit', 'REGISTRATION_REJECTED', '{"reason":"Legacy correction instructions"}', '2026-02-01')`);
        const sql = readFileSync(resolve('prisma/migrations/20261026100000_registration_rejection_retention/migration.sql'), 'utf8').replace(/^\s*--.*$/gm, '');
        const [{ startedAt }] = await tx.$queryRaw<{ startedAt: Date }[]>`SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::timestamp(3) AS "startedAt"`;
        for (const statement of sql.split(';').map(value => value.trim()).filter(Boolean)) await tx.$executeRawUnsafe(statement);
        const rows = await tx.$queryRaw<{ id: string; expiry: Date | null }[]>`SELECT "id", "rejectionExpiresAt" AS expiry FROM "Registration"`;
        const expiry = Object.fromEntries(rows.map(row => [row.id, row.expiry]));
        expect(expiry.decision).toEqual(new Date('2026-01-31T00:00:00Z'));
        expect(expiry.audit).toEqual(new Date('2026-03-03T00:00:00Z'));
        expect(expiry.unknown).toEqual(new Date(startedAt.getTime() + 30 * 86400000));
        expect(expiry.approved).toBeNull();
        const audits = await tx.$queryRaw<{ detail: unknown }[]>`SELECT "detail" FROM "AuditEvent"`;
        expect(JSON.stringify(audits)).not.toContain('Legacy correction instructions');
      }, { timeout: 30000 });
    } finally { await prisma.$executeRawUnsafe('DROP SCHEMA "rejection_migration_fixture" CASCADE'); }
  });
});
