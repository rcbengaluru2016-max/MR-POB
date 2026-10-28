import { BadRequestException, ConflictException, HttpException, Injectable, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ImportJob, Prisma, RegistrationKind } from '@prisma/client';
import { createHmac, randomUUID } from 'node:crypto';
import ExcelJS from 'exceljs';
import { PrismaService } from '../database/prisma.service';
import { ConfigService } from '../config/config.service';
import { DocumentsService, documentSlots, StagedDocument } from '../documents/documents.service';
import { RegistrationsService } from '../registrations/registrations.service';
import { RegistrationInput } from '../registrations/registration.dto';
import { hashRegistrationPassword } from '../auth/registration-password';
import { safeFields, safeFilename, validateInput, masterCodeError } from './import-schema';
import { parseImportSpreadsheet } from './import-spreadsheet';
import { parseDocumentZip } from './import-document-zip';
import { ImportQueryDto } from './imports.dto';
import { importRequest } from './import-upload';
import { importLimits } from './import-limits';
import { checkImportDocumentSafety } from './import-document-security';

type Staged = { batchId: string; documents: StagedDocument[] };
type Checked = { credentialHash?: string; masterCode: string; rowNumber: number; input: RegistrationInput; errors: string[]; duplicate: boolean; files: Express.Multer.File[]; reservedId?: string; staged?: Staged };
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

