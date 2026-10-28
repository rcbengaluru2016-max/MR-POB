import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { readdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { assertDatabaseSchemaReady } from '../../src/database/schema-readiness';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';

export async function startTestDatabase() {
  let container: StartedPostgreSqlContainer | undefined;
  let url = process.env.TEST_DATABASE_URL;
  if (!url) {
    const {PostgreSqlContainer} = await import('@testcontainers/postgresql');
    container = await new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('zenex_test').withUsername('zenex_test').withPassword('zenex_test')
      .start();
    url = container.getConnectionUri();
  }
  const parsed = new URL(url);
  if (!/^zenex_test(?:_[a-z0-9]+)?$/.test(parsed.pathname.slice(1))) {
    await container?.stop();
    throw new Error('Integration tests require a disposable database named zenex_test or zenex_test_<suffix>');
  }
  process.env.DATABASE_URL = url;
  // A shared disposable database is commonly prepared before several suites run.
  // Verify the real migration ledger, file checksums and current schema before
  // avoiding a redundant CLI spawn (which is particularly slow on Windows).
  const client = new PrismaClient();
  let prepared = false;
  try {
    const applied = await client.$queryRaw<{ migration_name: string; checksum: string }[]>`
      SELECT migration_name, checksum FROM "_prisma_migrations"
      WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;
    const migrations = readdirSync(resolve('prisma/migrations'), { withFileTypes: true }).filter(entry => entry.isDirectory());
    prepared = applied.length === migrations.length && migrations.every(entry => {
      const checksum = createHash('sha256').update(readFileSync(resolve('prisma/migrations', entry.name, 'migration.sql'))).digest('hex');
      return applied.some(row => row.migration_name === entry.name && row.checksum === checksum);
    });
    if (prepared) await assertDatabaseSchemaReady(client);
  } catch { prepared = false; }
  finally { await client.$disconnect(); }
  try {
    if (!prepared) execFileSync(process.execPath, [resolve('node_modules/prisma/build/index.js'), 'migrate', 'deploy'], {
      cwd: resolve('.'), env: process.env, stdio: 'pipe', timeout: 240000,
    });
  } catch (error) {
    await container?.stop();
    throw error;
  }
  return {url, stop: async () => {await container?.stop();}};
}
