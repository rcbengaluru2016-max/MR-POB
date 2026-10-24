import { NotificationsService } from './notifications.service';
export declare class NotificationsController {
    private readonly notifications;
    constructor(notifications: NotificationsService);
    list(id: string): Promise<{
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
            payload: import("@prisma/client/runtime/library").JsonValue;
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
            payload: import("@prisma/client/runtime/library").JsonValue;
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
export declare class NotificationsModule {
}
