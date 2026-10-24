import { Prisma } from '@prisma/client';
import { ConfigService } from '../config/config.service';
export type WhatsAppMessage = {
    idempotencyKey: string;
    recipient: string;
    template: string;
    payload: Prisma.JsonValue;
};
export type SendResult = {
    status: 'MOCKED' | 'ACCEPTED';
    messageId: string;
};
export declare abstract class WhatsAppProvider {
    abstract send(message: WhatsAppMessage, signal: AbortSignal): Promise<SendResult>;
}
export declare class ProviderFailure extends Error {
    readonly disposition: 'retry' | 'failed' | 'unknown' | 'blocked';
    readonly code: string;
    readonly retryAfterSeconds: number;
    constructor(disposition: 'retry' | 'failed' | 'unknown' | 'blocked', code: string, retryAfterSeconds?: number);
}
export declare class MockWhatsAppProvider extends WhatsAppProvider {
    send(message: WhatsAppMessage): Promise<SendResult>;
}
export declare class AtoZWhatsAppProvider extends WhatsAppProvider {
    send(): Promise<SendResult>;
}
export declare class WhatsAppGateway extends WhatsAppProvider {
    private readonly config;
    private readonly mock;
    private readonly atoz;
    constructor(config: ConfigService, mock: MockWhatsAppProvider, atoz: AtoZWhatsAppProvider);
    send(message: WhatsAppMessage, signal: AbortSignal): Promise<SendResult>;
}
