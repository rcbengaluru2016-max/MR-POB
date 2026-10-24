"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WhatsAppGateway = exports.AtoZWhatsAppProvider = exports.MockWhatsAppProvider = exports.ProviderFailure = exports.WhatsAppProvider = void 0;
const common_1 = require("@nestjs/common");
const config_service_1 = require("../config/config.service");
class WhatsAppProvider {
}
exports.WhatsAppProvider = WhatsAppProvider;
// Only use retry for a documented, definite non-acceptance (e.g. a rate limit).
// A network timeout, connection reset or unclassified error is always uncertain.
class ProviderFailure extends Error {
    disposition;
    code;
    retryAfterSeconds;
    constructor(disposition, code, retryAfterSeconds = 0) {
        super(code);
        this.disposition = disposition;
        this.code = code;
        this.retryAfterSeconds = retryAfterSeconds;
    }
}
exports.ProviderFailure = ProviderFailure;
let MockWhatsAppProvider = class MockWhatsAppProvider extends WhatsAppProvider {
    async send(message) {
        // The durable database ledger records the recipient/template/payload. Do not
        // log PII or retain an unbounded in-memory list in a long-running worker.
        return { status: 'MOCKED', messageId: `mock:${message.idempotencyKey}` };
    }
};
exports.MockWhatsAppProvider = MockWhatsAppProvider;
exports.MockWhatsAppProvider = MockWhatsAppProvider = __decorate([
    (0, common_1.Injectable)()
], MockWhatsAppProvider);
let AtoZWhatsAppProvider = class AtoZWhatsAppProvider extends WhatsAppProvider {
    async send() {
        // Intentionally no HTTP transport: the vendor's API/authentication contract,
        // approved templates and idempotency guarantees have not been supplied.
        throw new ProviderFailure('blocked', 'ATOZ_DOCUMENTATION_REQUIRED');
    }
};
exports.AtoZWhatsAppProvider = AtoZWhatsAppProvider;
exports.AtoZWhatsAppProvider = AtoZWhatsAppProvider = __decorate([
    (0, common_1.Injectable)()
], AtoZWhatsAppProvider);
let WhatsAppGateway = class WhatsAppGateway extends WhatsAppProvider {
    config;
    mock;
    atoz;
    constructor(config, mock, atoz) {
        super();
        this.config = config;
        this.mock = mock;
        this.atoz = atoz;
    }
    async send(message, signal) {
        const provider = this.config.optional('WHATSAPP_PROVIDER') ?? 'mock';
        if (provider === 'mock' && this.config.optional('WHATSAPP_LIVE_ENABLED') !== 'true')
            return this.mock.send(message);
        if (provider !== 'atoz' || this.config.optional('WHATSAPP_LIVE_ENABLED') !== 'true')
            throw new ProviderFailure('blocked', 'LIVE_MESSAGING_DISABLED');
        // Even complete environment variables cannot enable an undocumented adapter.
        return this.atoz.send();
    }
};
exports.WhatsAppGateway = WhatsAppGateway;
exports.WhatsAppGateway = WhatsAppGateway = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_service_1.ConfigService, MockWhatsAppProvider, AtoZWhatsAppProvider])
], WhatsAppGateway);
//# sourceMappingURL=whatsapp.provider.js.map