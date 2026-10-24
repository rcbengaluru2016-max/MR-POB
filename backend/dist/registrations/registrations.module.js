"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RegistrationsModule = void 0;
const common_1 = require("@nestjs/common");
const auth_module_1 = require("../auth/auth.module");
const prisma_service_1 = require("../database/prisma.service");
const documents_module_1 = require("../documents/documents.module");
const registrations_controller_1 = require("./registrations.controller");
const registrations_service_1 = require("./registrations.service");
const analytics_service_1 = require("./analytics.service");
let RegistrationsModule = class RegistrationsModule {
};
exports.RegistrationsModule = RegistrationsModule;
exports.RegistrationsModule = RegistrationsModule = __decorate([
    (0, common_1.Module)({ imports: [prisma_service_1.DatabaseModule, documents_module_1.DocumentsModule, auth_module_1.AuthModule], controllers: [registrations_controller_1.RegistrationsController, registrations_controller_1.OwnedRegistrationsController, registrations_controller_1.AdminRegistrationsController], providers: [registrations_service_1.RegistrationsService, analytics_service_1.AnalyticsService], exports: [registrations_service_1.RegistrationsService] })
], RegistrationsModule);
//# sourceMappingURL=registrations.module.js.map