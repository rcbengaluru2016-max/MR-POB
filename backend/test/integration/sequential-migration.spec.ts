import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { startTestDatabase } from './database';

// Split migration statements while retaining quoted PL/pgSQL bodies as one unit.
function statements(source: string) {
  const sql = source.replace(/^\s*--.*$/gm, '');
  const result: string[] = [];
  let start = 0, quote = '';
  for (let index = 0; index < sql.length; index++) {
    const pair = sql.slice(index, index + 2);
    if (quote === '$$') { if (pair === '$$') {quote = ''; index++;} continue; }
    if (quote) { if (sql[index] === quote) { if (sql[index + 1] === quote) {index++;} else {quote = '';} } continue; }
    if (pair === '$$') {quote = '$$'; index++;}
    else if (sql[index] === "'" || sql[index] === '"') {quote = sql[index];}
    else if (sql[index] === ';') {result.push(sql.slice(start, index).trim()); start = index + 1;}
  }
  result.push(sql.slice(start).trim());
  return result.filter(statement => statement && !/^(BEGIN|COMMIT)$/i.test(statement));
}

describe('Sequential identifier migration with existing records', () => {
  let database: Awaited<ReturnType<typeof startTestDatabase>>;
  let prisma: PrismaClient;
  beforeAll(async () => {database = await startTestDatabase(); prisma = new PrismaClient();});
  afterAll(async () => {await prisma?.$disconnect(); await database?.stop();});

  it('keeps legacy keys, profiles, documents, owners and audits and advances beyond existing serials', async () => {
    await prisma.$executeRawUnsafe('CREATE SCHEMA "sequential_migration_fixture"');
    try {
      await prisma.$transaction(async tx => {
        await tx.$executeRawUnsafe('SET LOCAL search_path TO "sequential_migration_fixture"');
        for (const directory of ['20261022000000_registration_foundation', '20261023000000_admin_accounts', '20261023010000_registration_notifications']) {
          const sql = readFileSync(resolve('prisma', 'migrations', directory, 'migration.sql'), 'utf8');
          for (const statement of statements(sql)) await tx.$executeRawUnsafe(statement);
        }
        await tx.$executeRawUnsafe(`INSERT INTO "ErpUser" ("id", "username", "displayName", "role", "state", "updatedAt") VALUES
          ('00000000-0000-4000-8000-000000000001', 'legacy-admin', 'Legacy Admin', 'SUPER_ADMIN', 'ACTIVE', CURRENT_TIMESTAMP),
          ('00000000-0000-4000-8000-000000000002', 'zi10001', 'Legacy Patient', 'PATIENT', 'ACTIVE', CURRENT_TIMESTAMP)`);
        await tx.$executeRawUnsafe(`INSERT INTO "Registration" ("id", "kind", "status", "mobile", "requestHash", "updatedAt", "decidedAt", "decidedById", "ownerId") VALUES
          ('REG-CUS-legacy-uuid', 'customer', 'APPROVED', '9876543210', 'legacy-customer', CURRENT_TIMESTAMP, '2026-10-20 10:00:00', '00000000-0000-4000-8000-000000000001', NULL),
          ('REG-PAT-legacy-uuid', 'patient', 'APPROVED', '9876543211', 'legacy-patient', CURRENT_TIMESTAMP, '2026-10-21 10:00:00', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002'),
          ('REG-PAT-ZI10010', 'patient', 'PENDING', '9876543212', 'existing-readable-id', CURRENT_TIMESTAMP, NULL, NULL, NULL)`);
        await tx.$executeRawUnsafe(`INSERT INTO "CustomerRegistration" ("registrationId", "customerName", "businessName", "customerType", "dlNumber1", "dlNumber2", "gstNumber", "creditDays", "paymentMethod") VALUES ('REG-CUS-legacy-uuid', 'Legacy Customer', 'Legacy Pharmacy', 'Retail Pharmacy', 'DL1', 'DL2', 'GST-LEGACY', 'week_2', 'UPI')`);
        await tx.$executeRawUnsafe(`INSERT INTO "PatientRegistration" ("registrationId", "patientName", "address", "paymentMethod") VALUES ('REG-PAT-legacy-uuid', 'Legacy Patient', 'Legacy Address', 'UPI'), ('REG-PAT-ZI10010', 'Pending Patient', 'Pending Address', 'UPI')`);
        await tx.$executeRawUnsafe(`INSERT INTO "Document" ("id", "registrationId", "slot", "originalName", "objectKey", "contentType", "size", "sha256") VALUES ('00000000-0000-4000-8000-000000000003', 'REG-CUS-legacy-uuid', 'dl1', 'legacy.pdf', 'registration/customer/REG-CUS-legacy-uuid/legacy.pdf', 'application/pdf', 123, repeat('a', 64))`);
        await tx.$executeRawUnsafe(`INSERT INTO "UploadBatch" ("id", "registrationId", "cleanupAfter") VALUES ('00000000-0000-4000-8000-000000000004', 'REG-COM-ZI10020', CURRENT_TIMESTAMP)`);
        await tx.$executeRawUnsafe(`INSERT INTO "AuditEvent" ("id", "registrationId", "actorId", "action") VALUES ('00000000-0000-4000-8000-000000000005', 'REG-CUS-legacy-uuid', '00000000-0000-4000-8000-000000000001', 'REGISTRATION_APPROVED')`);

        const migration = readFileSync(resolve('prisma', 'migrations', '20261026000000_sequential_registration_master_codes', 'migration.sql'), 'utf8');
        for (const statement of statements(migration)) await tx.$executeRawUnsafe(statement);

        const rows = await tx.$queryRawUnsafe<Array<{id: string; masterCode: string | null; ownerId: string | null; decidedById: string | null}>>('SELECT "id", "masterCode", "ownerId", "decidedById" FROM "Registration" ORDER BY "id"');
        expect(rows.map(row => row.id)).toEqual(['REG-CUS-legacy-uuid', 'REG-PAT-ZI10010', 'REG-PAT-legacy-uuid']);
        expect(rows[0]).toMatchObject({masterCode: 'ZI10002', ownerId: expect.any(String), decidedById: '00000000-0000-4000-8000-000000000001'});
        expect(rows[1]).toMatchObject({masterCode: null, ownerId: null});
        expect(rows[2]).toMatchObject({masterCode: 'ZI10003', ownerId: '00000000-0000-4000-8000-000000000002'});
        const owners = await tx.$queryRawUnsafe<Array<{username: string}>>('SELECT "username" FROM "ErpUser" ORDER BY "username"');
        expect(owners.map(owner => owner.username)).toEqual(['ZI10002', 'legacy-admin', 'zi10001']);
        expect(await tx.$queryRawUnsafe('SELECT "registrationId", "objectKey" FROM "Document"')).toEqual([{registrationId: 'REG-CUS-legacy-uuid', objectKey: 'registration/customer/REG-CUS-legacy-uuid/legacy.pdf'}]);
        expect(await tx.$queryRawUnsafe('SELECT "customerName" FROM "CustomerRegistration"')).toEqual([{customerName: 'Legacy Customer'}]);
        expect(await tx.$queryRawUnsafe('SELECT "id" FROM "AuditEvent" WHERE "action" = \'REGISTRATION_APPROVED\'')).toEqual([{id: '00000000-0000-4000-8000-000000000005'}]);
        expect(await tx.$queryRawUnsafe('SELECT COUNT(*)::int AS count FROM "RegistrationNotification"')).toEqual([{count: 0}]);
        expect(await tx.$queryRawUnsafe("SELECT nextval('registration_submission_seq') AS serial")).toEqual([{serial: 10021n}]);
        expect(await tx.$queryRawUnsafe("SELECT nextval('approved_master_seq') AS serial")).toEqual([{serial: 10004n}]);
      }, {timeout: 120000});
    } finally {
      await prisma.$executeRawUnsafe('DROP SCHEMA "sequential_migration_fixture" CASCADE');
    }
  });
});
