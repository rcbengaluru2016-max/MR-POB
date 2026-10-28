require('reflect-metadata');
require('dotenv/config');
const { randomUUID, createHash } = require('node:crypto');
const JSZip = require('jszip');
const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const { S3StorageService } = require('../dist/documents/s3-storage.service');
const { ConfigService } = require('../dist/config/config.service');
const { parseDocumentZip } = require('../dist/imports/import-document-zip');

// Optional real-AWS transport check: temporary non-sensitive objects only, no registrations.
(async () => {
  const storage = new S3StorageService(new ConfigService());
  const image = await sharp({create:{width:2,height:2,channels:3,background:'white'}}).png().toBuffer();
  const zip = new JSZip(); zip.file('proof.png', image);
  const buffer = await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'});
  const [document] = await parseDocumentZip({originalname:'verification.zip',buffer,size:buffer.length});
  const results = [];
  const manifest = path.resolve('.local', `import-zip-storage-${randomUUID()}.json`);
  const pending = [];
  await fs.mkdir(path.dirname(manifest), {recursive:true});
  for (const [index, kind] of ['customer','company','patient'].entries()) {
    const masterCode = `ZI${Date.now() + index}`;
    const key = `imports/${kind}/${masterCode}/${randomUUID()}.png`;
    let versionId, url, removed = false;
    pending.push({key});
    await fs.writeFile(manifest,JSON.stringify({scope:'Temporary ZIP storage verification objects only',pending}));
    try {
      ({versionId} = await storage.put(key, document.buffer, document.mimetype, createHash('sha256').update(document.buffer).digest('hex')));
      url = await storage.signedDownload(key, document.originalname, versionId);
      const download = await fetch(url,{signal:AbortSignal.timeout(15000)});
      if(!download.ok || !Buffer.from(await download.arrayBuffer()).equals(image)) throw new Error('IMPORT_ZIP_DOWNLOAD_FAILED');
      const unsigned = await fetch(url.split('?')[0],{signal:AbortSignal.timeout(15000)});
      if(![403,404].includes(unsigned.status)) throw new Error('IMPORT_ZIP_NOT_PRIVATE');
      await unsigned.body?.cancel();
      await storage.remove(key,versionId); removed=true;
      const absent = await fetch(url,{signal:AbortSignal.timeout(15000)});
      if(absent.ok) throw new Error('IMPORT_ZIP_CLEANUP_FAILED');
      await absent.body?.cancel();
      results.push({category:kind,masterCodePrefix:true,originalBytes:true,privateAccess:true,versionCleanup:true});
    } finally {
      if(!removed) await storage.remove(key,versionId);
      pending.splice(pending.findIndex(object=>object.key===key),1);
      await fs.writeFile(manifest,JSON.stringify({scope:'Temporary ZIP storage verification objects only',pending}));
    }
  }
  if(!pending.length) await fs.rm(manifest,{force:true});
  console.log(JSON.stringify({scope:'S3 transport and ZIP bytes; no database imports',results}));
})().catch(error=>{
  console.error(JSON.stringify({verification:'failed',code:error.name,check:/^IMPORT_ZIP_/.test(error.message)?error.message:'Check the configured AWS profile and S3 permissions'}));
  process.exitCode=1;
});
