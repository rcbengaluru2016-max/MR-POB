import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ConfigService } from '../config/config.service';

export type WhatsAppMessage = { idempotencyKey: string; recipient: string; template: string; payload: Prisma.JsonValue };
export type SendResult = { status: 'MOCKED' | 'ACCEPTED'; messageId: string };
export abstract class WhatsAppProvider {
  abstract send(message: WhatsAppMessage, signal: AbortSignal): Promise<SendResult>;
}

// Only use retry for a documented, definite non-acceptance (e.g. a rate limit).
// A network timeout, connection reset or unclassified error is always uncertain.
export class ProviderFailure extends Error {
  constructor(readonly disposition: 'retry' | 'failed' | 'unknown' | 'blocked', readonly code: string, readonly retryAfterSeconds = 0) { super(code); }
}

@Injectable()
export class MockWhatsAppProvider extends WhatsAppProvider {
  async send(message: WhatsAppMessage): Promise<SendResult> {
    // The durable database ledger records the recipient/template/payload. Do not
    // log PII or retain an unbounded in-memory list in a long-running worker.
    return { status: 'MOCKED', messageId: `mock:${message.idempotencyKey}` };
  }
}

@Injectable()
export class AtoZWhatsAppProvider extends WhatsAppProvider {
  async send(): Promise<SendResult> {
    // Intentionally no HTTP transport: the vendor's API/authentication contract,
    // approved templates and idempotency guarantees have not been supplied.
    throw new ProviderFailure('blocked', 'ATOZ_DOCUMENTATION_REQUIRED');
  }
}

@Injectable()
export class WhatsAppGateway extends WhatsAppProvider {
  constructor(private readonly config: ConfigService, private readonly mock: MockWhatsAppProvider, private readonly atoz: AtoZWhatsAppProvider) { super(); }
  async send(message: WhatsAppMessage, signal: AbortSignal) {
    const provider = this.config.optional('WHATSAPP_PROVIDER') ?? 'mock';
    if (provider === 'mock' && this.config.optional('WHATSAPP_LIVE_ENABLED') !== 'true') return this.mock.send(message);
    if (provider !== 'atoz' || this.config.optional('WHATSAPP_LIVE_ENABLED') !== 'true') throw new ProviderFailure('blocked', 'LIVE_MESSAGING_DISABLED');
    // Even complete environment variables cannot enable an undocumented adapter.
    return this.atoz.send();
  }
}
