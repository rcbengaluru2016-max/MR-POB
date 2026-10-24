import { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { ConfigService } from '../config/config.service';
import { NotificationsService } from './notifications.service';
import { NotificationQueue } from './sqs.service';
export declare class NotificationWorker implements OnModuleInit, OnModuleDestroy {
    private readonly prisma;
    private readonly config;
    private readonly notifications;
    private readonly queue;
    private readonly logger;
    private timer?;
    private running?;
    private stopped;
    constructor(prisma: PrismaService, config: ConfigService, notifications: NotificationsService, queue: NotificationQueue);
    onModuleInit(): void;
    private schedule;
    onModuleDestroy(): Promise<void>;
    dispatch(): Promise<void>;
    tick(): Promise<void>;
}
