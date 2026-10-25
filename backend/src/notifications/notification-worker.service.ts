import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { ConfigService } from '../config/config.service';
import { NotificationsService, retryDelaySeconds } from './notifications.service';
import { NotificationQueue } from './sqs.service';

@Injectable()
export class NotificationWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationWorker.name);
  private timer?: NodeJS.Timeout;
  private running?: Promise<void>;
  private stopped = false;
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService, private readonly notifications: NotificationsService, private readonly queue: NotificationQueue) {}
  onModuleInit() {
    if (this.config.optional('NOTIFICATION_WORKER_ENABLED') === 'true') {
      if (!this.config.optional('NOTIFICATION_SQS_URL') || !this.config.optional('NOTIFICATION_SQS_DLQ_URL')) throw new Error('Notification worker requires SQS queue and DLQ URLs');
      this.schedule(0);
    }
  }
  private schedule(delay: number) {
    if (this.stopped) return;
    this.timer = setTimeout(() => {
      this.running = this.tick().catch(() => this.logger.error(JSON.stringify({ event: 'notification_worker_retry' }))).then(() => this.schedule(2000));
    }, delay);
  }
  async onModuleDestroy() { this.stopped = true; if (this.timer) clearTimeout(this.timer); await this.running; }

  async dispatch() {
    await this.notifications.recoverExpired();
    const now = new Date();
    const rows = await this.prisma.registrationNotification.findMany({ where: { status: { in: ['PENDING', 'RETRY'] }, nextAttemptAt: { lte: now }, enqueueAfter: { lte: now } }, take: 20, orderBy: { enqueueAfter: 'asc' } });
    for (const row of rows) {
      // CAS lease prevents competing publishers. A send/DB-ack crash causes
      // re-publication; consumer claims and terminal states deduplicate it.
      const lease = new Date(Date.now() + 60_000);
      const claim = await this.prisma.registrationNotification.updateMany({ where: { id: row.id, status: { in: ['PENDING', 'RETRY'] }, enqueueAfter: row.enqueueAfter }, data: { enqueueAfter: lease, publishAttempts: { increment: 1 } } });
      if (!claim.count) continue;
      try {
        await this.queue.publish(row.id);
        // Periodic redrive also covers SQS retention expiry or transport DLQ.
        await this.prisma.registrationNotification.updateMany({ where: { id: row.id, enqueueAfter: lease }, data: { enqueueAfter: new Date(Date.now() + 300_000) } });
      } catch {
        await this.prisma.registrationNotification.updateMany({ where: { id: row.id, enqueueAfter: lease }, data: { enqueueAfter: new Date(Date.now() + retryDelaySeconds(row.publishAttempts + 1) * 1000), lastError: 'QUEUE_PUBLISH_RETRY' } });
        this.logger.warn(JSON.stringify({ event: 'notification_publish_retry', notificationId: row.id }));
      }
    }
    const failed = await this.prisma.registrationNotification.findMany({ where: { status: { in: ['FAILED', 'UNKNOWN'] }, deadLetteredAt: null, enqueueAfter: { lte: new Date() } }, take: 20 });
    for (const row of failed) {
      // Duplicate DLQ records are harmless IDs. Never mark exported before send.
      try {
        await this.queue.deadLetter(row.id);
        await this.prisma.registrationNotification.update({ where: { id: row.id }, data: { deadLetteredAt: new Date() } });
      } catch {
        await this.prisma.registrationNotification.update({ where: { id: row.id }, data: { enqueueAfter: new Date(Date.now() + retryDelaySeconds(row.publishAttempts + 1) * 1000), publishAttempts: { increment: 1 } } });
        this.logger.warn(JSON.stringify({ event: 'notification_dlq_export_retry', notificationId: row.id }));
      }
    }
  }
  async tick() {
    await this.dispatch();
    if (this.stopped) return;
    for (const message of await this.queue.receive()) {
      try {
        const body: unknown = JSON.parse(message.Body ?? '');
        if (!body || typeof body !== 'object' || !('notificationId' in body) || typeof body.notificationId !== 'string' || !/^[a-f0-9-]{36}$/i.test(body.notificationId)) {
          // Leave malformed messages for SQS redrive policy and its DLQ.
          this.logger.warn(JSON.stringify({ event: 'notification_invalid_queue_message' }));
          continue;
        }
        await this.notifications.process(body.notificationId);
        if (message.ReceiptHandle) await this.queue.acknowledge(message.ReceiptHandle);
      } catch { this.logger.error(JSON.stringify({ event: 'notification_queue_processing_retry' })); }
    }
  }
}
