import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ErpUser, Prisma, RegistrationKind, RegistrationStatus } from '@prisma/client';
import { createHmac } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import { DocumentsService } from '../documents/documents.service';
import { ConfigService } from '../config/config.service';
import { CompanyRegistrationDto, CustomerRegistrationDto, PatientRegistrationDto, RegistrationInput, RegistrationQueryDto } from './registration.dto';
import { RegistrationDecisionDto } from './management.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { validateRejection } from './rejection-reasons';
import { hashRegistrationPassword } from '../auth/registration-password';
import { generatedMasterCodeSerial, importedMasterCodeError } from '../common/master-code';

const detailsInclude = { customer: { include: { address: true } }, company: true, patient: true, documents: true, decidedBy: { select: { displayName: true } }, owner: { select: { state: true, username: true } }, notifications: { select: { status: true, event: true }, orderBy: { createdAt: 'desc' }, take: 1 } } satisfies Prisma.RegistrationInclude;
type DetailedRegistration = Prisma.RegistrationGetPayload<{ include: typeof detailsInclude }>;
const prefixes: Record<RegistrationKind, string> = { customer: 'REG-CUS', company: 'REG-COM', patient: 'REG-PAT' };

@Injectable()
export class RegistrationsService {
  constructor(private readonly prisma: PrismaService, private readonly documents: DocumentsService, private readonly config: ConfigService) {}

