import { CallHandler, ExecutionContext, HttpException, Injectable, NestInterceptor, PayloadTooLargeException } from '@nestjs/common';
import { Request } from 'express';
import { StorageEngine } from 'multer';
import { finalize, Observable } from 'rxjs';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { importLimits } from './import-limits';
export const importRequest = new AsyncLocalStorage<string>();

const totalBytes = Symbol('importBytes');
type UploadRequest = Request & { [totalBytes]?: number };
// Enforce aggregate bytes while streaming, before allocating all multipart files.
export const importMemoryStorage: StorageEngine = {
  _handleFile(request, file, callback) {
    const req = request as UploadRequest;
    const chunks: Buffer[] = [];
    let size = 0;
    let failed = false;
    file.stream.on('data', (chunk: Buffer) => {
      const limits = importLimits();
      const fileLimit = file.fieldname === 'documentsZip' ? limits.archiveBytes : file.fieldname === 'file' ? limits.workbookBytes : limits.documentBytes;
      if (size + chunk.length > fileLimit) {
        if (!failed) { failed = true; chunks.length = 0; callback(new PayloadTooLargeException('Import file exceeds the configured byte limit')); }
        return;
      }
      req[totalBytes] = (req[totalBytes] ?? 0) + chunk.length;
      if (req[totalBytes]! > importLimits().archiveBytes + importLimits().workbookBytes) {
        if (!failed) { failed = true; chunks.length = 0; callback(new PayloadTooLargeException('Import multipart files exceed the configured aggregate byte limit')); }
        return;
      }
      if (!failed) { chunks.push(chunk); size += chunk.length; }
    });
    file.stream.on('error', error => { if (!failed) { failed = true; callback(error); } });
    file.stream.on('end', () => { if (!failed) callback(null, { buffer: Buffer.concat(chunks), size }); });
  },
  _removeFile(_req, file, callback) { file.buffer?.fill(0); callback(null); },
};

@Injectable()
export class ImportCapacityInterceptor implements NestInterceptor {
  private active = 0;
  intercept(context: ExecutionContext, next: CallHandler) {
    const req = context.switchToHttp().getRequest<Request>();
    if (req.method !== 'POST') return new Observable(subscriber => importRequest.run(String(context.switchToHttp().getResponse().getHeader('X-Request-ID') ?? randomUUID()), () => next.handle().subscribe(subscriber)));
    if (this.active >= importLimits().concurrent) throw new HttpException('Import capacity reached; retry shortly', 429);
    this.active++;
    return new Observable(subscriber => importRequest.run(String(context.switchToHttp().getResponse().getHeader('X-Request-ID') ?? randomUUID()), () => next.handle().subscribe(subscriber))).pipe(finalize(() => { this.active--; }));
  }
}
