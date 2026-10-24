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
require("reflect-metadata");
require("dotenv/config");
const core_1 = require("@nestjs/core");
const common_1 = require("@nestjs/common");
const app_module_1 = require("./app.module");
const config_service_1 = require("./config/config.service");
const bootstrap_1 = require("./bootstrap");
async function bootstrap() {
    const config = new config_service_1.ConfigService();
    config.validate();
    if (config.optional('SENTRY_DSN')) {
        const sentry = await Promise.resolve().then(() => __importStar(require('@sentry/node')));
        sentry.init({ dsn: config.optional('SENTRY_DSN'), environment: config.get('NODE_ENV'), sendDefaultPii: false, beforeSend(event) { delete event.request; delete event.user; delete event.breadcrumbs; return event; } });
    }
    const app = await core_1.NestFactory.create(app_module_1.AppModule, { logger: new common_1.ConsoleLogger({ json: true }), bodyParser: true });
    (0, bootstrap_1.configureApp)(app, config.optional('ENABLE_SWAGGER') === 'true');
    app.enableShutdownHooks();
    await app.listen(Number(config.get('PORT')), '0.0.0.0');
}
void bootstrap().catch(() => { process.stderr.write('Backend startup failed; check required configuration and database connectivity.\n'); process.exitCode = 1; });
//# sourceMappingURL=main.js.map