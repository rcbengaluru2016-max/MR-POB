import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { NotificationStatus, Prisma, RegistrationKind, RegistrationStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import { ConfigService } from '../config/config.service';
import { ProviderFailure, WhatsAppProvider } from './whatsapp.provider';

export const retryDelaySeconds = (attempt: number) => Math.min(3600, 30 * 2 ** Math.min(attempt - 1, 7));
export const templateKey = (kind: RegistrationKind, event: RegistrationStatus) => `registration.${kind}.${event.toLowerCase()}`;
export const templateVariable = (key: string) => `WHATSAPP_TEMPLATE_${key.replaceAll('.', '_').toUpperCase()}`;
const runnable: NotificationStatus[] = ['PENDING', 'RETRY'];

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService, private readonly provider: WhatsAppProvider) {}

  static async record(tx: Prisma.TransactionClient, registration: { id: string; kind: RegistrationKind; mobile: string }, event: RegistrationStatus) {
    const key = templateKey(registration.kind, event);
    return tx.registrationNotification.create({ data: {
      registrationId: registration.id, kind: registration.kind, event,
      // Existing forms collect Indian ten-digit mobile numbers, not a second
      // independently supplied WhatsApp destination. Never trust a job recipient.
      recipient: `+91${registration.mobile}`, templateKey: key,
      payload: { registrationId: registration.id, registrationType: registration.kind, decision: event },
    } });
  }

  async process(id: string) {
    const now = new Date();
    const token = randomUUID();
    const claimed = await this.prisma.registrationNotification.updateMany({ where: { id, status: { in: runnable }, nextAttemptAt: { lte: now } },
      data: { status: 'PROCESSING', claimToken: token, leaseUntil: new Date(now.getTime() + 60_000) } });
    if (!claimed.count) return;
    let row = await this.prisma.registrationNotification.findUniqueOrThrow({ where: { id } });
    // Persist the attempt and template before any external side effect.
    const mock = (this.config.optional('WHATSAPP_PROVIDER') ?? 'mock') === 'mock' && this.config.optional('WHATSAPP_LIVE_ENABLED') !== 'true';
    const template = mock ? `mock:${row.templateKey}` : this.config.optional(templateVariable(row.templateKey));
    const attempt = row.attempts + 1;
    row = await this.prisma.$transaction(async tx => {
      await tx.notificationAttempt.create({ data: { notificationId: id, number: attempt, outcome: 'STARTED' } });
      return tx.registrationNotification.update({ where: { id }, data: { attempts: attempt, templateId: template ?? null } });
    });
    let status: NotificationStatus;
    let errorCode: string | undefined;
    let messageId: string | undefined;
    let retrySeconds = retryDelaySeconds(attempt);
    const abort = new AbortController();
    let timeout: NodeJS.Timeout | undefined;
    try {
      if (row.event === 'REJECTED' && this.config.optional('WHATSAPP_REJECTIONS_ENABLED') !== 'true') throw new ProviderFailure('blocked', 'REJECTION_NOTIFICATIONS_DISABLED');
      if (!template || (!mock && this.config.optional('WHATSAPP_TEMPLATES_APPROVED') !== 'true')) throw new ProviderFailure('blocked', 'APPROVED_TEMPLATE_REQUIRED');
      if (!/^\+91[6-9]\d{9}$/.test(row.recipient)) throw new ProviderFailure('failed', 'INVALID_REGISTERED_MOBILE');
      const result = await Promise.race([
        this.provider.send({ idempotencyKey: row.id, recipient: row.recipient, template, payload: row.payload }, abort.signal),
        new Promise<never>((_resolve, reject) => { timeout = setTimeout(() => { abort.abort(); reject(new ProviderFailure('unknown', 'PROVIDER_TIMEOUT')); }, 15_000); }),
      ]);
      status = result.status;
      messageId = result.messageId;
    } catch (error) {
      const failure = error instanceof ProviderFailure ? error : new ProviderFailure('unknown', 'PROVIDER_RESPONSE_UNCERTAIN');
      errorCode = /^[A-Z0-9_]{1,100}$/.test(failure.code) ? failure.code : 'PROVIDER_ERROR';
      status = failure.disposition === 'retry' ? (attempt >= 5 ? 'FAILED' : 'RETRY') : failure.disposition === 'blocked' ? 'BLOCKED' : failure.disposition === 'failed' ? 'FAILED' : 'UNKNOWN';
      retrySeconds = Math.max(retrySeconds, Math.min(86400, Math.max(0, failure.retryAfterSeconds)));
    } finally { if (timeout) clearTimeout(timeout); }
    await this.prisma.$transaction(async tx => {
      const done = await tx.registrationNotification.updateMany({ where: { id, status: 'PROCESSING', claimToken: token }, data: {
        status, lastError: errorCode ?? null, providerMessageId: messageId, claimToken: null, leaseUntil: null,
        nextAttemptAt: new Date(Date.now() + retrySeconds * 1000), enqueueAfter: new Date(Date.now() + (status === 'RETRY' ? retrySeconds * 1000 : 0)),
      } });
      if (done.count) await tx.notificationAttempt.update({ where: { notificationId_number: { notificationId: id, number: attempt } }, data: { outcome: status, errorCode, finishedAt: new Date() } });
    });
    this.logger.log(JSON.stringify({ event: 'registration_notification_processed', notificationId: id, status, attempt, errorCode }));
  }

  async recoverExpired() {
    // A process may die after the provider accepts a message but before commit.
    // Without documented provider idempotency, never automatically resend it.
    await this.prisma.$transaction(async tx => {
      const expired = await tx.registrationNotification.findMany({ where: { status: 'PROCESSING', leaseUntil: { lt: new Date() } }, take: 100 });
      for (const row of expired) {
        const result = await tx.registrationNotification.updateMany({ where: { id: row.id, status: 'PROCESSING', claimToken: row.claimToken, leaseUntil: { lt: new Date() } }, data: { status: 'UNKNOWN', lastError: 'WORKER_LEASE_EXPIRED', claimToken: null, leaseUntil: null } });
        if (result.count) await tx.notificationAttempt.updateMany({ where: { notificationId: row.id, outcome: 'STARTED' }, data: { outcome: 'UNKNOWN', errorCode: 'WORKER_LEASE_EXPIRED', finishedAt: new Date() } });
      }
    });
  }

  async list(registrationId: string) {
    return { items: await this.prisma.registrationNotification.findMany({ where: { registrationId }, orderBy: { createdAt: 'desc' }, include: { deliveries: { orderBy: { number: 'asc' } } } }) };
  }
  async detail(id: string) {
    const notification = await this.prisma.registrationNotification.findUnique({ where: { id }, include: { deliveries: { orderBy: { number: 'asc' } } } });
    if (!notification) throw new NotFoundException('Notification not found');
    return { notification };
  }
}
