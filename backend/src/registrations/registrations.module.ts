import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/prisma.service';
import { DocumentsModule } from '../documents/documents.module';
import { AdminRegistrationsController, OwnedRegistrationsController, RegistrationsController } from './registrations.controller';
import { RegistrationsService } from './registrations.service';
import { AnalyticsService } from './analytics.service';

@Module({ imports: [DatabaseModule, DocumentsModule, AuthModule], controllers: [RegistrationsController, OwnedRegistrationsController, AdminRegistrationsController], providers: [RegistrationsService, AnalyticsService], exports: [RegistrationsService] })
export class RegistrationsModule {}
