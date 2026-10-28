// Optional real-AWS smoke test. Writes one non-sensitive private object and removes
// every version using the same storage service as administrative imports.
require('dotenv/config');
const { randomUUID, createHash } = require('node:crypto');
const { S3StorageService } = require('../dist/documents/s3-storage.service');
const { ConfigService } = require('../dist/config/config.service');

async function main() {
  const storage = new S3StorageService(new ConfigService());
  const key = `imports/patient/${randomUUID()}/storage-verification.png`;
  const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
  let versionId;
  let url;
  let cleanup = false;
  try {
    ({ versionId } = await storage.put(key, bytes, 'image/png', createHash('sha256').update(bytes).digest('hex')));
    url = await storage.signedDownload(key, 'storage-verification.png', versionId);
    const download = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!download.ok || !Buffer.from(await download.arrayBuffer()).equals(bytes)) throw new Error('IMPORT_STORAGE_DOWNLOAD_FAILED');
    const unsigned = await fetch(url.split('?')[0], { signal: AbortSignal.timeout(15000) });
    if (![403, 404].includes(unsigned.status)) throw new Error('IMPORT_STORAGE_NOT_PRIVATE');
    await unsigned.body?.cancel();
    await storage.remove(key, versionId);
    cleanup = true;
    const removed = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (removed.ok) throw new Error('IMPORT_STORAGE_CLEANUP_FAILED');
    await removed.body?.cancel();
    console.log(JSON.stringify({ upload: true, authorisedDownload: true, privateAccess: true, versionCleanup: true }));
  } finally {
    if (!cleanup) await storage.remove(key, versionId);
  }
}
main().catch(error => {
  console.error(JSON.stringify({ storageVerification: 'failed', code: error.name, check: /^IMPORT_STORAGE_/.test(error.message) ? error.message : 'Check configured AWS profile and S3 permissions' }));
  process.exitCode = 1;
});
