const {spawn, execFileSync} = require('node:child_process');
const {copyFile, cp, mkdtemp, readFile, writeFile, rm} = require('node:fs/promises');
const path = require('node:path');

async function main() {
  const frontend = path.resolve('../frontend');
  // A separate Next project preserves the developer's active .next/dev lock.
  const project = await mkdtemp(path.join(frontend, '.backend-http-e2e-'));
  // Physical source copies avoid Next watcher initialization across source junctions.
  for (const directory of ['app', 'components', 'lib', 'public']) await cp(path.join(frontend, directory), path.join(project, directory), {recursive: true});
  // Dependencies resolve from the parent frontend/node_modules; avoid watcher junctions.
  for (const file of ['package.json', 'package-lock.json', 'tsconfig.json', 'proxy.ts']) await copyFile(path.join(frontend, file), path.join(project, file));
  const config = await readFile(path.join(frontend, 'next.config.ts'), 'utf8');
  await writeFile(path.join(project, 'next.config.ts'), config.replace('export default nextConfig;', `nextConfig.turbopack = { ...nextConfig.turbopack, root: ${JSON.stringify(frontend)} };\nexport default nextConfig;`));
  // Preserve the real Tailwind Turbopack loader; Webpack renders this project unstyled.
  let next;
  let retries = 0;
  function launch() {
    next = spawn(process.execPath, [path.join(frontend, 'node_modules/next/dist/bin/next'), 'dev', '-H', '127.0.0.1', '-p', '3200'], {cwd: project, env: {...process.env, NEXT_TELEMETRY_DISABLED: '1'}, stdio: 'inherit', windowsHide: true});
    next.once('error', error => {console.error(error); void shutdown(1);});
    next.once('exit', code => {
      // Keep the same project/cache when Next asks for a command retry during
      // startup. A new temporary project would encounter the first-run stop again.
      if (!stopping && code !== 0 && retries++ === 0) {
        console.log('Retrying isolated Next startup once in the same project.');
        launch();
      } else void shutdown(code ?? 1);
    });
  }
  let stopping = false;
  async function shutdown(code = 0) {
    if (stopping) return;
    stopping = true;
    if (next.exitCode === null && next.pid) {
      if (process.platform === 'win32') {
        try {execFileSync('taskkill', ['/PID', String(next.pid), '/T', '/F'], {stdio: 'ignore', windowsHide: true, timeout: 5000});} catch {next.kill('SIGTERM');}
      } else next.kill('SIGTERM');
    }
    if (path.dirname(project) !== frontend || !path.basename(project).startsWith('.backend-http-e2e-')) throw new Error('Unexpected browser-test project path');
    await rm(project, {recursive: true, force: true, maxRetries: 20, retryDelay: 250});
    process.exit(code);
  }
  launch();
  process.once('SIGINT', () => {void shutdown();});
  process.once('SIGTERM', () => {void shutdown();});
}
void main().catch(error => {console.error(error); process.exit(1);});
