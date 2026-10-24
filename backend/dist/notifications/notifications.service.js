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
var NotificationsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationsService = exports.templateVariable = exports.templateKey = exports.retryDelaySeconds = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const prisma_service_1 = require("../database/prisma.service");
const config_service_1 = require("../config/config.service");
const whatsapp_provider_1 = require("./whatsapp.provider");
const retryDelaySeconds = (attempt) => Math.min(3600, 30 * 2 ** Math.min(attempt - 1, 7));
exports.retryDelaySeconds = retryDelaySeconds;
const templateKey = (kind, event) => `registration.${kind}.${event.toLowerCase()}`;
exports.templateKey = templateKey;
const templateVariable = (key) => `WHATSAPP_TEMPLATE_${key.replaceAll('.', '_').toUpperCase()}`;
exports.templateVariable = templateVariable;
const runnable = ['PENDING', 'RETRY'];
let NotificationsService = NotificationsService_1 = class NotificationsService {
    prisma;
    config;
    provider;
    logger = new common_1.Logger(NotificationsService_1.name);
    constructor(prisma, config, provider) {
        this.prisma = prisma;
        this.config = config;
        this.provider = provider;
    }
    static async record(tx, registration, event) {
        const key = (0, exports.templateKey)(registration.kind, event);
        return tx.registrationNotification.create({ data: {
                registrationId: registration.id, kind: registration.kind, event,
                // Existing forms collect Indian ten-digit mobile numbers, not a second
                // independently supplied WhatsApp destination. Never trust a job recipient.
                recipient: `+91${registration.mobile}`, templateKey: key,
                payload: { registrationId: registration.id, registrationType: registration.kind, decision: event },
            } });
    }
    async process(id) {
        const now = new Date();
        const token = (0, node_crypto_1.randomUUID)();
        const claimed = await this.prisma.registrationNotification.updateMany({ where: { id, status: { in: runnable }, nextAttemptAt: { lte: now } },
            data: { status: 'PROCESSING', claimToken: token, leaseUntil: new Date(now.getTime() + 60_000) } });
        if (!claimed.count)
            return;
        let row = await this.prisma.registrationNotification.findUniqueOrThrow({ where: { id } });
        // Persist the attempt and template before any external side effect.
        const mock = (this.config.optional('WHATSAPP_PROVIDER') ?? 'mock') === 'mock' && this.config.optional('WHATSAPP_LIVE_ENABLED') !== 'true';
        const template = mock ? `mock:${row.templateKey}` : this.config.optional((0, exports.templateVariable)(row.templateKey));
        const attempt = row.attempts + 1;
        row = await this.prisma.$transaction(async (tx) => {
            await tx.notificationAttempt.create({ data: { notificationId: id, number: attempt, outcome: 'STARTED' } });
            return tx.registrationNotification.update({ where: { id }, data: { attempts: attempt, templateId: template ?? null } });
        });
        let status;
        let errorCode;
        let messageId;
        let retrySeconds = (0, exports.retryDelaySeconds)(attempt);
        const abort = new AbortController();
        let timeout;
        try {
            if (row.event === 'REJECTED' && this.config.optional('WHATSAPP_REJECTIONS_ENABLED') !== 'true')
                throw new whatsapp_provider_1.ProviderFailure('blocked', 'REJECTION_NOTIFICATIONS_DISABLED');
            if (!template || (!mock && this.config.optional('WHATSAPP_TEMPLATES_APPROVED') !== 'true'))
                throw new whatsapp_provider_1.ProviderFailure('blocked', 'APPROVED_TEMPLATE_REQUIRED');
            if (!/^\+91[6-9]\d{9}$/.test(row.recipient))
                throw new whatsapp_provider_1.ProviderFailure('failed', 'INVALID_REGISTERED_MOBILE');
            const result = await Promise.race([
                this.provider.send({ idempotencyKey: row.id, recipient: row.recipient, template, payload: row.payload }, abort.signal),
                new Promise((_resolve, reject) => { timeout = setTimeout(() => { abort.abort(); reject(new whatsapp_provider_1.ProviderFailure('unknown', 'PROVIDER_TIMEOUT')); }, 15_000); }),
            ]);
            status = result.status;
            messageId = result.messageId;
        }
        catch (error) {
            const failure = error instanceof whatsapp_provider_1.ProviderFailure ? error : new whatsapp_provider_1.ProviderFailure('unknown', 'PROVIDER_RESPONSE_UNCERTAIN');
            errorCode = /^[A-Z0-9_]{1,100}$/.test(failure.code) ? failure.code : 'PROVIDER_ERROR';
            status = failure.disposition === 'retry' ? (attempt >= 5 ? 'FAILED' : 'RETRY') : failure.disposition === 'blocked' ? 'BLOCKED' : failure.disposition === 'failed' ? 'FAILED' : 'UNKNOWN';
            retrySeconds = Math.max(retrySeconds, Math.min(86400, Math.max(0, failure.retryAfterSeconds)));
        }
        finally {
            if (timeout)
                clearTimeout(timeout);
        }
        await this.prisma.$transaction(async (tx) => {
            const done = await tx.registrationNotification.updateMany({ where: { id, status: 'PROCESSING', claimToken: token }, data: {
                    status, lastError: errorCode ?? null, providerMessageId: messageId, claimToken: null, leaseUntil: null,
                    nextAttemptAt: new Date(Date.now() + retrySeconds * 1000), enqueueAfter: new Date(Date.now() + (status === 'RETRY' ? retrySeconds * 1000 : 0)),
                } });
            if (done.count)
                await tx.notificationAttempt.update({ where: { notificationId_number: { notificationId: id, number: attempt } }, data: { outcome: status, errorCode, finishedAt: new Date() } });
        });
        this.logger.log(JSON.stringify({ event: 'registration_notification_processed', notificationId: id, status, attempt, errorCode }));
    }
    async recoverExpired() {
        // A process may die after the provider accepts a message but before commit.
        // Without documented provider idempotency, never automatically resend it.
        await this.prisma.$transaction(async (tx) => {
            const expired = await tx.registrationNotification.findMany({ where: { status: 'PROCESSING', leaseUntil: { lt: new Date() } }, take: 100 });
            for (const row of expired) {
                const result = await tx.registrationNotification.updateMany({ where: { id: row.id, status: 'PROCESSING', claimToken: row.claimToken, leaseUntil: { lt: new Date() } }, data: { status: 'UNKNOWN', lastError: 'WORKER_LEASE_EXPIRED', claimToken: null, leaseUntil: null } });
                if (result.count)
                    await tx.notificationAttempt.updateMany({ where: { notificationId: row.id, outcome: 'STARTED' }, data: { outcome: 'UNKNOWN', errorCode: 'WORKER_LEASE_EXPIRED', finishedAt: new Date() } });
            }
        });
    }
    async list(registrationId) {
        return { items: await this.prisma.registrationNotification.findMany({ where: { registrationId }, orderBy: { createdAt: 'desc' }, include: { deliveries: { orderBy: { number: 'asc' } } } }) };
    }
    async detail(id) {
        const notification = await this.prisma.registrationNotification.findUnique({ where: { id }, include: { deliveries: { orderBy: { number: 'asc' } } } });
        if (!notification)
            throw new common_1.NotFoundException('Notification not found');
        return { notification };
    }
};
exports.NotificationsService = NotificationsService;
exports.NotificationsService = NotificationsService = NotificationsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, config_service_1.ConfigService, whatsapp_provider_1.WhatsAppProvider])
], NotificationsService);
//# sourceMappingURL=notifications.service.js.map