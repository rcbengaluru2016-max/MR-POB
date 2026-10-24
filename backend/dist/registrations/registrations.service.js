"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RegistrationsService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const node_crypto_1 = require("node:crypto");
const prisma_service_1 = require("../database/prisma.service");
const documents_service_1 = require("../documents/documents.service");
const config_service_1 = require("../config/config.service");
const notifications_service_1 = require("../notifications/notifications.service");
const detailsInclude = { customer: { include: { address: true } }, company: true, patient: true, documents: true };
const prefixes = { customer: 'REG-CUS', company: 'REG-COM', patient: 'REG-PAT' };
let RegistrationsService = class RegistrationsService {
    prisma;
    documents;
    config;
    constructor(prisma, documents, config) {
        this.prisma = prisma;
        this.documents = documents;
        this.config = config;
    }
    async submit(kind, input, files, suppliedKey) {
        if (suppliedKey !== undefined && !/^[A-Za-z0-9_-]{16,128}$/.test(suppliedKey)) {
            throw new common_1.BadRequestException('Idempotency-Key must contain 16–128 letters, numbers, underscores or hyphens');
        }
        const validated = await this.documents.validateFiles(kind, files);
        const normalized = this.normalize(kind, input);
        // Stable canonical input excludes credentials, which never leave validation memory.
        const canonical = JSON.stringify({ kind, fields: Object.entries(normalized).filter(([, value]) => value !== undefined).sort(([a], [b]) => a.localeCompare(b)), files: validated.map(file => ({ slot: file.slot, sha256: file.sha256 })).sort((a, b) => a.slot.localeCompare(b.slot)) });
        const requestHash = this.hmac(canonical);
        const idempotencyKey = suppliedKey ? this.hmac(`registration:${suppliedKey}`) : undefined;
        if (idempotencyKey) {
            const replay = await this.prisma.registration.findUnique({ where: { idempotencyKey } });
            if (replay)
                return this.replay(replay, requestHash);
        }
        const mobile = String(normalized.mobile);
        const email = normalized.email;
        const duplicate = await this.prisma.registration.findFirst({ where: { kind, OR: [{ mobile }, ...(email ? [{ email }] : [])] }, select: { id: true } });
        if (duplicate)
            throw new common_1.ConflictException('A registration already exists for this contact and registration type');
        if (kind === 'customer' && await this.prisma.customerRegistration.findUnique({ where: { gstNumber: String(normalized.gstNumber) }, select: { registrationId: true } })) {
            throw new common_1.ConflictException('A customer registration already exists for this GST number');
        }
        const id = `${prefixes[kind]}-${(0, node_crypto_1.randomUUID)()}`;
        const staged = await this.documents.stageUploads(kind, id, validated);
        try {
            const record = await this.prisma.$transaction(async (tx) => {
                // This row update serializes successful finalization against the cleanup
                // worker's claim. Both the claim and nested inserts commit together.
                const claim = await tx.uploadBatch.updateMany({ where: { id: staged.batchId, completedAt: null, cleanupStartedAt: null }, data: { completedAt: new Date() } });
                if (claim.count !== 1)
                    throw new common_1.ServiceUnavailableException('Upload attempt expired; please retry registration');
                const created = await tx.registration.create({ data: {
                        id, kind, mobile, email, status: client_1.RegistrationStatus.PENDING, requestHash, idempotencyKey,
                        termsAcceptedAt: new Date(), termsVersion: 'registration-v1',
                        ...this.profileCreate(kind, normalized),
                        documents: { create: staged.documents },
                        audits: { create: { action: 'REGISTRATION_SUBMITTED', detail: { kind, documentCount: staged.documents.length } } },
                    } });
                return created;
            });
            return { registrationId: record.id, status: record.status };
        }
        catch (error) {
            // The durable manifest remains retryable if immediate compensation fails.
            await this.documents.cleanupBatch(staged.batchId).catch(() => undefined);
            if (error instanceof client_1.Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
                if (idempotencyKey) {
                    const replay = await this.prisma.registration.findUnique({ where: { idempotencyKey } });
                    if (replay)
                        return this.replay(replay, requestHash);
                }
                throw new common_1.ConflictException('A registration already exists for this contact, GST number or idempotency key');
            }
            throw error;
        }
    }
    async list(query) {
        const { kind, status, page, pageSize } = query;
        const where = { kind, ...(status ? { status } : {}) };
        const [records, total] = await this.prisma.$transaction([
            this.prisma.registration.findMany({ where, skip: (page - 1) * pageSize, take: pageSize, orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }], include: { customer: true, company: true, patient: true, owner: { select: { state: true } } } }),
            this.prisma.registration.count({ where }),
        ], { isolationLevel: client_1.Prisma.TransactionIsolationLevel.RepeatableRead });
        return { items: records.map(record => ({ id: record.id, kind: record.kind, status: record.status, submittedAt: record.submittedAt, mobile: record.mobile, email: record.email ?? '', accountStatus: record.owner?.state === 'ACTIVE' ? 'active' : 'inactive', name: record.customer?.customerName ?? record.company?.companyName ?? record.patient?.patientName ?? '', businessType: record.customer?.customerType ?? record.company?.companyName ?? 'Patient' })), total, page, pageSize };
    }
    async summary(kind) {
        const groups = await this.prisma.registration.groupBy({ by: ['status'], where: { kind }, _count: { _all: true } });
        const counts = { pending: 0, approved: 0, rejected: 0 };
        for (const group of groups) {
            if (group.status === 'PENDING')
                counts.pending = group._count._all;
            if (group.status === 'APPROVED')
                counts.approved = group._count._all;
            if (group.status === 'REJECTED')
                counts.rejected = group._count._all;
        }
        return counts;
    }
    async detail(id) {
        const record = await this.prisma.registration.findUnique({ where: { id }, include: detailsInclude });
        if (!record)
            throw new common_1.NotFoundException('Registration not found');
        return { record: this.toDetail(record) };
    }
    async decide(id, input, actorId) {
        if (!['approve', 'reject'].includes(input.action))
            throw new common_1.BadRequestException('Invalid decision');
        if (input.action === 'reject' && (!input.reason || input.reason.trim().length < 8 || input.reason.length > 2000))
            throw new common_1.BadRequestException('Rejection reason must contain 8–2000 characters');
        return this.prisma.$transaction(async (tx) => {
            // Lock database authority until commit; concurrent account revocation waits
            // for this decision, or commits first and prevents the decision.
            const actors = await tx.$queryRaw `SELECT "id" FROM "ErpUser" WHERE "id" = ${actorId}::uuid AND "state" = 'ACTIVE' AND "role" IN ('ADMIN', 'SUPER_ADMIN') FOR SHARE`;
            if (!actors.length)
                throw new common_1.ForbiddenException('Administrator access required');
            const status = input.action === 'approve' ? client_1.RegistrationStatus.APPROVED : client_1.RegistrationStatus.REJECTED;
            const decidedAt = new Date();
            // Conditional write prevents two reviewers from overwriting one another.
            const result = await tx.registration.updateMany({ where: { id, status: 'PENDING' }, data: { status, decidedAt, decidedById: actorId, rejectionReason: status === 'REJECTED' ? input.reason : null } });
            if (!result.count) {
                if (!await tx.registration.findUnique({ where: { id }, select: { id: true } }))
                    throw new common_1.NotFoundException('Registration not found');
                throw new common_1.ConflictException('Registration has already been decided');
            }
            await tx.auditEvent.create({ data: { actorId, registrationId: id, action: `REGISTRATION_${status}`, detail: { status, ...(status === 'REJECTED' ? { reason: input.reason } : {}) } } });
            const registration = await tx.registration.findUniqueOrThrow({ where: { id }, select: { id: true, kind: true, mobile: true } });
            await notifications_service_1.NotificationsService.record(tx, registration, status);
            return { ok: true, status, decidedAt, activationPending: true };
        });
    }
    async approved(query) {
        return this.list({ ...query, status: 'APPROVED' });
    }
    async mine(user) {
        const kind = { CUSTOMER: 'customer', COMPANY: 'company', PATIENT: 'patient' }[user.role];
        if (user.state !== 'ACTIVE' || !kind)
            throw new common_1.ForbiddenException('Approved registration owner required');
        const records = await this.prisma.registration.findMany({ where: { ownerId: user.id, kind, status: 'APPROVED' }, include: detailsInclude, orderBy: { id: 'asc' } });
        if (!records.length)
            throw new common_1.ForbiddenException('Approved registration owner required');
        return { items: records.map(record => ({ ...this.toDetail(record), readOnly: true, activationPending: false })) };
    }
    hmac(value) { return (0, node_crypto_1.createHmac)('sha256', this.config.get('IDEMPOTENCY_SECRET')).update(value).digest('hex'); }
    replay(record, requestHash) {
        if (record.requestHash !== requestHash)
            throw new common_1.ConflictException('Idempotency-Key was already used for different registration data');
        return { registrationId: record.id, status: record.status };
    }
    normalize(kind, input) {
        const { password: _password, confirmPassword: _confirmation, termsAccepted: _terms, ...fields } = input;
        const normalized = { ...fields };
        if (kind === 'company') {
            const company = input;
            normalized.mobile = company.adminMobile;
            normalized.email = company.adminEmail.toLowerCase();
            delete normalized.adminMobile;
            delete normalized.adminEmail;
        }
        else {
            normalized.email = input.email?.toLowerCase() || undefined;
        }
        if (kind === 'customer')
            normalized.gstNumber = input.gstNumber.toUpperCase();
        return normalized;
    }
    profileCreate(kind, fields) {
        const value = (name) => fields[name];
        if (kind === 'customer')
            return { customer: { create: {
                        customerName: value('customerName'), businessName: value('businessName'), customerType: value('customerType'),
                        dlNumber1: value('dlNumber1'), dlNumber2: value('dlNumber2'), dlNumber3: fields.dlNumber3, fssaiNumber: fields.fssaiNumber,
                        gstNumber: value('gstNumber'), creditDays: value('creditDays'), paymentMethod: value('paymentMethod'),
                        address: { create: { addressLine1: value('addressLine1'), addressLine2: fields.addressLine2, addressLine3: fields.addressLine3, addressLine4: fields.addressLine4, pinCode: value('pinCode') } },
                    } } };
        if (kind === 'company')
            return { company: { create: { companyName: value('companyName'), division: value('division'), headquarter: value('headquarter'), adminFullName: value('adminFullName') } } };
        return { patient: { create: { patientName: value('patientName'), gender: fields.gender, address: value('address'), paymentMethod: value('paymentMethod') } } };
    }
    toDetail(record) {
        const profile = record.customer ?? record.company ?? record.patient;
        const { registrationId: _profileId, ...fields } = profile ?? {};
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
};
exports.RegistrationsService = RegistrationsService;
exports.RegistrationsService = RegistrationsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, documents_service_1.DocumentsService, config_service_1.ConfigService])
], RegistrationsService);
//# sourceMappingURL=registrations.service.js.map