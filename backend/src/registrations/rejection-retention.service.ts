import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
@Injectable()
export class RejectionRetentionService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private running?: Promise<unknown>;
  private stopped = false;
  private readonly logger = new Logger(RejectionRetentionService.name);
  constructor(private readonly prisma: PrismaService) {}
  onModuleInit() { this.schedule(0); }
  private schedule(delay: number) {
    if (this.stopped) return;
    this.timer = setTimeout(() => {
      this.running = this.cleanup().catch((error: unknown) => this.logger.error(JSON.stringify({ event: 'rejection_retention_retry', code: error instanceof Prisma.PrismaClientKnownRequestError ? error.code : 'CLEANUP_FAILED' }))).finally(() => this.schedule(60_000));
    }, delay);
    this.timer.unref();
  }
  async onModuleDestroy() { this.stopped = true; if (this.timer) clearTimeout(this.timer); await this.running; }
  async cleanup(now = new Date()) {
    return this.prisma.$transaction(async tx => {
      // Shared row lock order across decisions and cleanup; SKIP LOCKED lets
      // multiple API/worker replicas cooperate without deleting active work.
      // Prisma timestamps are UTC without a zone; bind Date as UTC explicitly
      // so a non-UTC PostgreSQL session cannot expire records early.
      const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Registration" WHERE "status" = 'REJECTED' AND "rejectionExpiresAt" <= (${now}::timestamptz AT TIME ZONE 'UTC') ORDER BY "rejectionExpiresAt" LIMIT 100 FOR UPDATE SKIP LOCKED`;
      for (const { id } of rows) {
        // Keep immutable decision/audit metadata and delivery outcome for audit;
        // remove all rejection text and copies of recipient/template variables.
        await tx.registrationNotification.updateMany({ where: { registrationId: id, event: 'REJECTED' }, data: { payload: {}, recipient: '', templateId: null, providerMessageId: null, status: 'EXPIRED', claimToken: null, leaseUntil: null } });
        await tx.auditEvent.updateMany({ where: { registrationId: id, action: 'REGISTRATION_REJECTED' }, data: { detail: { status: 'REJECTED', rejectionDetailsExpired: true } } });
        await tx.registration.update({ where: { id }, data: { rejectionReason: null, rejectionReasonCode: null, rejectionExpiresAt: null } });
      }
      return rows.length;
    }, { maxWait: 5000, timeout: 30000 });
  }
}
