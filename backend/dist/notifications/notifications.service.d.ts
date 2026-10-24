import { Prisma, RegistrationKind, RegistrationStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { ConfigService } from '../config/config.service';
import { WhatsAppProvider } from './whatsapp.provider';
export declare const retryDelaySeconds: (attempt: number) => number;
export declare const templateKey: (kind: RegistrationKind, event: RegistrationStatus) => string;
export declare const templateVariable: (key: string) => string;
export declare class NotificationsService {
    private readonly prisma;
    private readonly config;
    private readonly provider;
    private readonly logger;
    constructor(prisma: PrismaService, config: ConfigService, provider: WhatsAppProvider);
    static record(tx: Prisma.TransactionClient, registration: {
        id: string;
        kind: RegistrationKind;
        mobile: string;
    }, event: RegistrationStatus): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        kind: import(".prisma/client").$Enums.RegistrationKind;
        status: import(".prisma/client").$Enums.NotificationStatus;
        registrationId: string;
        event: import(".prisma/client").$Enums.RegistrationStatus;
        recipient: string;
        templateKey: string;
        templateId: string | null;
        payload: Prisma.JsonValue;
        attempts: number;
        publishAttempts: number;
        nextAttemptAt: Date;
        enqueueAfter: Date;
        leaseUntil: Date | null;
        claimToken: string | null;
        providerMessageId: string | null;
        lastError: string | null;
        deadLetteredAt: Date | null;
    }>;
    process(id: string): Promise<void>;
    recoverExpired(): Promise<void>;
    list(registrationId: string): Promise<{
        items: ({
            deliveries: {
                number: number;
                id: string;
                outcome: string;
                errorCode: string | null;
                startedAt: Date;
                finishedAt: Date | null;
                notificationId: string;
            }[];
        } & {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            kind: import(".prisma/client").$Enums.RegistrationKind;
            status: import(".prisma/client").$Enums.NotificationStatus;
            registrationId: string;
            event: import(".prisma/client").$Enums.RegistrationStatus;
            recipient: string;
            templateKey: string;
            templateId: string | null;
            payload: Prisma.JsonValue;
            attempts: number;
            publishAttempts: number;
            nextAttemptAt: Date;
            enqueueAfter: Date;
            leaseUntil: Date | null;
            claimToken: string | null;
            providerMessageId: string | null;
            lastError: string | null;
            deadLetteredAt: Date | null;
        })[];
    }>;
    detail(id: string): Promise<{
        notification: {
            deliveries: {
                number: number;
                id: string;
                outcome: string;
                errorCode: string | null;
                startedAt: Date;
                finishedAt: Date | null;
                notificationId: string;
            }[];
        } & {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            kind: import(".prisma/client").$Enums.RegistrationKind;
            status: import(".prisma/client").$Enums.NotificationStatus;
            registrationId: string;
            event: import(".prisma/client").$Enums.RegistrationStatus;
            recipient: string;
            templateKey: string;
            templateId: string | null;
            payload: Prisma.JsonValue;
            attempts: number;
            publishAttempts: number;
            nextAttemptAt: Date;
            enqueueAfter: Date;
            leaseUntil: Date | null;
            claimToken: string | null;
            providerMessageId: string | null;
            lastError: string | null;
            deadLetteredAt: Date | null;
        };
    }>;
}
