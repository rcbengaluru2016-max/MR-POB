import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit, PayloadTooLargeException, ServiceUnavailableException, UnsupportedMediaTypeException } from '@nestjs/common';
import { ErpUser, RegistrationKind } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import { PrismaService } from '../database/prisma.service';
import { S3StorageService } from './s3-storage.service';

export type ValidatedFile = { slot: string; originalName: string; buffer: Buffer; contentType: string; size: number; sha256: string; extension: string };
export type StagedDocument = Omit<ValidatedFile, 'buffer' | 'extension'> & { id: string; objectKey: string; versionId?: string };
const slots: Record<RegistrationKind, { required: string[]; optional: string[] }> = {
  customer: { required: ['dl1', 'dl2', 'gstCertificate', 'shopOutside', 'shopInside'], optional: ['dl3'] },
  company: { required: ['companyLogo', 'adminPhoto'], optional: [] },
  patient: { required: [], optional: ['idProof'] },
};

@Injectable()
export class DocumentsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DocumentsService.name);
  private timer?: NodeJS.Timeout;
  private cleaning = false;
  constructor(private readonly prisma: PrismaService, private readonly storage: S3StorageService) {}
  onModuleInit() {
    this.timer = setInterval(() => { void this.reconcile().catch(() => this.logger.error('Upload reconciliation failed')); }, 60000);
    this.timer.unref();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  async validateFiles(kind: RegistrationKind, files: Express.Multer.File[]): Promise<ValidatedFile[]> {
    const policy = slots[kind];
    const seen = new Set<string>();
    for (const file of files) {
      if (![...policy.required, ...policy.optional].includes(file.fieldname) || seen.has(file.fieldname)) throw new BadRequestException('Unexpected or repeated document field');
      seen.add(file.fieldname);
    }
    for (const required of policy.required) if (!seen.has(required)) throw new BadRequestException(`${required} is required`);
    const validated: ValidatedFile[] = [];
    for (const file of files) {
      const bytes = file.buffer;
      if (!bytes?.length) throw new BadRequestException('Empty document');
      if (bytes.length > 5 * 1024 * 1024) throw new PayloadTooLargeException('Documents must be 5 MiB or smaller');
      let contentType: string;
      let extension: string;
      if (bytes.subarray(0, 5).toString() === '%PDF-') { contentType = 'application/pdf'; extension = 'pdf'; }
      else if (bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) { contentType = 'image/png'; extension = 'png'; }
      else if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) { contentType = 'image/jpeg'; extension = 'jpg'; }
      else if (bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP') { contentType = 'image/webp'; extension = 'webp'; }
      else throw new UnsupportedMediaTypeException('Document must contain PDF, JPEG, PNG or WEBP data');
      const suppliedExtension = file.originalname.split('.').pop()?.toLowerCase();
      if (file.mimetype !== contentType || !(extension === 'jpg' ? ['jpg', 'jpeg'] : [extension]).includes(suppliedExtension ?? '')) {
        throw new UnsupportedMediaTypeException('Document extension, content and MIME type must agree');
      }
      if (kind === 'company' && extension === 'pdf') throw new UnsupportedMediaTypeException('Company logo and admin photo must be images');
      try {
        if (extension === 'pdf') {
          const pdf = await PDFDocument.load(bytes, { throwOnInvalidObject: true, updateMetadata: false });
          if (pdf.isEncrypted || pdf.getPageCount() < 1) throw new Error('Invalid PDF');
        } else {
          const decoder = sharp(bytes, { limitInputPixels: 25000000, failOn: 'warning' });
          const metadata = await decoder.metadata();
          if ((metadata.pages ?? 1) > 1) throw new Error('Animated images are unsupported');
          await decoder.stats();
        }
      } catch { throw new UnsupportedMediaTypeException('Document could not be decoded safely'); }
      validated.push({ slot: file.fieldname, originalName: file.originalname.replace(/[/\\\x00-\x1f\x7f]/g, '_').slice(-200),
        buffer: bytes, contentType, size: bytes.length, extension, sha256: createHash('sha256').update(bytes).digest('hex') });
    }
    return validated;
  }
  async stageUploads(kind: RegistrationKind, registrationId: string, files: ValidatedFile[]): Promise<{ batchId: string; documents: StagedDocument[] }> {
    const documents: StagedDocument[] = files.map(({ buffer: _buffer, extension, ...file }) => ({ ...file, id: randomUUID(), objectKey: `registration/${kind}/${registrationId}/${randomUUID()}.${extension}` }));
    const batch = await this.prisma.uploadBatch.create({ data: { registrationId, cleanupAfter: new Date(Date.now() + 3600000), objects: { create: documents.map(doc => ({ objectKey: doc.objectKey })) } } });
    try {
      for (let i = 0; i < documents.length; i++) {
        const doc = documents[i];
        const { versionId } = await this.storage.put(doc.objectKey, files[i].buffer, doc.contentType, doc.sha256);
        doc.versionId = versionId;
        await this.prisma.$transaction(async tx => {
          // Serialize the post-PUT acknowledgement with cleanup's parent-row claim.
          // A PUT that finishes after cleanup started must be compensated, not finalized.
          const active = await tx.uploadBatch.updateMany({ where: { id: batch.id, completedAt: null, cleanupStartedAt: null }, data: { cleanupAfter: new Date(Date.now() + 3600000) } });
          if (active.count !== 1) throw new Error('Upload batch expired during upload');
          await tx.uploadObject.update({ where: { objectKey: doc.objectKey }, data: { versionId } });
        });
      }
      return { batchId: batch.id, documents };
    } catch {
      // A process suspended past the cleanup deadline may resume after its manifest
      // was reconciled. Restore its intent before compensating an uncertain PUT.
      await this.prisma.uploadBatch.upsert({ where: { registrationId },
        create: { id: batch.id, registrationId, cleanupStartedAt: new Date(), cleanupAfter: new Date(), objects: { create: documents.map(doc => ({ objectKey: doc.objectKey, versionId: doc.versionId })) } },
        update: {},
      }).catch(() => this.logger.error(JSON.stringify({ event: 'upload_manifest_restore_retry', batchId: batch.id })));
      await this.cleanupBatch(batch.id);
      throw new ServiceUnavailableException('Document upload failed; please retry');
    }
  }
  async cleanupBatch(batchId: string): Promise<void> {
    try {
      const batch = await this.prisma.uploadBatch.findUnique({ where: { id: batchId }, include: { objects: true } });
      if (!batch || batch.completedAt) return;
      // This row update serializes against finalization. Once claimed, the final
      // registration transaction cannot commit references to deleted objects.
      const claim = await this.prisma.uploadBatch.updateMany({ where: { id: batchId, completedAt: null }, data: { cleanupStartedAt: new Date() } });
      if (!claim.count) return;
      let failed = false;
      for (const object of batch.objects) {
        try { await this.storage.remove(object.objectKey, object.versionId); }
        catch { failed = true; this.logger.error(JSON.stringify({ event: 'upload_cleanup_retry', batchId })); }
      }
      // Keep aborted intent as a tombstone. A suspended writer or an uncertain S3
      // request can finish after this scan; deleting its manifest would lose recovery.
      // Clean tombstones are checked daily; failed deletes retry after five minutes.
      await this.prisma.uploadBatch.updateMany({ where: { id: batchId, completedAt: null }, data: { cleanupAfter: new Date(Date.now() + (failed ? 300000 : 86400000)) } });
    } catch { this.logger.error(JSON.stringify({ event: 'upload_cleanup_database_retry', batchId })); }
  }
  async reconcile(): Promise<void> {
    if (this.cleaning) return;
    this.cleaning = true;
    try {
      const now = new Date();
      const batches = await this.prisma.uploadBatch.findMany({ where: { completedAt: null, cleanupAfter: { lte: now } }, take: 20, orderBy: { cleanupAfter: 'asc' } });
      for (const batch of batches) {
        const lease = await this.prisma.uploadBatch.updateMany({ where: { id: batch.id, completedAt: null, cleanupAfter: { lte: now } }, data: { cleanupAfter: new Date(Date.now() + 900000) } });
        if (lease.count) await this.cleanupBatch(batch.id);
      }
      await this.prisma.uploadBatch.deleteMany({ where: { completedAt: { lt: new Date(Date.now() - 7 * 86400000) } } });
    } finally { this.cleaning = false; }
  }
  async download(id: string, user: ErpUser, preview = false) {
    const document = await this.prisma.document.findUnique({ where: { id }, include: { registration: true } });
    if (!document) throw new NotFoundException('Document not found');
    const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(user.role);
    if (user.state !== 'ACTIVE' || (!isAdmin && (document.registration.ownerId !== user.id || document.registration.status !== 'APPROVED'))) throw new ForbiddenException('Document access denied');
    if (preview && !['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(document.contentType)) throw new UnsupportedMediaTypeException('This document cannot be previewed. Use Download instead.');
    await this.prisma.auditEvent.create({ data: { actorId: user.id, registrationId: document.registrationId, action: 'DOCUMENT_ACCESS', detail: { documentId: id } } });
    const args = [document.objectKey, document.originalName, document.versionId] as const;
    return { url: preview ? await this.storage.signedDownload(...args, { contentType: document.contentType }) : await this.storage.signedDownload(...args), expiresIn: 60 };
  }
}
