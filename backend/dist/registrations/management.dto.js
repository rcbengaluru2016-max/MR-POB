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
exports.RegistrationDecisionDto = exports.AnalyticsQueryDto = void 0;
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
const swagger_1 = require("@nestjs/swagger");
class AnalyticsQueryDto {
    period = 'monthly';
    start;
    end;
}
exports.AnalyticsQueryDto = AnalyticsQueryDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: ['daily', 'weekly', 'monthly', 'custom'], default: 'monthly' }),
    (0, class_validator_1.IsIn)(['daily', 'weekly', 'monthly', 'custom']),
    __metadata("design:type", String)
], AnalyticsQueryDto.prototype, "period", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ format: 'date', description: 'Required for custom period; UTC inclusive, at most 180 days.' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(10),
    __metadata("design:type", String)
], AnalyticsQueryDto.prototype, "start", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ format: 'date' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(10),
    __metadata("design:type", String)
], AnalyticsQueryDto.prototype, "end", void 0);
class RegistrationDecisionDto {
    action;
    reason;
}
exports.RegistrationDecisionDto = RegistrationDecisionDto;
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['approve', 'reject'] }),
    (0, class_validator_1.IsIn)(['approve', 'reject']),
    __metadata("design:type", String)
], RegistrationDecisionDto.prototype, "action", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ minLength: 8, maxLength: 2000, description: 'Required for rejection.' }),
    (0, class_validator_1.ValidateIf)(input => input.action === 'reject' || input.reason !== undefined),
    (0, class_transformer_1.Transform)(({ value }) => typeof value === 'string' ? value.trim() : value),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(8),
    (0, class_validator_1.MaxLength)(2000),
    __metadata("design:type", String)
], RegistrationDecisionDto.prototype, "reason", void 0);
//# sourceMappingURL=management.dto.js.map