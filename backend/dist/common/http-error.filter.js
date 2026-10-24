"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.HttpErrorFilter = void 0;
const common_1 = require("@nestjs/common");
let HttpErrorFilter = class HttpErrorFilter {
    logger = new common_1.Logger('HttpError');
    catch(error, host) {
        const context = host.switchToHttp();
        const response = context.getResponse();
        const request = context.getRequest();
        const status = error instanceof common_1.HttpException ? error.getStatus() : 500;
        const payload = error instanceof common_1.HttpException ? error.getResponse() : undefined;
        const message = typeof payload === 'string' ? payload : payload?.message;
        if (status >= 500) {
            const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : 'INTERNAL_ERROR';
            this.logger.error(JSON.stringify({ event: 'request_failed', requestId: response.getHeader('X-Request-ID'), status, code }));
            if (process.env.SENTRY_DSN)
                void Promise.resolve().then(() => __importStar(require('@sentry/node'))).then(sentry => sentry.captureException(new Error(`Backend request failed (${code})`))).catch(() => undefined);
        }
        response.status(status).json({ statusCode: status, error: status >= 500 ? 'Service temporarily unavailable' : Array.isArray(message) ? message[0] : message ?? 'Request failed',
            ...(Array.isArray(message) ? { messages: message } : {}), requestId: response.getHeader('X-Request-ID') });
    }
};
exports.HttpErrorFilter = HttpErrorFilter;
exports.HttpErrorFilter = HttpErrorFilter = __decorate([
    (0, common_1.Catch)()
], HttpErrorFilter);
//# sourceMappingURL=http-error.filter.js.map