import { Controller, Get, Module, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthModule } from '../auth/auth.module';
import { AdminGuard, CognitoGuard } from '../auth/auth.guard';
import { NotificationsService } from './notifications.service';
import { AtoZWhatsAppProvider, MockWhatsAppProvider, WhatsAppGateway, WhatsAppProvider } from './whatsapp.provider';
import { NotificationQueue } from './sqs.service';
import { NotificationWorker } from './notification-worker.service';

@ApiTags('Admin notifications') @ApiBearerAuth()
@UseGuards(CognitoGuard, AdminGuard)
@Controller('admin/notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}
  @Get('registration/:registrationId')
  list(@Param('registrationId') id: string) { return this.notifications.list(id); }
  @Get(':id')
  detail(@Param('id', ParseUUIDPipe) id: string) { return this.notifications.detail(id); }
}

@Module({ imports: [AuthModule], controllers: [NotificationsController], providers: [NotificationsService, MockWhatsAppProvider, AtoZWhatsAppProvider, WhatsAppGateway, { provide: WhatsAppProvider, useExisting: WhatsAppGateway }, NotificationQueue, NotificationWorker], exports: [NotificationsService] })
export class NotificationsModule {}
