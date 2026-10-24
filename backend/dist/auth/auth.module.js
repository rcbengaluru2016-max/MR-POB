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
exports.AuthModule = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const throttler_1 = require("@nestjs/throttler");
const auth_service_1 = require("./auth.service");
const auth_guard_1 = require("./auth.guard");
const prisma_service_1 = require("../database/prisma.service");
const config_service_1 = require("../config/config.service");
class LoginDto {
    username;
    password;
}
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(1),
    (0, class_validator_1.MaxLength)(254),
    __metadata("design:type", String)
], LoginDto.prototype, "username", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ format: 'password' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(1),
    (0, class_validator_1.MaxLength)(256),
    __metadata("design:type", String)
], LoginDto.prototype, "password", void 0);
class ChallengeDto {
    username;
    session;
    challengeName;
    code;
}
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(1),
    (0, class_validator_1.MaxLength)(254),
    __metadata("design:type", String)
], ChallengeDto.prototype, "username", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Length)(1, 4096),
    __metadata("design:type", String)
], ChallengeDto.prototype, "session", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['SOFTWARE_TOKEN_MFA', 'SMS_MFA', 'MFA_SETUP'] }),
    (0, class_validator_1.IsIn)(['SOFTWARE_TOKEN_MFA', 'SMS_MFA', 'MFA_SETUP']),
    __metadata("design:type", String)
], ChallengeDto.prototype, "challengeName", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.Matches)(/^\d{6}$/),
    __metadata("design:type", String)
], ChallengeDto.prototype, "code", void 0);
let AuthController = class AuthController {
    auth;
    constructor(auth) {
        this.auth = auth;
    }
    login(body) { return this.auth.login(body.username, body.password); }
    challenge(body) { return this.auth.challenge(body); }
    me(request) { return { user: this.auth.session(request.user) }; }
    async logout(request) { await this.auth.logout(request.headers.authorization.slice(7)); return { success: true }; }
};
__decorate([
    (0, common_1.Post)('login'),
    (0, throttler_1.Throttle)({ default: { limit: 10, ttl: 60000 } }),
    (0, swagger_1.ApiOperation)({ summary: 'Authenticate an existing Cognito account; does not create or activate ERP accounts' }),
    (0, swagger_1.ApiResponse)({ status: 201, description: 'Access token and ERP user, or MFA challenge/session/username' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [LoginDto]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "login", null);
__decorate([
    (0, common_1.Post)('challenge'),
    (0, throttler_1.Throttle)({ default: { limit: 10, ttl: 60000 } }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [ChallengeDto]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "challenge", null);
__decorate([
    (0, common_1.Get)('me'),
    (0, common_1.UseGuards)(auth_guard_1.CognitoGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "me", null);
__decorate([
    (0, common_1.Post)('logout'),
    (0, common_1.UseGuards)(auth_guard_1.CognitoGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "logout", null);
AuthController = __decorate([
    (0, swagger_1.ApiTags)('Authentication'),
    (0, common_1.Controller)('auth'),
    __metadata("design:paramtypes", [auth_service_1.AuthService])
], AuthController);
let AuthModule = class AuthModule {
};
exports.AuthModule = AuthModule;
exports.AuthModule = AuthModule = __decorate([
    (0, common_1.Module)({ imports: [prisma_service_1.DatabaseModule, config_service_1.ConfigModule], controllers: [AuthController], providers: [auth_service_1.AuthService, auth_guard_1.CognitoGuard, auth_guard_1.AdminGuard, auth_guard_1.SuperAdminGuard], exports: [auth_service_1.AuthService, auth_guard_1.CognitoGuard, auth_guard_1.AdminGuard, auth_guard_1.SuperAdminGuard] })
], AuthModule);
//# sourceMappingURL=auth.module.js.map