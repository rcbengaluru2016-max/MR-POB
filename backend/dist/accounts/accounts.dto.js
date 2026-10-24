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
exports.AdminAccountDto = exports.AccountStateDto = exports.AccountQueryDto = exports.CreateAdminDto = exports.AccountPasswordDto = void 0;
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
const swagger_1 = require("@nestjs/swagger");
class AccountPasswordDto {
    password;
}
exports.AccountPasswordDto = AccountPasswordDto;
__decorate([
    (0, swagger_1.ApiProperty)({ format: 'password', writeOnly: true, minLength: 12, maxLength: 128, description: 'Uppercase, lowercase, digit and symbol; no whitespace. Never stored by ERP.' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(12),
    (0, class_validator_1.MaxLength)(128),
    (0, class_validator_1.Matches)(/^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[^A-Za-z0-9])\S+$/, { message: 'Password must contain uppercase, lowercase, a number and a symbol, without spaces' }),
    __metadata("design:type", String)
], AccountPasswordDto.prototype, "password", void 0);
class CreateAdminDto extends AccountPasswordDto {
    name;
    email;
    role;
    state = 'INACTIVE';
}
exports.CreateAdminDto = CreateAdminDto;
__decorate([
    (0, swagger_1.ApiProperty)({ minLength: 2, maxLength: 100 }),
    (0, class_transformer_1.Transform)(({ value }) => typeof value === 'string' ? value.trim() : value),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(2),
    (0, class_validator_1.MaxLength)(100),
    __metadata("design:type", String)
], CreateAdminDto.prototype, "name", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ format: 'email', description: 'Also used as username; normalized to lowercase.' }),
    (0, class_transformer_1.Transform)(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value),
    (0, class_validator_1.IsEmail)(),
    (0, class_validator_1.MaxLength)(254),
    __metadata("design:type", String)
], CreateAdminDto.prototype, "email", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['ADMIN'] }),
    (0, class_validator_1.IsIn)(['ADMIN']),
    __metadata("design:type", String)
], CreateAdminDto.prototype, "role", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: ['ACTIVE', 'INACTIVE'], default: 'INACTIVE' }),
    (0, class_validator_1.IsIn)(['ACTIVE', 'INACTIVE']),
    __metadata("design:type", String)
], CreateAdminDto.prototype, "state", void 0);
class AccountQueryDto {
    page = 1;
    pageSize = 25;
}
exports.AccountQueryDto = AccountQueryDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ default: 1, minimum: 1 }),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(100000),
    __metadata("design:type", Object)
], AccountQueryDto.prototype, "page", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ default: 25, minimum: 1, maximum: 100 }),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(100),
    __metadata("design:type", Object)
], AccountQueryDto.prototype, "pageSize", void 0);
class AccountStateDto {
    state;
}
exports.AccountStateDto = AccountStateDto;
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['ACTIVE', 'INACTIVE'] }),
    (0, class_validator_1.IsIn)(['ACTIVE', 'INACTIVE']),
    __metadata("design:type", String)
], AccountStateDto.prototype, "state", void 0);
class AdminAccountDto {
    id;
    username;
    email;
    name;
    role;
    state;
    createdById;
    createdAt;
    updatedAt;
    provisioningRequired;
}
exports.AdminAccountDto = AdminAccountDto;
__decorate([
    (0, swagger_1.ApiProperty)({ format: 'uuid' }),
    __metadata("design:type", String)
], AdminAccountDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], AdminAccountDto.prototype, "username", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: String, nullable: true }),
    __metadata("design:type", Object)
], AdminAccountDto.prototype, "email", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], AdminAccountDto.prototype, "name", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['ADMIN'] }),
    __metadata("design:type", String)
], AdminAccountDto.prototype, "role", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['ACTIVE', 'INACTIVE'] }),
    __metadata("design:type", String)
], AdminAccountDto.prototype, "state", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: String, format: 'uuid', nullable: true }),
    __metadata("design:type", Object)
], AdminAccountDto.prototype, "createdById", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ format: 'date-time' }),
    __metadata("design:type", Date)
], AdminAccountDto.prototype, "createdAt", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ format: 'date-time' }),
    __metadata("design:type", Date)
], AdminAccountDto.prototype, "updatedAt", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'True until a Cognito identity has been linked; use the password endpoint to complete setup.' }),
    __metadata("design:type", Boolean)
], AdminAccountDto.prototype, "provisioningRequired", void 0);
//# sourceMappingURL=accounts.dto.js.map