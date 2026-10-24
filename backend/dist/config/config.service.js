"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigModule = exports.ConfigService = void 0;
const common_1 = require("@nestjs/common");
let ConfigService = class ConfigService {
    get(key) {
        const defaults = {
            PORT: '3001', AWS_REGION: 'ap-southeast-2', S3_BUCKET: 'zenex-international-mrpob',
            FRONTEND_ORIGIN: 'http://localhost:3000', NODE_ENV: 'development',
        };
        const value = process.env[key] ?? defaults[key];
        if (!value)
            throw new Error(`Missing required environment variable: ${key}`);
        return value;
    }
    optional(key) { return process.env[key] || undefined; }
    validate() {
        for (const key of ['WHATSAPP_LIVE_ENABLED', 'WHATSAPP_TEMPLATES_APPROVED', 'WHATSAPP_REJECTIONS_ENABLED', 'NOTIFICATION_WORKER_ENABLED']) {
            if (this.optional(key) && !['true', 'false'].includes(this.optional(key)))
                throw new Error(`Invalid boolean configuration: ${key}`);
        }
        if (this.optional('WHATSAPP_PROVIDER') && !['mock', 'atoz'].includes(this.optional('WHATSAPP_PROVIDER')))
            throw new Error('Invalid WHATSAPP_PROVIDER');
        if (this.optional('NOTIFICATION_WORKER_ENABLED') === 'true') {
            this.get('NOTIFICATION_SQS_URL');
            this.get('NOTIFICATION_SQS_DLQ_URL');
        }
        this.get('DATABASE_URL');
        if (this.get('IDEMPOTENCY_SECRET').length < 32)
            throw new Error('IDEMPOTENCY_SECRET must contain at least 32 characters');
        this.get('COGNITO_USER_POOL_ID');
        this.get('COGNITO_CLIENT_ID');
        if (this.get('AWS_REGION') !== 'ap-southeast-2' || this.get('S3_BUCKET') !== 'zenex-international-mrpob') {
            throw new Error('Use the existing Sydney registration bucket');
        }
        if (this.optional('S3_ENDPOINT') && this.get('NODE_ENV') === 'production')
            throw new Error('Custom S3 endpoints are development-only');
        const origin = new URL(this.get('FRONTEND_ORIGIN'));
        if (this.get('NODE_ENV') === 'production' && origin.protocol !== 'https:')
            throw new Error('Production frontend origin must use HTTPS');
        const port = Number(this.get('PORT'));
        if (!Number.isInteger(port) || port < 1 || port > 65535)
            throw new Error('Invalid PORT');
    }
};
exports.ConfigService = ConfigService;
exports.ConfigService = ConfigService = __decorate([
    (0, common_1.Injectable)()
], ConfigService);
let ConfigModule = class ConfigModule {
};
exports.ConfigModule = ConfigModule;
exports.ConfigModule = ConfigModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({ providers: [ConfigService], exports: [ConfigService] })
], ConfigModule);
//# sourceMappingURL=config.service.js.map