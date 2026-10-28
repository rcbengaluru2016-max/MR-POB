import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ConfigModule } from './config/config.service';
import { DatabaseModule } from './database/prisma.service';
import { AuthModule } from './auth/auth.module';
import { DocumentsModule } from './documents/documents.module';
import { RegistrationsModule } from './registrations/registrations.module';
import { HealthModule } from './health/health.module';
import { AccountsModule } from './accounts/accounts.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ImportsModule } from './imports/imports.module';

@Module({
  imports: [ConfigModule, DatabaseModule, ThrottlerModule.forRoot([{ name: 'default', ttl: 60000, limit: 120 }]), AuthModule, AccountsModule, DocumentsModule, RegistrationsModule, NotificationsModule, HealthModule, ImportsModule],
  providers: [ThrottlerGuard, { provide: APP_GUARD, useExisting: ThrottlerGuard }],
})
export class AppModule {}
