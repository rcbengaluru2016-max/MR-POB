import 'reflect-metadata';
import 'dotenv/config';
import { ConsoleLogger, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigModule, ConfigService } from './config/config.service';
import { DatabaseModule } from './database/prisma.service';
import { RejectionRetentionService } from './registrations/rejection-retention.service';
import { NotificationsModule } from './notifications/notifications.module';

@Module({ imports: [ConfigModule, DatabaseModule, NotificationsModule], providers: [RejectionRetentionService] })
class NotificationWorkerModule {}

async function bootstrap() {
  const config = new ConfigService(); config.validate();
  if (config.optional('NOTIFICATION_WORKER_ENABLED') !== 'true') throw new Error('Dedicated worker must be explicitly enabled');
  const app = await NestFactory.createApplicationContext(NotificationWorkerModule, { logger: new ConsoleLogger({ json: true }) });
  app.enableShutdownHooks();
}
void bootstrap().catch(() => { process.stderr.write('Notification worker startup failed; check worker configuration and database connectivity.\n'); process.exitCode = 1; });
