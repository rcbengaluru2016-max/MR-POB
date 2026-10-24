"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
require("dotenv/config");
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const config_service_1 = require("./config/config.service");
const prisma_service_1 = require("./database/prisma.service");
const notifications_module_1 = require("./notifications/notifications.module");
let NotificationWorkerModule = class NotificationWorkerModule {
};
NotificationWorkerModule = __decorate([
    (0, common_1.Module)({ imports: [config_service_1.ConfigModule, prisma_service_1.DatabaseModule, notifications_module_1.NotificationsModule] })
], NotificationWorkerModule);
async function bootstrap() {
    const config = new config_service_1.ConfigService();
    config.validate();
    if (config.optional('NOTIFICATION_WORKER_ENABLED') !== 'true')
        throw new Error('Dedicated worker must be explicitly enabled');
    const app = await core_1.NestFactory.createApplicationContext(NotificationWorkerModule, { logger: new common_1.ConsoleLogger({ json: true }) });
    app.enableShutdownHooks();
}
void bootstrap().catch(() => { process.stderr.write('Notification worker startup failed; check worker configuration and database connectivity.\n'); process.exitCode = 1; });
//# sourceMappingURL=notification-worker.js.map