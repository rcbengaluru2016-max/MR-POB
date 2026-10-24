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
exports.AccountsModule = exports.AccountsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const auth_module_1 = require("../auth/auth.module");
const auth_guard_1 = require("../auth/auth.guard");
const prisma_service_1 = require("../database/prisma.service");
const accounts_service_1 = require("./accounts.service");
const accounts_dto_1 = require("./accounts.dto");
const cognito_accounts_service_1 = require("./cognito-accounts.service");
const config_service_1 = require("../config/config.service");
const accountEnvelope = { type: 'object', properties: { account: { $ref: (0, swagger_1.getSchemaPath)(accounts_dto_1.AdminAccountDto) } } };
let AccountsController = class AccountsController {
    accounts;
    constructor(accounts) {
        this.accounts = accounts;
    }
    create(input, request) { return this.accounts.create(input, request.user.id); }
    list(query) { return this.accounts.list(query); }
    detail(id) { return this.accounts.detail(id); }
    password(id, input, request) { return this.accounts.setPassword(id, input.password, request.user.id); }
    state(id, input, request) { return this.accounts.setState(id, input.state, request.user.id); }
};
exports.AccountsController = AccountsController;
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({ summary: 'Create an ADMIN account and its Cognito login credentials' }),
    (0, swagger_1.ApiCreatedResponse)({ schema: accountEnvelope }),
    (0, swagger_1.ApiConflictResponse)({ description: 'Email or username already exists.' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [accounts_dto_1.CreateAdminDto, Object]),
    __metadata("design:returntype", void 0)
], AccountsController.prototype, "create", null);
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'List Admin accounts (Super Admin only)' }),
    (0, swagger_1.ApiOkResponse)({ schema: { type: 'object', properties: { items: { type: 'array', items: { $ref: (0, swagger_1.getSchemaPath)(accounts_dto_1.AdminAccountDto) } }, total: { type: 'integer' }, page: { type: 'integer' }, pageSize: { type: 'integer' } } } }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [accounts_dto_1.AccountQueryDto]),
    __metadata("design:returntype", void 0)
], AccountsController.prototype, "list", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'Retrieve an Admin account by UUID' }),
    (0, swagger_1.ApiOkResponse)({ schema: accountEnvelope }),
    (0, swagger_1.ApiNotFoundResponse)({ description: 'Admin account not found.' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], AccountsController.prototype, "detail", null);
__decorate([
    (0, common_1.Post)(':id/password'),
    (0, swagger_1.ApiOperation)({ summary: 'Set an Admin password, or finish/retry identity setup for an existing account' }),
    (0, swagger_1.ApiOkResponse)({ schema: accountEnvelope }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, accounts_dto_1.AccountPasswordDto, Object]),
    __metadata("design:returntype", void 0)
], AccountsController.prototype, "password", null);
__decorate([
    (0, common_1.Patch)(':id/state'),
    (0, swagger_1.ApiOperation)({ summary: 'Enable or disable both ERP access and the linked Cognito identity' }),
    (0, swagger_1.ApiOkResponse)({ schema: accountEnvelope }),
    (0, swagger_1.ApiNotFoundResponse)({ description: 'Admin account not found.' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, accounts_dto_1.AccountStateDto, Object]),
    __metadata("design:returntype", void 0)
], AccountsController.prototype, "state", null);
exports.AccountsController = AccountsController = __decorate([
    (0, swagger_1.ApiTags)('Super Admin accounts'),
    (0, swagger_1.ApiExtraModels)(accounts_dto_1.AdminAccountDto),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiUnauthorizedResponse)({ description: 'Verified Cognito access token required.' }),
    (0, swagger_1.ApiForbiddenResponse)({ description: 'Only active SUPER_ADMIN accounts may manage Admin accounts.' }),
    (0, swagger_1.ApiBadRequestResponse)({ description: 'Invalid fields, weak password or unsupported role.' }),
    (0, common_1.UseGuards)(auth_guard_1.CognitoGuard, auth_guard_1.SuperAdminGuard),
    (0, common_1.Controller)('super-admin/accounts'),
    __metadata("design:paramtypes", [accounts_service_1.AccountsService])
], AccountsController);
let AccountsModule = class AccountsModule {
};
exports.AccountsModule = AccountsModule;
exports.AccountsModule = AccountsModule = __decorate([
    (0, common_1.Module)({ imports: [prisma_service_1.DatabaseModule, auth_module_1.AuthModule, config_service_1.ConfigModule], controllers: [AccountsController], providers: [accounts_service_1.AccountsService, cognito_accounts_service_1.CognitoAccountsService] })
], AccountsModule);
//# sourceMappingURL=accounts.module.js.map