  async submit(kind: RegistrationKind, input: RegistrationInput, files: Express.Multer.File[], suppliedKey?: string) {
    if (suppliedKey !== undefined && !/^[A-Za-z0-9_-]{16,128}$/.test(suppliedKey)) {
      throw new BadRequestException('Idempotency-Key must contain 16–128 letters, numbers, underscores or hyphens');
    }
    const validated = await this.documents.validateFiles(kind, files);
    const normalized = this.normalize(kind, input);
    // A keyed fingerprint binds retries to the same credentials without storing them.
    const canonical = JSON.stringify({ kind, ...(input.password ? { credentialFingerprint: this.hmac(`credential:${input.password}`) } : {}), fields: Object.entries(normalized).filter(([, value]) => value !== undefined).sort(([a], [b]) => a.localeCompare(b)), files: validated.map(file => ({ slot: file.slot, sha256: file.sha256 })).sort((a, b) => a.slot.localeCompare(b.slot)) });
    const requestHash = this.hmac(canonical);
    const idempotencyKey = suppliedKey ? this.hmac(`registration:${suppliedKey}`) : undefined;
    if (idempotencyKey) {
      const replay = await this.prisma.registration.findUnique({ where: { idempotencyKey } });
      if (replay) return this.replay(replay, requestHash);
    }

    const mobile = String(normalized.mobile);
    const email = normalized.email as string | undefined;
    const duplicate = await this.prisma.registration.findFirst({ where: { kind, OR: [{ mobile }, ...(email ? [{ email }] : [])] }, select: { id: true } });
    if (duplicate) throw new ConflictException('A registration already exists for this contact and registration type');
    if (kind === 'customer' && await this.prisma.customerRegistration.findUnique({ where: { gstNumber: String(normalized.gstNumber) }, select: { registrationId: true } })) {
      throw new ConflictException('A customer registration already exists for this GST number');
    }

    // PostgreSQL nextval is atomic across every backend instance and all kinds.
    // Allocate before uploads so the existing S3 keys and manifest keep the final ID.
    const [{ serial }] = await this.prisma.$queryRaw<{ serial: bigint }[]>`SELECT nextval('registration_submission_seq') AS serial`;
    const id = `${prefixes[kind]}-ZI${serial.toString().padStart(4, '0')}`;
    const passwordHash = input.password ? await hashRegistrationPassword(input.password) : undefined;
    const staged = await this.documents.stageUploads(kind, id, validated);
    try {
      const record = await this.prisma.$transaction(async tx => {
        // This row update serializes successful finalization against the cleanup
        // worker's claim. Both the claim and nested inserts commit together.
        const claim = await tx.uploadBatch.updateMany({ where: { id: staged.batchId, completedAt: null, cleanupStartedAt: null }, data: { completedAt: new Date() } });
        if (claim.count !== 1) throw new ServiceUnavailableException('Upload attempt expired; please retry registration');
        const created = await tx.registration.create({ data: {
          id, kind, mobile, email, passwordHash, status: RegistrationStatus.PENDING, requestHash, idempotencyKey,
          termsAcceptedAt: new Date(), termsVersion: 'registration-v1',
          ...this.profileCreate(kind, normalized),
          documents: { create: staged.documents },
          audits: { create: { action: 'REGISTRATION_SUBMITTED', detail: { kind, documentCount: staged.documents.length } } },
        } });
        return created;
      });
      return { registrationId: record.id, status: record.status };
    } catch (error) {
      // The durable manifest remains retryable if immediate compensation fails.
      await this.documents.cleanupBatch(staged.batchId).catch(() => undefined);
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        if (idempotencyKey) {
          const replay = await this.prisma.registration.findUnique({ where: { idempotencyKey } });
          if (replay) return this.replay(replay, requestHash);
        }
        throw new ConflictException('A registration already exists for this contact, GST number or idempotency key');
      }
      throw error;
    }
  }

  async list(query: RegistrationQueryDto) {
    const { kind, status, page, pageSize } = query;
    const where = { kind, ...(status ? { status } : {}) };
    const [records, total] = await this.prisma.$transaction([
      this.prisma.registration.findMany({ where, skip: (page - 1) * pageSize, take: pageSize, orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }], include: { customer: true, company: true, patient: true, owner: { select: { state: true } }, notifications: detailsInclude.notifications } }),
      this.prisma.registration.count({ where }),
    ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    return { items: records.map(record => ({ id: record.id, masterCode: record.masterCode, kind: record.kind, status: record.status, submittedAt: record.submittedAt, mobile: record.mobile, email: record.email ?? '', accountStatus: record.owner?.state === 'ACTIVE' ? 'active' : 'inactive', activationPending: record.owner?.state !== 'ACTIVE', notificationStatus: record.notifications[0]?.status ?? null, name: record.customer?.customerName ?? record.company?.companyName ?? record.patient?.patientName ?? '', businessType: record.customer?.customerType ?? record.company?.companyName ?? 'Patient' })), total, page, pageSize };
  }

  async summary(kind: RegistrationKind) {
    const groups = await this.prisma.registration.groupBy({ by: ['status'], where: { kind }, _count: { _all: true } });
    const counts = { pending: 0, approved: 0, rejected: 0 };
    for (const group of groups) {
      if (group.status === 'PENDING') counts.pending = group._count._all;
      if (group.status === 'APPROVED') counts.approved = group._count._all;
      if (group.status === 'REJECTED') counts.rejected = group._count._all;
    }
    return counts;
  }

  async detail(id: string) {
    const record = await this.prisma.registration.findUnique({ where: { id }, include: detailsInclude });
    if (!record) throw new NotFoundException('Registration not found');
    return { record: this.toDetail(record) };
  }

  async decide(id: string, input: RegistrationDecisionDto, actorId: string) {
    if (!['approve', 'reject'].includes(input.action)) throw new BadRequestException('Invalid decision');
    let rejection: ReturnType<typeof validateRejection> | undefined;
    if (input.action === 'reject') {
      try { rejection = validateRejection(input); } catch (error) { throw new BadRequestException((error as Error).message); }
    }
    return this.prisma.$transaction(tx => this.decideInTransaction(tx, id, input, actorId));
  }

  async decideInTransaction(tx: Prisma.TransactionClient, id: string, input: RegistrationDecisionDto, actorId: string, importedMasterCode?: string) {
    const rejection = input.action === 'reject' ? validateRejection(input) : undefined;
      // Lock database authority until commit; concurrent account revocation waits
      // for this decision, or commits first and prevents the decision.
      const actors = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "ErpUser" WHERE "id" = ${actorId}::uuid AND "state" = 'ACTIVE' AND "role" IN ('ADMIN', 'SUPER_ADMIN') FOR SHARE`;
      if (!actors.length) throw new ForbiddenException('Administrator access required');
      await tx.$queryRaw`SELECT "id" FROM "Registration" WHERE "id" = ${id} FOR UPDATE`;
      const current = await tx.registration.findUnique({ where: { id }, include: detailsInclude });
      if (!current) throw new NotFoundException('Registration not found');
      if (current.status === 'APPROVED' && input.action === 'approve') {
        if (!current.masterCode || !current.ownerId) throw new ConflictException('Approved registration requires account reconciliation');
        return { ok: true, status: current.status, decidedAt: current.decidedAt, masterCode: current.masterCode, activationPending: current.owner?.state !== 'ACTIVE', accountStatus: current.owner?.state === 'ACTIVE' ? 'active' : 'inactive', notificationStatus: current.notifications[0]?.status ?? null };
      }
      if (rejection) {
        try { validateRejection(input, current.kind); } catch (error) { throw new BadRequestException((error as Error).message); }
      }
      if (current.status === 'REJECTED' && input.action === 'reject') return { ok: true, status: current.status, decidedAt: current.decidedAt, rejectionReason: current.rejectionExpiresAt && current.rejectionExpiresAt > new Date() ? current.rejectionReason : null, notificationStatus: current.notifications[0]?.status ?? null };
      if (current.status !== 'PENDING') throw new ConflictException('Registration has already been decided');
      const status = input.action === 'approve' ? RegistrationStatus.APPROVED : RegistrationStatus.REJECTED;
      const decidedAt = new Date();
      let masterCode: string | null = null;
      let ownerId = current.ownerId;
      if (status === 'APPROVED') {
        // Serialize allocations through commit to keep the dedicated sequence in
        // approval order; row locks above also make repeat decisions idempotent.
        await tx.$queryRaw`SELECT 1::int FROM pg_advisory_xact_lock(26002601)`;
        if (importedMasterCode !== undefined) {
          if (importedMasterCodeError(importedMasterCode)) throw new BadRequestException('Invalid Master Code');
          masterCode = importedMasterCode;
          const serial = generatedMasterCodeSerial(importedMasterCode);
          // Legacy prefixes leave the new-user sequence alone. Imported ZI codes
          // still reserve their numeric range so ordinary approvals cannot reuse it.
          if (serial !== undefined) await tx.$queryRaw`SELECT setval('approved_master_seq', GREATEST((SELECT last_value FROM approved_master_seq), ${serial}::bigint))`;
        } else {
          const [{ serial }] = await tx.$queryRaw<{ serial: bigint }[]>`SELECT nextval('approved_master_seq') AS serial`;
          masterCode = `ZI${serial.toString().padStart(4, '0')}`;
        }
        const role = ({ customer: 'CUSTOMER', company: 'COMPANY', patient: 'PATIENT' } as const)[current.kind];
        if (ownerId) {
          const owner = await tx.erpUser.findUniqueOrThrow({ where: { id: ownerId } });
          if (owner.role !== role) throw new ConflictException('Registration owner role does not match');
          await tx.erpUser.update({ where: { id: ownerId }, data: { state: 'ACTIVE' } });
        } else {
          const emailUsed = current.email ? await tx.erpUser.findFirst({ where: { email: { equals: current.email, mode: 'insensitive' } }, select: { id: true } }) : null;
          const owner = await tx.erpUser.create({ data: {
            username: masterCode, email: emailUsed ? null : current.email,
            displayName: current.customer?.customerName ?? current.company?.adminFullName ?? current.patient?.patientName ?? id,
            role, state: 'ACTIVE', createdById: actorId,
          } });
          ownerId = owner.id;
        }
      }
      // Status, master code, owner, audit and outbox commit or roll back together.
      await tx.registration.update({ where: { id }, data: { status, masterCode, ownerId, decidedAt, decidedById: actorId, rejectionReason: rejection?.reason ?? null, rejectionReasonCode: rejection?.code ?? null, rejectionExpiresAt: rejection ? new Date(decidedAt.getTime() + 30 * 86400000) : null } });
      await tx.auditEvent.create({ data: { actorId, registrationId: id, action: `REGISTRATION_${status}`, detail: { status, ...(masterCode ? { masterCode } : {}) } } });
      const registration = await tx.registration.findUniqueOrThrow({ where: { id }, select: { id: true, kind: true, mobile: true } });
      await NotificationsService.record(tx, registration, status);
      const owner = ownerId ? await tx.erpUser.findUnique({ where: { id: ownerId }, select: { state: true } }) : null;
      return { ok: true, status, decidedAt, rejectionReason: rejection?.reason ?? null, masterCode, activationPending: owner?.state !== 'ACTIVE', accountStatus: owner?.state === 'ACTIVE' ? 'active' : 'inactive', notificationStatus: 'PENDING' };
  }

  async approved(query: RegistrationQueryDto) {
    const { kind, page, pageSize } = query;
    const where = { kind, status: RegistrationStatus.APPROVED };
    const [records, total] = await this.prisma.$transaction([
      this.prisma.registration.findMany({ where, skip: (page - 1) * pageSize, take: pageSize, orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }], include: detailsInclude }),
      this.prisma.registration.count({ where }),
    ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    return { items: records.map(record => ({ ...this.toDetail(record), name: record.customer?.customerName ?? record.company?.companyName ?? record.patient?.patientName ?? '', businessType: record.customer?.customerType ?? record.company?.companyName ?? 'Patient' })), total, page, pageSize };
  }

  async mine(user: ErpUser) {
    const kind = ({ CUSTOMER: 'customer', COMPANY: 'company', PATIENT: 'patient' } as const)[user.role as 'CUSTOMER' | 'COMPANY' | 'PATIENT'];
    if (user.state !== 'ACTIVE' || !kind) throw new ForbiddenException('Approved registration owner required');
    const records = await this.prisma.registration.findMany({ where: { ownerId: user.id, kind, status: 'APPROVED' }, include: detailsInclude, orderBy: { id: 'asc' } });
    if (!records.length) throw new ForbiddenException('Approved registration owner required');
    return { items: records.map(record => ({ ...this.toDetail(record), readOnly: true, activationPending: false })) };
  }

  async allocateImportId(kind: RegistrationKind) {
    const [{ serial }] = await this.prisma.$queryRaw<{ serial: bigint }[]>`SELECT nextval('registration_submission_seq') AS serial`;
    return `${prefixes[kind]}-ZI${serial.toString().padStart(4, '0')}`;
  }

  async allocateImportMasterCode(suppliedCodes: string[]) {
    const reserved = new Set(suppliedCodes);
    return this.prisma.$transaction(async tx => {
      // Share the ordinary approval allocator's lock and sequence. Reserving a
      // number may leave a gap on cancellation, but a retry never reuses it.
      await tx.$queryRaw`SELECT 1::int FROM pg_advisory_xact_lock(26002601)`;
      for (;;) {
        const [{ serial }] = await tx.$queryRaw<{ serial: bigint }[]>`SELECT nextval('approved_master_seq') AS serial`;
        const code = `ZI${serial.toString().padStart(4, '0')}`;
        if (reserved.has(code)) continue;
        if (await tx.registration.findUnique({ where: { masterCode: code }, select: { id: true } })
          || await tx.erpUser.findUnique({ where: { username: code }, select: { id: true } })
          || await tx.importRecord.findFirst({ where: { masterCode: code, job: { deletedAt: null, status: { in: ['VALIDATING', 'READY', 'IMPORTING'] }, expiresAt: { gt: new Date() } } }, select: { id: true } })) continue;
        return code;
      }
    }, { timeout: 30000, maxWait: 15000 });
  }

  async createImported(tx: Prisma.TransactionClient, id: string, kind: RegistrationKind, input: RegistrationInput, passwordHash: string | undefined, documents: Prisma.DocumentCreateWithoutRegistrationInput[], actorId: string, jobId: string, masterCode: string, source: string) {
    const fields = this.normalize(kind, input);
    await tx.registration.create({ data: { id, kind, mobile: fields.mobile!, email: fields.email, passwordHash,
      registrationSource: source, importedById: actorId, importedAt: new Date(), importJobId: jobId,
      requestHash: this.hmac(`import:${jobId}:${id}`), termsAcceptedAt: new Date(), termsVersion: 'registration-v1',
      ...this.profileCreate(kind, fields), documents: { create: documents },
    } });
    const decision = await this.decideInTransaction(tx, id, { action: 'approve' } as RegistrationDecisionDto, actorId, masterCode);
    await tx.auditEvent.create({ data: { actorId, registrationId: id, action: 'ADMINISTRATIVE_IMPORT', detail: { jobId, approvalSource: 'Administrative Import' } } });
    return decision;
  }

  private hmac(value: string) { return createHmac('sha256', this.config.get('IDEMPOTENCY_SECRET')).update(value).digest('hex'); }

  private replay(record: { id: string; status: RegistrationStatus; requestHash: string }, requestHash: string) {
    if (record.requestHash !== requestHash) throw new ConflictException('Idempotency-Key was already used for different registration data');
    return { registrationId: record.id, status: record.status };
  }

  private normalize(kind: RegistrationKind, input: RegistrationInput): Record<string, string | undefined> {
    const { password: _password, confirmPassword: _confirmation, termsAccepted: _terms, ...fields } = input;
    const normalized: Record<string, string | undefined> = { ...fields };
    if (kind === 'company') {
      const company = input as CompanyRegistrationDto;
      normalized.mobile = company.adminMobile;
      normalized.email = company.adminEmail.toLowerCase();
      delete normalized.adminMobile;
      delete normalized.adminEmail;
    } else {
      normalized.email = (input as PatientRegistrationDto).email?.toLowerCase() || undefined;
    }
    if (kind === 'customer') normalized.gstNumber = (input as CustomerRegistrationDto).gstNumber.toUpperCase();
    return normalized;
  }

  private profileCreate(kind: RegistrationKind, fields: Record<string, string | undefined>): Pick<Prisma.RegistrationCreateInput, 'customer' | 'company' | 'patient'> {
    const value = (name: string) => fields[name]!;
    if (kind === 'customer') return { customer: { create: {
      customerName: value('customerName'), businessName: value('businessName'), customerType: value('customerType'),
      dlNumber1: value('dlNumber1'), dlNumber2: value('dlNumber2'), dlNumber3: fields.dlNumber3, fssaiNumber: fields.fssaiNumber,
      gstNumber: value('gstNumber'), creditDays: value('creditDays'), paymentMethod: value('paymentMethod'),
      address: { create: { addressLine1: value('addressLine1'), addressLine2: fields.addressLine2, addressLine3: fields.addressLine3, addressLine4: fields.addressLine4, pinCode: value('pinCode') } },
    } } };
    if (kind === 'company') return { company: { create: { companyName: value('companyName'), division: value('division'), headquarter: value('headquarter'), adminFullName: value('adminFullName') } } };
    return { patient: { create: { patientName: value('patientName'), gender: fields.gender, address: value('address'), paymentMethod: value('paymentMethod') } } };
  }

  private toDetail(record: DetailedRegistration) {
    const profile = record.customer ?? record.company ?? record.patient;
    const { registrationId: _profileId, ...fields } = profile ?? {} as Record<string, unknown>;
    const customerAddress = record.customer?.address;
    const addressFields = customerAddress ? { addressLine1: customerAddress.addressLine1, addressLine2: customerAddress.addressLine2, addressLine3: customerAddress.addressLine3, addressLine4: customerAddress.addressLine4, pinCode: customerAddress.pinCode, address: [customerAddress.addressLine1, customerAddress.addressLine2, customerAddress.addressLine3, customerAddress.addressLine4, customerAddress.pinCode].filter(Boolean).join(', ') } : {};
    return {
      ...fields, ...addressFields,
      importedBy: record.importedById ? record.decidedBy?.displayName : null, registrationSource: record.registrationSource, importedById: record.importedById, importedAt: record.importedAt, importJobId: record.importJobId,
      id: record.id, masterCode: record.masterCode, accountUsername: record.owner?.username ?? null, kind: record.kind, status: record.status, submittedAt: record.submittedAt,
      mobile: record.mobile, email: record.email, termsAcceptedAt: record.termsAcceptedAt, termsVersion: record.termsVersion,
      decidedAt: record.decidedAt, decidedById: record.decidedById, rejectionReason: record.rejectionExpiresAt && record.rejectionExpiresAt > new Date() ? record.rejectionReason : null, rejectionReasonCode: record.rejectionExpiresAt && record.rejectionExpiresAt > new Date() ? record.rejectionReasonCode : null, rejectionExpiresAt: record.rejectionExpiresAt, readOnly: false, activationPending: record.owner?.state !== 'ACTIVE', accountStatus: record.owner?.state === 'ACTIVE' ? 'active' : 'inactive', notificationStatus: record.notifications[0]?.status ?? null,
      files: Object.fromEntries(record.documents.map(file => [file.slot, { id: file.id, name: file.originalName, type: file.contentType, size: file.size, sha256: file.sha256, accessPath: `/api/documents/${file.id}` }])),
    };
  }
}
