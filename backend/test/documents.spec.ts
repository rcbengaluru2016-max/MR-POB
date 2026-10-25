import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import { DocumentsService } from '../src/documents/documents.service';
import { S3StorageService } from '../src/documents/s3-storage.service';
import { PrismaService } from '../src/database/prisma.service';
import { ConfigService } from '../src/config/config.service';
import { S3Client, DeleteObjectCommand, ListObjectVersionsCommand, PutObjectCommand } from '@aws-sdk/client-s3';

const file = (slot: string, buffer: Buffer, mimetype = 'image/png', originalname = 'proof.png') => ({ fieldname: slot, originalname, buffer, mimetype, size: buffer.length }) as Express.Multer.File;

describe('Document validation and reliable uploads', () => {
  let png: Buffer;
  let service: DocumentsService;
  let prisma: any;
  let storage: any;
  beforeAll(async () => { png = await sharp({ create: { width: 2, height: 2, channels: 3, background: 'white' } }).png().toBuffer(); });
  beforeEach(() => {
    prisma = { uploadBatch: { create: jest.fn().mockResolvedValue({ id: 'batch' }), upsert: jest.fn().mockResolvedValue({ id: 'batch' }), findUnique: jest.fn(), deleteMany: jest.fn(), update: jest.fn(), findMany: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }) }, uploadObject: { update: jest.fn() }, document: { findUnique: jest.fn() }, auditEvent: { create: jest.fn() } };
    prisma.$transaction = jest.fn((callback: (tx: unknown) => unknown) => callback(prisma));
    storage = { put: jest.fn().mockResolvedValue({ versionId: 'version' }), remove: jest.fn(), signedDownload: jest.fn().mockResolvedValue('https://private.example/signed') };
    service = new DocumentsService(prisma, storage);
  });
  it('decodes PDFs/JPEG/PNG/WEBP and enforces company image-only rules', async () => {
    const pdf = await PDFDocument.create(); pdf.addPage();
    const pdfBytes = Buffer.from(await pdf.save());
    for (const [type, ext, bytes] of [
      ['image/png', 'png', png], ['image/jpeg', 'jpeg', await sharp(png).jpeg().toBuffer()],
      ['image/webp', 'webp', await sharp(png).webp().toBuffer()], ['application/pdf', 'pdf', pdfBytes],
    ] as const) {
      const result = await service.validateFiles('patient', [file('idProof', bytes, type, `proof.${ext}`)]);
      expect(result[0]).toMatchObject({ slot: 'idProof', contentType: type, size: bytes.length });
      expect(result[0].sha256).toMatch(/^[a-f0-9]{64}$/);
    }
    await expect(service.validateFiles('company', [file('companyLogo', pdfBytes, 'application/pdf', 'logo.pdf'), file('adminPhoto', png)])).rejects.toThrow('must be images');
  });
  it('rejects spoofed, corrupt, oversized, empty, unexpected and repeated document content', async () => {
    for (const bad of [file('idProof', Buffer.from('malware')), file('idProof', png, 'application/pdf', 'proof.pdf'), file('idProof', Buffer.from('%PDF-corrupt'), 'application/pdf', 'proof.pdf')]) {
      await expect(service.validateFiles('patient', [bad])).rejects.toThrow();
    }
    await expect(service.validateFiles('patient', [file('idProof', Buffer.alloc(5 * 1024 * 1024 + 1))])).rejects.toMatchObject({ status: 413 });
    await expect(service.validateFiles('patient', [file('idProof', Buffer.alloc(0))])).rejects.toThrow('Empty');
    await expect(service.validateFiles('patient', [file('arbitrary', png)])).rejects.toThrow('Unexpected');
    await expect(service.validateFiles('patient', [file('idProof', png), file('idProof', png)])).rejects.toThrow('repeated');
    await expect(service.validateFiles('customer', [])).rejects.toThrow('dl1 is required');
  });
  it('persists every intended key before the first upload and ignores unsafe filenames in keys', async () => {
    const files = await service.validateFiles('patient', [file('idProof', png, 'image/png', '../../unsafe.png')]);
    const result = await service.stageUploads('patient', 'REG-PAT-test', files);
    expect(prisma.uploadBatch.create.mock.invocationCallOrder[0]).toBeLessThan(storage.put.mock.invocationCallOrder[0]);
    expect(result.documents[0].objectKey).toMatch(/^registration\/patient\/REG-PAT-test\/[a-f0-9-]+\.png$/);
    expect(result.documents[0]).not.toHaveProperty('buffer');
    expect(result.documents[0]).toHaveProperty('versionId', 'version');
  });
  it('compensates uncertain upload failures using the pre-recorded key', async () => {
    const files = await service.validateFiles('patient', [file('idProof', png)]);
    storage.put.mockRejectedValue(new Error('timeout after remote write'));
    prisma.uploadBatch.findUnique.mockResolvedValue({ completedAt: null, objects: [{ objectKey: 'intended-key', versionId: null }] });
    await expect(service.stageUploads('patient', 'REG-PAT-test', files)).rejects.toMatchObject({ status: 503 });
    expect(storage.remove).toHaveBeenCalledWith('intended-key', null);
    expect(prisma.uploadBatch.deleteMany).not.toHaveBeenCalled();
    expect(prisma.uploadBatch.updateMany).toHaveBeenCalledWith({ where: { id: 'batch', completedAt: null }, data: { cleanupAfter: expect.any(Date) } });
  });
  it('retains a manifest for failed cleanup, and never deletes committed registration files', async () => {
    prisma.uploadBatch.findUnique.mockResolvedValue({ completedAt: null, objects: [{ objectKey: 'key' }] });
    storage.remove.mockRejectedValue(new Error('S3 unavailable'));
    await service.cleanupBatch('batch');
    expect(prisma.uploadBatch.deleteMany).not.toHaveBeenCalled();
    expect(prisma.uploadBatch.updateMany).toHaveBeenCalledWith({ where: { id: 'batch', completedAt: null }, data: { cleanupAfter: expect.any(Date) } });
    storage.remove.mockClear();
    prisma.uploadBatch.findUnique.mockResolvedValue({ completedAt: new Date(), objects: [{ objectKey: 'committed' }] });
    await service.cleanupBatch('batch');
    expect(storage.remove).not.toHaveBeenCalled();
  });
  it('compensates a PUT that finishes after cleanup claims its manifest', async () => {
    const files = await service.validateFiles('patient', [file('idProof', png)]);
    prisma.uploadBatch.updateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValue({ count: 1 });
    prisma.uploadBatch.findUnique.mockResolvedValue({ completedAt: null, objects: [{ objectKey: 'late-object', versionId: null }] });
    await expect(service.stageUploads('patient', 'REG-PAT-late', files)).rejects.toMatchObject({ status: 503 });
    expect(prisma.uploadObject.update).not.toHaveBeenCalled();
    expect(storage.remove).toHaveBeenCalledWith('late-object', null);
    expect(prisma.uploadBatch.deleteMany).not.toHaveBeenCalled();
  });
  it('enforces document ownership and approved status; an active admin can view pending documents', async () => {
    const doc = { id: 'doc', registrationId: 'reg', objectKey: 'key', originalName: 'proof.png', registration: { ownerId: 'owner', status: 'PENDING' } };
    prisma.document.findUnique.mockResolvedValue(doc);
    const owner = { id: 'owner', role: 'PATIENT', state: 'ACTIVE' } as any;
    await expect(service.download('doc', owner)).rejects.toMatchObject({ status: 403 });
    doc.registration.status = 'APPROVED';
    await expect(service.download('doc', { ...owner, id: 'other' })).rejects.toMatchObject({ status: 403 });
    await expect(service.download('doc', { ...owner, state: 'INACTIVE' })).rejects.toMatchObject({ status: 403 });
    expect((await service.download('doc', owner)).expiresIn).toBe(60);
    doc.registration.status = 'PENDING';
    await service.download('doc', { id: 'admin', state: 'ACTIVE', role: 'ADMIN' } as any);
    expect(prisma.auditEvent.create).toHaveBeenCalledTimes(2);
    expect(storage.signedDownload).toHaveBeenCalledTimes(2);
  });
  it.each(['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])('authorizes an inline preview for %s without changing the normal download', async contentType => {
    prisma.document.findUnique.mockResolvedValue({ id: 'doc', objectKey: 'key', originalName: 'proof', versionId: 'v1', contentType, registration: { ownerId: 'owner', status: 'PENDING' } });
    const admin = { id: 'admin', role: 'SUPER_ADMIN', state: 'ACTIVE' } as any;
    await service.download('doc', admin, true);
    expect(storage.signedDownload).toHaveBeenLastCalledWith('key', 'proof', 'v1', { contentType });
    await service.download('doc', admin);
    expect(storage.signedDownload).toHaveBeenLastCalledWith('key', 'proof', 'v1');
    await expect(service.download('doc', { id: 'other', role: 'PATIENT', state: 'ACTIVE' } as any, true)).rejects.toMatchObject({ status: 403 });
  });
  it('rejects non-previewable content before issuing a URL', async () => {
    prisma.document.findUnique.mockResolvedValue({ contentType: 'text/html', registration: { status: 'PENDING' } });
    await expect(service.download('doc', { id: 'admin', role: 'ADMIN', state: 'ACTIVE' } as any, true)).rejects.toMatchObject({ status: 415 });
    expect(storage.signedDownload).not.toHaveBeenCalled();
  });
});