@Injectable()
export class ImportsService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private working = false;
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService, private readonly documents: DocumentsService, private readonly registrations: RegistrationsService) {}
  onModuleInit() { this.timer = setInterval(() => { void this.tick().catch(() => undefined); }, 3000); this.timer.unref(); }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }
  fingerprint(bytes: Buffer) { return createHmac('sha256', this.config.get('IDEMPOTENCY_SECRET')).update(bytes).digest('hex'); }
  async audit(actorId: string, action: string, jobId?: string, tx: Prisma.TransactionClient = this.prisma) {
    await tx.auditEvent.create({ data: { actorId, action: `IMPORT_${action}`, detail: { ...(jobId ? { jobId } : {}), requestId: importRequest.getStore() ?? randomUUID(), result: action.includes('FAILED') ? 'failure' : 'success' } } });
  }
  private async duplicate(kind: RegistrationKind, input: RegistrationInput, tx: Prisma.TransactionClient = this.prisma, masterCode?: string) {
    const fields = input as unknown as Record<string, string>;
    const email = (fields.adminEmail || fields.email)?.toLowerCase();
    const mobile = fields.adminMobile || fields.mobile;
    return Boolean((masterCode && (await tx.registration.findUnique({ where: { masterCode }, select: { id: true } }) || await tx.erpUser.findUnique({ where: { username: masterCode }, select: { id: true } }))) || await tx.registration.findFirst({ where: { kind, OR: [{ mobile }, ...(email ? [{ email: { equals: email, mode: 'insensitive' as const } }] : [])] }, select: { id: true } })
      || (email && await tx.erpUser.findFirst({ where: { email: { equals: email, mode: 'insensitive' } }, select: { id: true } }))
      || (kind === 'customer' && fields.gstNumber && await tx.customerRegistration.findUnique({ where: { gstNumber: fields.gstNumber.toUpperCase() }, select: { registrationId: true } })));
  }
  private async check(kind: RegistrationKind, rows: Record<string, unknown>[], files: Express.Multer.File[], single: boolean, zipMode = false) {
    const limits = importLimits();
    if (files.length > 1500 || files.reduce((sum, f) => sum + f.size, 0) > limits.totalDocumentBytes || files.some(f => f.size > limits.documentBytes)) throw new BadRequestException('Supporting documents exceed the configured upload limits');
    const names = new Map<string, Express.Multer.File>();
    for (const file of files) {
      safeFilename(file.originalname);
      const key = single ? file.fieldname : file.originalname;
      if (names.has(key) || (!single && [...names.values()].some(f => f.originalname.toLowerCase() === file.originalname.toLowerCase()))) throw new BadRequestException('Duplicate or ambiguous document filenames');
      names.set(key, file);
    }
    const seen = new Map<string, Checked>();
    const used = new Set<string>();
    const checked: Checked[] = [];
    for (const [index, row] of rows.entries()) {
      const fields = { ...row };
      const mapped: Express.Multer.File[] = [];
      const errors: string[] = [];
      for (const slot of [...documentSlots[kind].required, ...documentSlots[kind].optional]) {
        const reference = single ? slot : String(fields[`${slot}File`] ?? '');
        delete fields[`${slot}File`];
        if (reference) {
          try { safeFilename(reference); }
          catch { errors.push(`Invalid document reference: ${slot}File (use a safe filename, not a path)`); continue; }
          const file = names.get(reference);
          if (file) { mapped.push({ ...file, fieldname: slot, originalname: single || zipMode ? file.originalname : file.originalname.replace(/^row-[0-9]+-[A-Za-z0-9]+-/, '') }); used.add(reference); }
          else if (!single || documentSlots[kind].required.includes(slot)) errors.push(`Missing document: ${slot}File "${reference}"`);
        } else if (documentSlots[kind].required.includes(slot)) errors.push(`Missing document: ${slot}File (filename required)`);
      }
      for (const key of Object.keys(fields)) if (fields[key] === '' && !['password', 'confirmPassword'].includes(key)) delete fields[key];
      // A blank bulk cell explicitly requests a new-user code. Single imports
      // continue to require the original identifier supplied by the operator.
      const codeError = !single && fields.masterCode === undefined ? undefined : masterCodeError(fields.masterCode);
      if (codeError) errors.push(codeError);
      const validated = await validateInput(kind, fields);
      const entry: Checked = { masterCode: typeof fields.masterCode === 'string' ? fields.masterCode : '', rowNumber: index + 2, input: validated.input, errors: [...errors, ...validated.errors], duplicate: false, files: mapped };
      const data = safeFields(entry.input);
      const identifiers = [entry.masterCode, String(data.mobile || data.adminMobile || ''), String(data.email || data.adminEmail || '').toLowerCase(), kind === 'customer' ? String(data.gstNumber || '').toUpperCase() : ''];
      for (const [identifierIndex, identifier] of identifiers.entries()) {
        if (!identifier) continue;
        const key = `${identifierIndex}:${identifier}`;
        const previous = seen.get(key);
        if (previous) { entry.duplicate = previous.duplicate = true; previous.errors.push(identifierIndex === 0 ? 'Duplicate Master Code within workbook' : 'Duplicate identifier within workbook'); }
        else seen.set(key, entry);
      }
      if (entry.duplicate) entry.errors.push('Duplicate Master Code or registration identifier within workbook');
      if (await this.duplicate(kind, entry.input, this.prisma, entry.masterCode)) { entry.duplicate = true; entry.errors.push('Master Code or registration identifier already registered'); }
      for (const document of mapped) {
        try { await checkImportDocumentSafety([document]); await this.documents.validateFiles(kind, [document], { requireAll: false }); }
        catch (error) {
          const reason = error instanceof HttpException && [400, 413, 415].includes(error.getStatus()) ? error.message : 'content, type, size or security validation failed';
          entry.errors.push(`Invalid document: ${document.fieldname}File "${document.originalname}" (${reason})`);
        }
      }
      checked.push(entry);
    }
    const unreferenced = [...names.keys()].filter(key => !used.has(key));
    if (single && unreferenced.length) throw new BadRequestException('Unreferenced supporting document supplied');
    if (checked.reduce((sum, row) => sum + row.files.reduce((size, file) => size + file.size, 0), 0) > limits.totalDocumentBytes) throw new BadRequestException('Referenced documents exceed the per-job storage quota, including repeated references');
    return { checked, warnings: unreferenced.map(name => `Unreferenced document ignored: ${name}`) };
  }
  private uploadFingerprint(kind: RegistrationKind, file: Express.Multer.File, archive?: Express.Multer.File) {
    return archive ? this.fingerprint(Buffer.from(JSON.stringify({ kind, spreadsheet: file.originalname, spreadsheetHash: this.fingerprint(file.buffer), archive: archive.originalname, archiveHash: this.fingerprint(archive.buffer) }))) : this.fingerprint(file.buffer);
  }
  async validate(kind: RegistrationKind, file: Express.Multer.File, archive: Express.Multer.File | undefined, actorId: string) {
    const parsed = await parseImportSpreadsheet(kind, file);
    if (archive && parsed.files.length) throw new BadRequestException('Use ZIP documents or legacy embedded workbook attachments, not both');
    if (!archive && /\.csv$/i.test(file.originalname)) throw new BadRequestException('CSV imports require a Supporting Documents ZIP (an empty ZIP is allowed when no documents are required)');
    const files = archive ? await parseDocumentZip(archive) : parsed.files;
    try {
      return await this.stage(kind, parsed.rows, files, actorId, file.originalname, this.uploadFingerprint(kind, file, archive), false, undefined, archive?.originalname);
    } finally { for (const document of files) document.buffer.fill(0); }
  }
  private async stage(kind: RegistrationKind, rows: Record<string, unknown>[], files: Express.Multer.File[], actorId: string, filename: string, fingerprint: string, single: boolean, key?: string, supportingFileName?: string) {
    const job = await this.prisma.$transaction(async tx => {
      // Serialize quota allocation across backend instances for this administrator.
      await tx.$queryRaw`SELECT 1::int FROM pg_advisory_xact_lock(26002602, hashtext(${actorId}))`;
      const active = await tx.importJob.count({ where: { uploadedById: actorId, deletedAt: null, status: { in: ['VALIDATING', 'READY', 'IMPORTING'] }, expiresAt: { gt: new Date() } } });
      if (active >= 5) throw new HttpException('Five active imports already exist; finish or delete an upload before retrying', 429);
      return tx.importJob.create({ data: { kind, importType: single ? 'Single' : 'Bulk', fileName: safeFilename(filename), supportingFileName: supportingFileName ? safeFilename(supportingFileName) : undefined, uploadedById: actorId, requestHash: fingerprint, idempotencyKey: key, status: 'VALIDATING', expiresAt: new Date(Date.now() + 30 * 60000) } });
    });
    await this.audit(actorId, 'UPLOAD', job.id);
    const staged: Staged[] = [];
    let rowsChecked: Checked[] = [];
    try {
      const checked = await this.check(kind, rows, files, single, Boolean(supportingFileName));
      rowsChecked = checked.checked;
      const { warnings } = checked;
      const valid = rowsChecked.filter(row => !row.errors.length).length;
      await this.prisma.importJob.update({ where: { id: job.id }, data: { totalRecords: rowsChecked.length, validRecords: valid, warnings } });
      if (valid > 0) {
        const suppliedCodes = rowsChecked.map(row => row.masterCode).filter(Boolean);
        for (const row of rowsChecked.filter(row => !row.errors.length)) {
          if (!row.masterCode) row.masterCode = await this.registrations.allocateImportMasterCode(suppliedCodes);
          row.credentialHash = row.input.password ? await hashRegistrationPassword(row.input.password) : undefined;
          row.reservedId = await this.registrations.allocateImportId(kind);
          row.staged = await this.documents.stageUploads(kind, row.reservedId, await this.documents.validateFiles(kind, row.files), job.id, single ? undefined : row.masterCode);
          staged.push(row.staged);
        }
      }
      await this.prisma.$transaction(async tx => {
        const active = await tx.importJob.updateMany({ where: { id: job.id, status: 'VALIDATING', expiresAt: { gt: new Date() } }, data: { warnings, status: valid > 0 ? 'READY' : 'VALIDATION_FAILED', totalRecords: rowsChecked.length, validRecords: valid, errorSummary: valid === rowsChecked.length ? null : `${rowsChecked.length - valid} records contain blocking validation errors; download results for details` } });
        if (active.count !== 1) throw new ConflictException('Import validation session expired');
        await tx.importRecord.createMany({ data: rowsChecked.map(row => ({ jobId: job.id, rowNumber: row.rowNumber, registrationId: row.reservedId, masterCode: row.masterCode, data: json(safeFields(row.input)), errors: row.errors, duplicate: row.duplicate, batchId: row.staged?.batchId, credentialHash: row.credentialHash, documents: json(row.staged?.documents ?? row.files.map(file => ({ slot: file.fieldname, originalName: file.originalname, size: file.size, contentType: file.mimetype }))) })) });
        await this.audit(actorId, 'VALIDATED', job.id, tx);
      });
      return this.preview(job.id, actorId);
    } catch (error) {
      await Promise.all(staged.map(item => this.documents.cleanupBatch(item.batchId)));
      await this.prisma.importJob.update({ where: { id: job.id }, data: { status: 'FAILED', errorSummary: 'Validation or document staging failed; no registrations committed. Validate again.' } });
      if (rowsChecked.length) {
        await this.prisma.importRecord.createMany({ skipDuplicates: true, data: rowsChecked.map(row => ({ jobId: job.id, rowNumber: row.rowNumber, masterCode: row.masterCode, registrationId: row.reservedId, data: json(safeFields(row.input)), duplicate: row.duplicate, errors: [...row.errors, 'Validation or document staging failed; validate again'], documents: json([]) })) });
        await this.prisma.importRecord.updateMany({ where: { jobId: job.id }, data: { credentialHash: null, errors: ['Validation or document staging failed; validate again'] } });
      }
      await this.audit(actorId, 'VALIDATION_FAILED', job.id);
      throw error;
    }
  }
  async preview(id: string, actorId: string) {
    const job = await this.get(id);
    const records = await this.prisma.importRecord.findMany({ where: { jobId: id }, orderBy: { rowNumber: 'asc' } });
    await this.audit(actorId, 'PREVIEW', id);
    return { id, status: job.status, supportingFileName: job.supportingFileName, warnings: job.warnings, ready: job.status === 'READY' && !job.confirmedAt && job.expiresAt > new Date(), counts: { total: job.totalRecords, valid: records.filter(record => !record.errors.length).length, failed: records.filter(record => record.errors.length).length, readyDocuments: job.status === 'READY' && job.expiresAt > new Date() ? records.filter(record => !record.errors.length).reduce((count, record) => count + (Array.isArray(record.documents) ? record.documents.length : 0), 0) : 0, duplicates: records.filter(r => r.duplicate).length, extractedDocuments: records.reduce((n, r) => n + (Array.isArray(r.documents) ? r.documents.length : 0), 0), documentFailures: records.filter(r => r.errors.some(e => /document/i.test(e))).length, missingDocuments: records.reduce((n, r) => n + r.errors.filter(e => e.startsWith('Missing document')).length, 0) }, rows: records.map(r => {
      const data = r.data as Record<string, string>;
      return { rowNumber: r.rowNumber, registrationId: ['COMPLETED', 'PARTIALLY_COMPLETED'].includes(job.status) && !r.errors.length ? r.registrationId : null, masterCode: r.masterCode, category: job.kind, documentStatus: r.errors.some(e => /document/i.test(e)) ? 'Invalid' : 'Validated', name: data.customerName || data.companyName || data.patientName || '', mobile: data.mobile || data.adminMobile || '', email: data.email || data.adminEmail || '', fields: r.data, valid: !r.errors.length, duplicate: r.duplicate, errors: r.errors };
    }) };
  }
  async confirm(id: string, file: Express.Multer.File, actorId: string, archive?: Express.Multer.File) {
    const job = await this.get(id);
    if (Boolean(job.supportingFileName) !== Boolean(archive) || job.requestHash !== this.uploadFingerprint(job.kind, file, archive)) throw new ConflictException('Confirmation requires the identical validated spreadsheet and supporting ZIP');
    if (['COMPLETED', 'PARTIALLY_COMPLETED'].includes(job.status)) return this.result(job);
    if (job.status === 'IMPORTING' || (job.status === 'READY' && job.confirmedAt)) return this.result(job);
    const claim = await this.prisma.importJob.updateMany({ where: { id, status: 'READY', deletedAt: null, expiresAt: { gt: new Date() }, confirmedAt: null }, data: { confirmedAt: new Date() } });
    if (!claim.count) throw new ConflictException('Import expired or not ready');
    await this.audit(actorId, 'QUEUED', id);
    // The durable READY + confirmedAt row is polled after restart as well.
    void this.tick().catch(() => undefined);
    return { ...this.result(job), status: 'READY', queued: true };
  }
  async tick() {
    if (this.working) return;
    this.working = true;
    try {
      await this.expire();
      const jobs = await this.prisma.importJob.findMany({ where: { status: 'READY', confirmedAt: { not: null }, deletedAt: null, expiresAt: { gt: new Date() } }, orderBy: { uploadedAt: 'asc' }, take: 1 });
      for (const job of jobs) await this.commit(job, job.uploadedById).catch(() => undefined);
    } finally { this.working = false; }
  }
  private async commit(job: ImportJob, actorId: string) {
    const claim = await this.prisma.importJob.updateMany({ where: { id: job.id, deletedAt: null, status: 'READY', expiresAt: { gt: new Date() } }, data: { status: 'IMPORTING', confirmedAt: new Date(), expiresAt: new Date(Date.now() + 15 * 60000) } });
    if (!claim.count) {
      const current = await this.get(job.id);
      if (['COMPLETED', 'PARTIALLY_COMPLETED'].includes(current.status)) return this.result(current);
      throw new ConflictException('Import is processing, expired or not ready');
    }
    await this.audit(actorId, 'CONFIRMED', job.id);
    const records = await this.prisma.importRecord.findMany({ where: { jobId: job.id }, orderBy: { rowNumber: 'asc' } });
    let imported = 0;
    for (const row of records) {
      if (row.errors.length) continue;
      try {
        await this.prisma.$transaction(async tx => {
          // Lock the job for the complete row transaction: expiry and deletion cannot race a commit.
          await tx.$queryRaw`SELECT "id" FROM "ImportJob" WHERE "id" = ${job.id}::uuid FOR UPDATE`;
          const current = await tx.importJob.findUniqueOrThrow({ where: { id: job.id } });
          if (current.status !== 'IMPORTING') throw new ConflictException('Import lease expired');
          await tx.$queryRaw`SELECT 1::int FROM pg_advisory_xact_lock(26002601)`;
          if (!row.registrationId || !row.batchId || masterCodeError(row.masterCode)) throw new ConflictException('Validation session is incomplete');
          const input = row.data as unknown as RegistrationInput;
          if (await this.duplicate(job.kind, input, tx, row.masterCode!)) throw new ConflictException('Identifier already registered after validation');
          const batch = await tx.uploadBatch.updateMany({ where: { id: row.batchId, completedAt: null, cleanupStartedAt: null }, data: { completedAt: new Date() } });
          if (batch.count !== 1) throw new ConflictException('Document staging expired; validate again');
          await this.registrations.createImported(tx, row.registrationId, job.kind, input, row.credentialHash ?? undefined, row.documents as unknown as StagedDocument[], actorId, job.id, row.masterCode!, `${job.importType} Import`);
          await tx.importRecord.update({ where: { id: row.id }, data: { credentialHash: null } });
          await tx.importJob.update({ where: { id: job.id }, data: { importedRecords: { increment: 1 }, expiresAt: new Date(Date.now() + 15 * 60000) } });
        }, { timeout: 30000, maxWait: 15000 });
        imported++;
      } catch (error) {
        const message = error instanceof ConflictException ? error.message : 'Row import failed; check conflicts and document storage, then validate again';
        await this.prisma.importRecord.update({ where: { id: row.id }, data: { errors: [message], credentialHash: null } });
        if (row.batchId) await this.documents.cleanupBatch(row.batchId);
      }
      await this.prisma.importJob.updateMany({ where: { id: job.id, status: 'IMPORTING' }, data: { progress: Math.floor(imported * 100 / records.length) } });
    }
    const completed = await this.prisma.importJob.update({ where: { id: job.id }, data: { status: imported === records.length ? 'COMPLETED' : imported ? 'PARTIALLY_COMPLETED' : 'FAILED', completedAt: new Date(), errorSummary: imported === records.length ? null : `${records.length - imported} rows were not imported` } });
    await this.audit(actorId, imported ? 'COMPLETED' : 'FAILED', job.id);
    return this.result(completed);
  }

  async single(kind: RegistrationKind, fields: Record<string, unknown>, files: Express.Multer.File[], actorId: string, key: string) {
    if (!/^[A-Za-z0-9_-]{16,128}$/.test(key)) throw new BadRequestException('A 16–128 character Idempotency-Key is required');
    const fingerprint = this.fingerprint(Buffer.from(JSON.stringify({ kind, fields: Object.entries(fields).sort(), files: files.map(f => [f.fieldname, this.fingerprint(f.buffer)]).sort() })));
    const scopedKey = this.fingerprint(Buffer.from(`${actorId}:${key}`));
    const previous = await this.prisma.importJob.findUnique({ where: { idempotencyKey: scopedKey } });
    if (previous) {
      if (previous.requestHash !== fingerprint) throw new ConflictException('Idempotency-Key already used for different data');
      if (previous.status === 'COMPLETED') {
        const row = await this.prisma.importRecord.findFirstOrThrow({ where: { jobId: previous.id } });
        return { ...this.result(previous), registrationId: row.registrationId, masterCode: row.masterCode };
      }
      throw new ConflictException('Single import already submitted; inspect upload history');
    }
    let preview: Awaited<ReturnType<ImportsService['preview']>>;
    try { preview = await this.stage(kind, [fields], files, actorId, `single-${randomUUID()}`, fingerprint, true, scopedKey); }
    catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('Import already submitted'); throw error; }
    if (!preview.ready) throw new BadRequestException(preview.rows.flatMap(row => row.errors));
    const result = await this.commit(await this.get(preview.id), actorId);
    const row = await this.prisma.importRecord.findFirstOrThrow({ where: { jobId: preview.id } });
    if (result.status !== 'COMPLETED') throw new ConflictException(row.errors.join('; ') || 'Single import failed; inspect upload history');
    return { ...result, registrationId: row.registrationId, masterCode: row.masterCode };
  }
  private result(job: ImportJob) { return { id: job.id, status: job.status, imported: job.importedRecords, failed: ['COMPLETED', 'PARTIALLY_COMPLETED', 'FAILED'].includes(job.status) ? job.totalRecords - job.importedRecords : job.totalRecords - job.validRecords, duplicates: 0, results: [] }; }
  async get(id: string) { const job = await this.prisma.importJob.findFirst({ where: { id, deletedAt: null } }); if (!job) throw new NotFoundException('Import not found'); return job; }
  async list(query: ImportQueryDto) {
    const where: Prisma.ImportJobWhereInput = { deletedAt: null, kind: query.kind, status: query.status };
    const [jobs, total] = await this.prisma.$transaction([this.prisma.importJob.findMany({ where, include: { uploadedBy: { select: { displayName: true } } }, skip: (query.page - 1) * query.pageSize, take: query.pageSize, orderBy: [{ uploadedAt: query.order }, { id: query.order }] }), this.prisma.importJob.count({ where })]);
    return { items: jobs.map(job => ({ id: job.id, fileName: job.fileName, supportingFileName: job.supportingFileName, warnings: job.warnings, kind: job.kind, uploadedBy: job.uploadedBy.displayName, uploadedAt: job.uploadedAt, totalRecords: job.totalRecords, successfulRecords: job.importedRecords, failedRecords: ['FAILED', 'PARTIALLY_COMPLETED'].includes(job.status) ? job.totalRecords - job.importedRecords : job.totalRecords - job.validRecords, status: job.status, progress: job.progress, errorSummary: job.errorSummary })), total, page: query.page, pageSize: query.pageSize };
  }
  async detail(id: string) {
    const job = await this.get(id);
    const actor = await this.prisma.erpUser.findUniqueOrThrow({ where: { id: job.uploadedById }, select: { displayName: true } });
    return { id, kind: job.kind, importType: job.importType, fileName: job.fileName, supportingFileName: job.supportingFileName, warnings: job.warnings, uploadedBy: actor.displayName, uploadedAt: job.uploadedAt, status: job.status, progress: job.progress, totalRecords: job.totalRecords, validRecords: job.validRecords, invalidRecords: job.totalRecords - job.validRecords, importedRecords: job.importedRecords, errorSummary: job.errorSummary, confirmedAt: job.confirmedAt, completedAt: job.completedAt, expiresAt: job.expiresAt };
  }
  async download(id: string, actorId: string) {
    await this.get(id);
    const records = await this.prisma.importRecord.findMany({ where: { jobId: id }, orderBy: { rowNumber: 'asc' } });
    const book = new ExcelJS.Workbook(); const sheet = book.addWorksheet('Results');
    const keys = [...new Set(records.flatMap(row => Object.keys(row.data as object)))];
    sheet.addRow(['Row', ...keys, 'Master Code', 'Errors']);
    for (const row of records) { const data = row.data as Record<string, string>; sheet.addRow([row.rowNumber, ...keys.map(key => data[key] ?? ''), row.masterCode ?? '', row.errors.join('; ')]); }
    const job = await this.get(id);
    if (job.warnings.length) { const warnings = book.addWorksheet('Warnings'); warnings.addRow(['Warning']); job.warnings.forEach(message => warnings.addRow([message])); }
    await this.audit(actorId, 'DOWNLOAD', id);
    return Buffer.from(await book.xlsx.writeBuffer());
  }
  async remove(id: string, actorId: string) {
    await this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "ImportJob" WHERE "id" = ${id}::uuid FOR UPDATE`;
      const job = await tx.importJob.findFirst({ where: { id, deletedAt: null } });
      if (!job) throw new NotFoundException('Import not found');
      if (['IMPORTING', 'VALIDATING', 'PENDING_VALIDATION'].includes(job.status)) throw new ConflictException('Cannot delete an active import');
      await tx.importJob.update({ where: { id }, data: { deletedAt: new Date(), ...(job.status === 'READY' ? { status: 'CANCELLED' as const } : {}) } });
      await tx.importRecord.updateMany({ where: { jobId: id }, data: { credentialHash: null } });
      await this.audit(actorId, 'DELETED', id, tx);
    });
    const records = await this.prisma.importRecord.findMany({ where: { jobId: id } });
    for (const row of records) if (row.batchId) await this.documents.cleanupBatch(row.batchId);
    return { ok: true };
  }
  async expire() {
    // A dead process leaves an uncommitted transaction which PostgreSQL rolls back.
    const jobs = await this.prisma.importJob.findMany({ where: { status: { in: ['READY', 'VALIDATING', 'IMPORTING'] }, expiresAt: { lt: new Date() } }, take: 20 });
    for (const job of jobs) {
      const claim = await this.prisma.importJob.updateMany({ where: { id: job.id, status: job.status, expiresAt: { lt: new Date() } }, data: { status: job.status === 'READY' ? 'CANCELLED' : 'FAILED', errorSummary: 'Import session expired; validate again' } });
      if (!claim.count) continue;
      await this.prisma.importRecord.updateMany({ where: { jobId: job.id }, data: { credentialHash: null } });
      for (const row of await this.prisma.importRecord.findMany({ where: { jobId: job.id } })) if (row.batchId) await this.documents.cleanupBatch(row.batchId);
      await this.audit(job.uploadedById, 'EXPIRED', job.id);
    }
  }
}
