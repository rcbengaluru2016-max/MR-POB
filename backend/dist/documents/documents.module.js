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
exports.DocumentsModule = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const auth_module_1 = require("../auth/auth.module");
const auth_guard_1 = require("../auth/auth.guard");
const prisma_service_1 = require("../database/prisma.service");
const config_service_1 = require("../config/config.service");
const documents_service_1 = require("./documents.service");
const s3_storage_service_1 = require("./s3-storage.service");
let DocumentsController = class DocumentsController {
    documents;
    constructor(documents) {
        this.documents = documents;
    }
    download(id, request) { return this.documents.download(id, request.user); }
};
__decorate([
    (0, common_1.Get)(':id'),
    (0, common_1.Header)('Cache-Control', 'private, no-store'),
    (0, swagger_1.ApiOperation)({ summary: 'Authorize document access and return a 60-second attachment download URL' }),
    (0, swagger_1.ApiResponse)({ status: 200, schema: { type: 'object', properties: { url: { type: 'string' }, expiresIn: { type: 'integer', example: 60 } } } }),
    (0, swagger_1.ApiResponse)({ status: 401, description: 'Missing/invalid Cognito access token' }),
    (0, swagger_1.ApiResponse)({ status: 403, description: 'Active admin or approved registration owner required' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], DocumentsController.prototype, "download", null);
DocumentsController = __decorate([
    (0, swagger_1.ApiTags)('Documents'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(auth_guard_1.CognitoGuard),
    (0, common_1.Controller)('documents'),
    __metadata("design:paramtypes", [documents_service_1.DocumentsService])
], DocumentsController);
let DocumentsModule = class DocumentsModule {
};
exports.DocumentsModule = DocumentsModule;
exports.DocumentsModule = DocumentsModule = __decorate([
    (0, common_1.Module)({ imports: [auth_module_1.AuthModule, prisma_service_1.DatabaseModule, config_service_1.ConfigModule], controllers: [DocumentsController], providers: [documents_service_1.DocumentsService, s3_storage_service_1.S3StorageService], exports: [documents_service_1.DocumentsService, s3_storage_service_1.S3StorageService] })
], DocumentsModule);
//# sourceMappingURL=documents.module.js.map