describe('S3 transport security and version reconciliation', () => {
  const config = { get: (key: string) => ({ S3_BUCKET: 'zenex-international-mrpob-files', S3_REGION: 'ap-south-1', AWS_REGION: 'ap-southeast-2' } as Record<string, string>)[key], optional: () => undefined } as unknown as ConfigService;
  afterEach(() => jest.restoreAllMocks());
  it('uses the Mumbai region even when Cognito and SQS remain in Sydney', async () => {
    const storage = new S3StorageService(config);
    const client = (storage as unknown as { client: S3Client }).client;
    expect(await client.config.region()).toBe('ap-south-1');
    client.destroy();
  });
  it('signs downloads for the new Mumbai bucket with the existing expiry and version', async () => {
    const storage = new S3StorageService(config);
    const client = (storage as unknown as { client: S3Client }).client;
    client.config.credentials = async () => ({ accessKeyId: 'test-key', secretAccessKey: 'test-secret' });
    try {
      const url = new URL(await storage.signedDownload('registration/customer/reg/proof.pdf', 'proof.pdf', 'v1'));
      expect(url.hostname).toBe('zenex-international-mrpob-files.s3.ap-south-1.amazonaws.com');
      expect(url.searchParams.get('X-Amz-Expires')).toBe('60');
      expect(url.searchParams.get('versionId')).toBe('v1');
      expect(url.searchParams.get('response-content-disposition')).toMatch(/^attachment;/);
      const preview = new URL(await storage.signedDownload('registration/customer/reg/proof.pdf', 'proof.pdf', 'v1', { contentType: 'application/pdf' }));
      expect(preview.searchParams.get('response-content-disposition')).toBe('inline; filename="proof.pdf"');
      expect(preview.searchParams.get('response-content-type')).toBe('application/pdf');
      expect(preview.searchParams.get('X-Amz-Expires')).toBe('60');
    } finally { client.destroy(); }
  });
  it('uploads privately with encryption and checksum, without trusting client ACLs', async () => {
    const send = jest.spyOn(S3Client.prototype, 'send').mockResolvedValue({ VersionId: 'v1' } as never);
    const storage = new S3StorageService(config);
    await storage.put('registration/patient/reg/id.png', Buffer.from('x'), 'image/png', '00'.repeat(32));
    const command = send.mock.calls[0][0] as PutObjectCommand;
    expect(command.input).toMatchObject({ Bucket: 'zenex-international-mrpob-files', ServerSideEncryption: 'AES256', ContentType: 'image/png', ChecksumSHA256: expect.any(String) });
    expect(command.input.ACL).toBeUndefined();
  });
  it('reports expired credentials safely and signs again after the provider recovers', async () => {
    const storage = new S3StorageService(config);
    const client = (storage as unknown as { client: S3Client }).client;
    const failure = Object.assign(new Error('private SDK diagnostics'), { name: 'CredentialsProviderError' });
    const credentials = jest.fn().mockRejectedValueOnce(failure).mockResolvedValue({ accessKeyId: 'test-key', secretAccessKey: 'test-secret' });
    client.config.credentials = credentials;
    try {
      await expect(storage.signedDownload('key', 'proof.png', 'v1', { contentType: 'image/png' }))
        .rejects.toMatchObject({ status: 503, code: 'AWS_CREDENTIALS_UNAVAILABLE', message: 'Document storage is temporarily unavailable' });
      const recovered = new URL(await storage.signedDownload('key', 'proof.png', 'v1', { contentType: 'image/png' }));
      expect(recovered.searchParams.get('response-content-disposition')).toBe('inline; filename="proof.png"');
      expect(recovered.searchParams.get('versionId')).toBe('v1');
    } finally { client.destroy(); }
  });
  it('removes all exact-key versions after an uncertain PUT, preserves adjacent keys and creates no new marker', async () => {
    const commands: any[] = [];
    jest.spyOn(S3Client.prototype, 'send').mockImplementation((async (command: any) => {
      commands.push(command);
      return command instanceof ListObjectVersionsCommand ? { Versions: [{ Key: 'key', VersionId: 'v1' }, { Key: 'key', VersionId: 'v2' }, { Key: 'key-other', VersionId: 'safe' }], DeleteMarkers: [{ Key: 'key', VersionId: 'marker' }] } : {};
    }) as any);
    await new S3StorageService(config).remove('key');
    const deletes = commands.filter(command => command instanceof DeleteObjectCommand).map(command => command.input);
    expect(deletes.map(command => command.VersionId).sort()).toEqual(['marker', 'v1', 'v2']);
    expect(deletes.every(command => command.Key === 'key')).toBe(true);
  });
});
