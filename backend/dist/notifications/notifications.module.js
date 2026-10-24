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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationsModule = exports.NotificationsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const auth_module_1 = require("../auth/auth.module");
const auth_guard_1 = require("../auth/auth.guard");
const notifications_service_1 = require("./notifications.service");
const whatsapp_provider_1 = require("./whatsapp.provider");
const sqs_service_1 = require("./sqs.service");
const notification_worker_service_1 = require("./notification-worker.service");
let NotificationsController = class NotificationsController {
    notifications;
    constructor(notifications) {
        this.notifications = notifications;
    }
    list(id) { return this.notifications.list(id); }
    detail(id) { return this.notifications.detail(id); }
};
exports.NotificationsController = NotificationsController;
__decorate([
    (0, common_1.Get)('registration/:registrationId'),
    __param(0, (0, common_1.Param)('registrationId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], NotificationsController.prototype, "list", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], NotificationsController.prototype, "detail", null);
exports.NotificationsController = NotificationsController = __decorate([
    (0, swagger_1.ApiTags)('Admin notifications'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(auth_guard_1.CognitoGuard, auth_guard_1.AdminGuard),
    (0, common_1.Controller)('admin/notifications'),
    __metadata("design:paramtypes", [notifications_service_1.NotificationsService])
], NotificationsController);
let NotificationsModule = class NotificationsModule {
};
exports.NotificationsModule = NotificationsModule;
exports.NotificationsModule = NotificationsModule = __decorate([
    (0, common_1.Module)({ imports: [auth_module_1.AuthModule], controllers: [NotificationsController], providers: [notifications_service_1.NotificationsService, whatsapp_provider_1.MockWhatsAppProvider, whatsapp_provider_1.AtoZWhatsAppProvider, whatsapp_provider_1.WhatsAppGateway, { provide: whatsapp_provider_1.WhatsAppProvider, useExisting: whatsapp_provider_1.WhatsAppGateway }, sqs_service_1.NotificationQueue, notification_worker_service_1.NotificationWorker], exports: [notifications_service_1.NotificationsService] })
], NotificationsModule);
//# sourceMappingURL=notifications.module.js.map