import { BadRequestException } from '@nestjs/common';
import { fromBuffer } from 'yauzl';
import { safeFilename } from './import-schema';
import { importLimits } from './import-limits';

const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : value >>> 1;
  return value >>> 0;
});
const mimeTypes: Record<string, string> = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };

/** Bounded in-memory extraction only. Paths are never used as filesystem or S3 paths. */
export async function parseDocumentZip(file: Express.Multer.File) {
  safeFilename(file.originalname);
  const limits = importLimits();
  if (!/\.zip$/i.test(file.originalname) || !file.buffer.length || file.buffer.length > limits.archiveBytes || !['504b0304', '504b0506'].includes(file.buffer.subarray(0, 4).toString('hex'))) throw new BadRequestException('Supporting Documents must contain a valid .zip archive within the configured size limit');
  return new Promise<Express.Multer.File[]>((resolve, reject) => {
    fromBuffer(file.buffer, { lazyEntries: true, validateEntrySizes: true, strictFileNames: true }, (error, zip) => {
      if (error || !zip) { reject(new BadRequestException('Supporting Documents ZIP is unreadable')); return; }
      const files: Express.Multer.File[] = [];
      const paths = new Set<string>(), names = new Set<string>();
      let count = 0, total = 0, ended = false;
      const fail = (message = 'Unsafe, corrupted or oversized supporting ZIP archive') => {
        if (ended) return;
        ended = true; clearTimeout(timer); zip.close();
        reject(new BadRequestException(message));
      };
      const timer = setTimeout(() => fail('Supporting ZIP processing deadline exceeded'), 10000);
      zip.on('error', () => fail());
      zip.on('end', () => { if (!ended) { ended = true; clearTimeout(timer); resolve(files); } });
      zip.on('entry', entry => {
        const path: string = entry.fileName;
        const directory = path.endsWith('/');
        const unixType = (entry.externalFileAttributes >>> 16) & 0xf000;
        if (++count > 4000 || (entry.generalPurposeBitFlag & 1) || ![0, 8].includes(entry.compressionMethod) || (unixType && unixType !== (directory ? 0x4000 : 0x8000)) || /(^\/|\\|:|[\x00-\x1f\x7f])/.test(path) || path.length > 1000 || paths.has(path)) { fail(); return; }
        const segments = (directory ? path.slice(0, -1) : path).split('/');
        try { segments.forEach(segment => safeFilename(segment)); } catch { fail('Unsafe filename or path in supporting ZIP'); return; }
        paths.add(path);
        if (directory) { if (entry.uncompressedSize) fail(); else zip.readEntry(); return; }
        const filename = segments[segments.length - 1];
        const normalized = filename.toLowerCase();
        if (names.has(normalized)) { fail(`Duplicate or ambiguous ZIP filename: ${filename}`); return; }
        names.add(normalized);
        if (files.length >= 1500 || !entry.uncompressedSize || entry.uncompressedSize > limits.documentBytes || total + entry.uncompressedSize > limits.totalDocumentBytes) { fail('Supporting ZIP exceeds document count, file-size or expanded-byte limits'); return; }
        zip.openReadStream(entry, (streamError, stream) => {
          if (streamError || !stream) { fail(); return; }
          const chunks: Buffer[] = [];
          let size = 0, crc = 0xffffffff;
          stream.on('data', (chunk: Buffer) => {
            size += chunk.length; total += chunk.length;
            if (size > limits.documentBytes || total > limits.totalDocumentBytes) { stream.destroy(); fail(); return; }
            for (const byte of chunk) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
            chunks.push(chunk);
          });
          stream.on('error', () => fail());
          stream.on('end', () => {
            if (ended) return;
            if (size !== entry.uncompressedSize || ((crc ^ 0xffffffff) >>> 0) !== entry.crc32) { fail('Corrupted supporting ZIP document (size or checksum mismatch)'); return; }
            const extension = filename.split('.').pop()!.toLowerCase();
            files.push({ fieldname: 'documentsZip', originalname: filename, mimetype: mimeTypes[extension] ?? 'application/octet-stream', buffer: Buffer.concat(chunks), size } as Express.Multer.File);
            zip.readEntry();
          });
        });
      });
      zip.readEntry();
    });
  });
}
