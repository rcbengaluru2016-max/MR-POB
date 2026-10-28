import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DocumentsModule } from '../documents/documents.module';
import { RegistrationsModule } from '../registrations/registrations.module';
import { ImportsController } from './imports.controller';
import { ImportsService } from './imports.service';
import { ImportCapacityInterceptor } from './import-upload';

@Module({ imports: [AuthModule, DocumentsModule, RegistrationsModule], controllers: [ImportsController], providers: [ImportsService, ImportCapacityInterceptor] })
export class ImportsModule {}
