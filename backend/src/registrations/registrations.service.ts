import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ErpUser, Prisma, RegistrationKind, RegistrationStatus } from '@prisma/client';
import { createHmac, randomUUID } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import { DocumentsService } from '../documents/documents.service';
import { ConfigService } from '../config/config.service';
import { CompanyRegistrationDto, CustomerRegistrationDto, PatientRegistrationDto, RegistrationInput, RegistrationQueryDto } from './registration.dto';
import { RegistrationDecisionDto } from './management.dto';
import { NotificationsService } from '../notifications/notifications.service';

const detailsInclude = { customer: { include: { address: true } }, company: true, patient: true, documents: true } satisfies Prisma.RegistrationInclude;
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
    // Stable canonical input excludes credentials, which never leave validation memory.
    const canonical = JSON.stringify({ kind, fields: Object.entries(normalized).filter(([, value]) => value !== undefined).sort(([a], [b]) => a.localeCompare(b)), files: validated.map(file => ({ slot: file.slot, sha256: file.sha256 })).sort((a, b) => a.slot.localeCompare(b.slot)) });
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

    const id = `${prefixes[kind]}-${randomUUID()}`;
    const staged = await this.documents.stageUploads(kind, id, validated);
    try {
      const record = await this.prisma.$transaction(async tx => {
        // This row update serializes successful finalization against the cleanup
        // worker's claim. Both the claim and nested inserts commit together.
        const claim = await tx.uploadBatch.updateMany({ where: { id: staged.batchId, completedAt: null, cleanupStartedAt: null }, data: { completedAt: new Date() } });
        if (claim.count !== 1) throw new ServiceUnavailableException('Upload attempt expired; please retry registration');
        const created = await tx.registration.create({ data: {
          id, kind, mobile, email, status: RegistrationStatus.PENDING, requestHash, idempotencyKey,
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
      this.prisma.registration.findMany({ where, skip: (page - 1) * pageSize, take: pageSize, orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }], include: { customer: true, company: true, patient: true, owner: { select: { state: true } } } }),
      this.prisma.registration.count({ where }),
    ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    return { items: records.map(record => ({ id: record.id, kind: record.kind, status: record.status, submittedAt: record.submittedAt, mobile: record.mobile, email: record.email ?? '', accountStatus: record.owner?.state === 'ACTIVE' ? 'active' : 'inactive', name: record.customer?.customerName ?? record.company?.companyName ?? record.patient?.patientName ?? '', businessType: record.customer?.customerType ?? record.company?.companyName ?? 'Patient' })), total, page, pageSize };
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
    if (input.action === 'reject' && (!input.reason || input.reason.trim().length < 8 || input.reason.length > 2000)) throw new BadRequestException('Rejection reason must contain 8–2000 characters');
    return this.prisma.$transaction(async tx => {
      // Lock database authority until commit; concurrent account revocation waits
      // for this decision, or commits first and prevents the decision.
      const actors = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "ErpUser" WHERE "id" = ${actorId}::uuid AND "state" = 'ACTIVE' AND "role" IN ('ADMIN', 'SUPER_ADMIN') FOR SHARE`;
      if (!actors.length) throw new ForbiddenException('Administrator access required');
      const status = input.action === 'approve' ? RegistrationStatus.APPROVED : RegistrationStatus.REJECTED;
      const decidedAt = new Date();
      // Conditional write prevents two reviewers from overwriting one another.
      const result = await tx.registration.updateMany({ where: { id, status: 'PENDING' }, data: { status, decidedAt, decidedById: actorId, rejectionReason: status === 'REJECTED' ? input.reason : null } });
      if (!result.count) {
        if (!await tx.registration.findUnique({ where: { id }, select: { id: true } })) throw new NotFoundException('Registration not found');
        throw new ConflictException('Registration has already been decided');
      }
      await tx.auditEvent.create({ data: { actorId, registrationId: id, action: `REGISTRATION_${status}`, detail: { status, ...(status === 'REJECTED' ? { reason: input.reason! } : {}) } } });
      const registration = await tx.registration.findUniqueOrThrow({ where: { id }, select: { id: true, kind: true, mobile: true } });
      await NotificationsService.record(tx, registration, status);
      return { ok: true, status, decidedAt, activationPending: true };
    });
  }

  async approved(query: RegistrationQueryDto) {
    return this.list({ ...query, status: 'APPROVED' });
  }

  async mine(user: ErpUser) {
    const kind = ({ CUSTOMER: 'customer', COMPANY: 'company', PATIENT: 'patient' } as const)[user.role as 'CUSTOMER' | 'COMPANY' | 'PATIENT'];
    if (user.state !== 'ACTIVE' || !kind) throw new ForbiddenException('Approved registration owner required');
    const records = await this.prisma.registration.findMany({ where: { ownerId: user.id, kind, status: 'APPROVED' }, include: detailsInclude, orderBy: { id: 'asc' } });
    if (!records.length) throw new ForbiddenException('Approved registration owner required');
    return { items: records.map(record => ({ ...this.toDetail(record), readOnly: true, activationPending: false })) };
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
      id: record.id, kind: record.kind, status: record.status, submittedAt: record.submittedAt,
      mobile: record.mobile, email: record.email, termsAcceptedAt: record.termsAcceptedAt, termsVersion: record.termsVersion,
      decidedAt: record.decidedAt, decidedById: record.decidedById, rejectionReason: record.rejectionReason, readOnly: false, activationPending: true,
      files: Object.fromEntries(record.documents.map(file => [file.slot, { id: file.id, name: file.originalName, type: file.contentType, size: file.size, sha256: file.sha256, accessPath: `/api/documents/${file.id}` }])),
    };
  }
}
