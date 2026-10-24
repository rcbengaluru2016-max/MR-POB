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
var NotificationWorker_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationWorker = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../database/prisma.service");
const config_service_1 = require("../config/config.service");
const notifications_service_1 = require("./notifications.service");
const sqs_service_1 = require("./sqs.service");
let NotificationWorker = NotificationWorker_1 = class NotificationWorker {
    prisma;
    config;
    notifications;
    queue;
    logger = new common_1.Logger(NotificationWorker_1.name);
    timer;
    running;
    stopped = false;
    constructor(prisma, config, notifications, queue) {
        this.prisma = prisma;
        this.config = config;
        this.notifications = notifications;
        this.queue = queue;
    }
    onModuleInit() {
        if (this.config.optional('NOTIFICATION_WORKER_ENABLED') === 'true') {
            if (!this.config.optional('NOTIFICATION_SQS_URL') || !this.config.optional('NOTIFICATION_SQS_DLQ_URL'))
                throw new Error('Notification worker requires SQS queue and DLQ URLs');
            this.schedule(0);
        }
    }
    schedule(delay) {
        if (this.stopped)
            return;
        this.timer = setTimeout(() => {
            this.running = this.tick().catch(() => this.logger.error(JSON.stringify({ event: 'notification_worker_retry' }))).then(() => this.schedule(2000));
        }, delay);
    }
    async onModuleDestroy() { this.stopped = true; if (this.timer)
        clearTimeout(this.timer); await this.running; }
    async dispatch() {
        await this.notifications.recoverExpired();
        const now = new Date();
        const rows = await this.prisma.registrationNotification.findMany({ where: { status: { in: ['PENDING', 'RETRY'] }, nextAttemptAt: { lte: now }, enqueueAfter: { lte: now } }, take: 20, orderBy: { enqueueAfter: 'asc' } });
        for (const row of rows) {
            // CAS lease prevents competing publishers. A send/DB-ack crash causes
            // re-publication; consumer claims and terminal states deduplicate it.
            const lease = new Date(Date.now() + 60_000);
            const claim = await this.prisma.registrationNotification.updateMany({ where: { id: row.id, status: { in: ['PENDING', 'RETRY'] }, enqueueAfter: row.enqueueAfter }, data: { enqueueAfter: lease, publishAttempts: { increment: 1 } } });
            if (!claim.count)
                continue;
            try {
                await this.queue.publish(row.id);
                // Periodic redrive also covers SQS retention expiry or transport DLQ.
                await this.prisma.registrationNotification.updateMany({ where: { id: row.id, enqueueAfter: lease }, data: { enqueueAfter: new Date(Date.now() + 300_000) } });
            }
            catch {
                await this.prisma.registrationNotification.updateMany({ where: { id: row.id, enqueueAfter: lease }, data: { enqueueAfter: new Date(Date.now() + (0, notifications_service_1.retryDelaySeconds)(row.publishAttempts + 1) * 1000), lastError: 'QUEUE_PUBLISH_RETRY' } });
                this.logger.warn(JSON.stringify({ event: 'notification_publish_retry', notificationId: row.id }));
            }
        }
        const failed = await this.prisma.registrationNotification.findMany({ where: { status: { in: ['FAILED', 'UNKNOWN'] }, deadLetteredAt: null, enqueueAfter: { lte: new Date() } }, take: 20 });
        for (const row of failed) {
            // Duplicate DLQ records are harmless IDs. Never mark exported before send.
            try {
                await this.queue.deadLetter(row.id);
                await this.prisma.registrationNotification.update({ where: { id: row.id }, data: { deadLetteredAt: new Date() } });
            }
            catch {
                await this.prisma.registrationNotification.update({ where: { id: row.id }, data: { enqueueAfter: new Date(Date.now() + (0, notifications_service_1.retryDelaySeconds)(row.publishAttempts + 1) * 1000), publishAttempts: { increment: 1 } } });
                this.logger.warn(JSON.stringify({ event: 'notification_dlq_export_retry', notificationId: row.id }));
            }
        }
    }
    async tick() {
        await this.dispatch();
        if (this.stopped)
            return;
        for (const message of await this.queue.receive()) {
            try {
                const body = JSON.parse(message.Body ?? '');
                if (!body || typeof body !== 'object' || !('notificationId' in body) || typeof body.notificationId !== 'string' || !/^[a-f0-9-]{36}$/i.test(body.notificationId)) {
                    // Leave malformed messages for SQS redrive policy and its DLQ.
                    this.logger.warn(JSON.stringify({ event: 'notification_invalid_queue_message' }));
                    continue;
                }
                await this.notifications.process(body.notificationId);
                if (message.ReceiptHandle)
                    await this.queue.acknowledge(message.ReceiptHandle);
            }
            catch {
                this.logger.error(JSON.stringify({ event: 'notification_queue_processing_retry' }));
            }
        }
    }
};
exports.NotificationWorker = NotificationWorker;
exports.NotificationWorker = NotificationWorker = NotificationWorker_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, config_service_1.ConfigService, notifications_service_1.NotificationsService, sqs_service_1.NotificationQueue])
], NotificationWorker);
//# sourceMappingURL=notification-worker.service.js.map