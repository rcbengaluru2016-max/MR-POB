import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
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
  try {
    execFileSync(process.execPath, [resolve('node_modules/prisma/build/index.js'), 'migrate', 'deploy'], {
      cwd: resolve('.'), env: process.env, stdio: 'pipe', timeout: 240000,
    });
  } catch (error) {
    await container?.stop();
    throw error;
  }
  return {url, stop: async () => {await container?.stop();}};
}
