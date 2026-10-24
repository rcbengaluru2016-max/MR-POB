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
exports.SummaryResponseDto = exports.SubmissionResponseDto = exports.SummaryQueryDto = exports.RegistrationQueryDto = exports.PatientRegistrationDto = exports.CompanyRegistrationDto = exports.CustomerRegistrationDto = exports.BaseRegistrationDto = exports.PATIENT_PAYMENTS = exports.CUSTOMER_PAYMENTS = exports.CREDIT_DAYS = exports.CUSTOMER_TYPES = void 0;
const class_transformer_1 = require("class-transformer");
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const client_1 = require("@prisma/client");
exports.CUSTOMER_TYPES = ['Retail Pharmacy', 'Hospital', 'Clinic'];
exports.CREDIT_DAYS = ['same_day_3', 'week_2', 'days_30_none', 'days_60_special'];
const PAYMENT_METHODS = ['UPI', 'Debit Card', 'Credit Card', 'Net Banking', 'Bank Transfer', 'Wallet', 'Cheque', 'Other'];
exports.CUSTOMER_PAYMENTS = ['Cash on Delivery (COD)', ...PAYMENT_METHODS];
exports.PATIENT_PAYMENTS = ['Cash on Delivery', ...PAYMENT_METHODS];
const trim = ({ value }) => typeof value === 'string' ? value.trim() : value;
const optionalText = ({ value }) => typeof value === 'string' ? value.trim() || undefined : value;
function MatchesPassword() {
    return (target, propertyName) => (0, class_validator_1.registerDecorator)({
        name: 'matchesPassword', target: target.constructor, propertyName,
        options: { message: 'Passwords do not match' },
        validator: { validate: (value, args) => value === args.object.password },
    });
}
class BaseRegistrationDto {
    password;
    confirmPassword;
    termsAccepted;
}
exports.BaseRegistrationDto = BaseRegistrationDto;
__decorate([
    (0, swagger_1.ApiProperty)({ minLength: 8, maxLength: 256, format: 'password', writeOnly: true, description: 'Validated then discarded. Account activation sets a new Cognito password.' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(8),
    (0, class_validator_1.MaxLength)(256),
    (0, class_validator_1.Matches)(/^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)[\s\S]+$/, { message: 'Password must contain uppercase, lowercase and a number' }),
    __metadata("design:type", String)
], BaseRegistrationDto.prototype, "password", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ format: 'password', writeOnly: true }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(256),
    MatchesPassword(),
    __metadata("design:type", String)
], BaseRegistrationDto.prototype, "confirmPassword", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: Boolean, enum: [true], description: 'Multipart value must be the string true.' }),
    (0, class_transformer_1.Transform)(({ value }) => value === 'true' ? true : value),
    (0, class_validator_1.Equals)(true, { message: 'You must accept the Terms & Conditions' }),
    __metadata("design:type", Boolean)
], BaseRegistrationDto.prototype, "termsAccepted", void 0);
class CustomerRegistrationDto extends BaseRegistrationDto {
    customerName;
    mobile;
    email;
    businessName;
    customerType;
    addressLine1;
    addressLine2;
    addressLine3;
    addressLine4;
    pinCode;
    dlNumber1;
    dlNumber2;
    dlNumber3;
    fssaiNumber;
    gstNumber;
    creditDays;
    paymentMethod;
}
exports.CustomerRegistrationDto = CustomerRegistrationDto;
__decorate([
    (0, swagger_1.ApiProperty)({ minLength: 2, maxLength: 200 }),
    (0, class_transformer_1.Transform)(trim),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(2),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], CustomerRegistrationDto.prototype, "customerName", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ pattern: '^[6-9][0-9]{9}$' }),
    (0, class_transformer_1.Transform)(trim),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Matches)(/^[6-9]\d{9}$/),
    __metadata("design:type", String)
], CustomerRegistrationDto.prototype, "mobile", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ format: 'email' }),
    (0, class_transformer_1.Transform)(optionalText),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEmail)(),
    (0, class_validator_1.MaxLength)(254),
    __metadata("design:type", String)
], CustomerRegistrationDto.prototype, "email", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ minLength: 2, maxLength: 200 }),
    (0, class_transformer_1.Transform)(trim),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(2),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], CustomerRegistrationDto.prototype, "businessName", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: exports.CUSTOMER_TYPES }),
    (0, class_validator_1.IsIn)(exports.CUSTOMER_TYPES),
    __metadata("design:type", String)
], CustomerRegistrationDto.prototype, "customerType", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ minLength: 3, maxLength: 500 }),
    (0, class_transformer_1.Transform)(trim),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(3),
    (0, class_validator_1.MaxLength)(500),
    __metadata("design:type", String)
], CustomerRegistrationDto.prototype, "addressLine1", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ maxLength: 500 }),
    (0, class_transformer_1.Transform)(optionalText),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(500),
    __metadata("design:type", String)
], CustomerRegistrationDto.prototype, "addressLine2", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ maxLength: 500 }),
    (0, class_transformer_1.Transform)(optionalText),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(500),
    __metadata("design:type", String)
], CustomerRegistrationDto.prototype, "addressLine3", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ maxLength: 500 }),
    (0, class_transformer_1.Transform)(optionalText),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(500),
    __metadata("design:type", String)
], CustomerRegistrationDto.prototype, "addressLine4", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ pattern: '^[0-9]{6}$' }),
    (0, class_transformer_1.Transform)(trim),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Matches)(/^\d{6}$/),
    __metadata("design:type", String)
], CustomerRegistrationDto.prototype, "pinCode", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ minLength: 3, maxLength: 100 }),
    (0, class_transformer_1.Transform)(trim),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(3),
    (0, class_validator_1.MaxLength)(100),
    __metadata("design:type", String)
], CustomerRegistrationDto.prototype, "dlNumber1", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ minLength: 3, maxLength: 100 }),
    (0, class_transformer_1.Transform)(trim),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(3),
    (0, class_validator_1.MaxLength)(100),
    __metadata("design:type", String)
], CustomerRegistrationDto.prototype, "dlNumber2", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ maxLength: 100 }),
    (0, class_transformer_1.Transform)(optionalText),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(100),
    __metadata("design:type", String)
], CustomerRegistrationDto.prototype, "dlNumber3", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ maxLength: 100 }),
    (0, class_transformer_1.Transform)(optionalText),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(100),
    __metadata("design:type", String)
], CustomerRegistrationDto.prototype, "fssaiNumber", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ minLength: 1, maxLength: 100 }),
    (0, class_transformer_1.Transform)(trim),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(1),
    (0, class_validator_1.MaxLength)(100),
    __metadata("design:type", String)
], CustomerRegistrationDto.prototype, "gstNumber", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: exports.CREDIT_DAYS }),
    (0, class_validator_1.IsIn)(exports.CREDIT_DAYS),
    __metadata("design:type", String)
], CustomerRegistrationDto.prototype, "creditDays", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: exports.CUSTOMER_PAYMENTS }),
    (0, class_validator_1.IsIn)(exports.CUSTOMER_PAYMENTS),
    __metadata("design:type", String)
], CustomerRegistrationDto.prototype, "paymentMethod", void 0);
class CompanyRegistrationDto extends BaseRegistrationDto {
    companyName;
    division;
    headquarter;
    adminFullName;
    adminEmail;
    adminMobile;
}
exports.CompanyRegistrationDto = CompanyRegistrationDto;
__decorate([
    (0, swagger_1.ApiProperty)({ minLength: 2, maxLength: 200 }),
    (0, class_transformer_1.Transform)(trim),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(2),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], CompanyRegistrationDto.prototype, "companyName", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ minLength: 1, maxLength: 200 }),
    (0, class_transformer_1.Transform)(trim),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(1),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], CompanyRegistrationDto.prototype, "division", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ minLength: 2, maxLength: 200 }),
    (0, class_transformer_1.Transform)(trim),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(2),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], CompanyRegistrationDto.prototype, "headquarter", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ minLength: 2, maxLength: 200 }),
    (0, class_transformer_1.Transform)(trim),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(2),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], CompanyRegistrationDto.prototype, "adminFullName", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ format: 'email' }),
    (0, class_transformer_1.Transform)(trim),
    (0, class_validator_1.IsEmail)(),
    (0, class_validator_1.MaxLength)(254),
    __metadata("design:type", String)
], CompanyRegistrationDto.prototype, "adminEmail", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ pattern: '^[6-9][0-9]{9}$' }),
    (0, class_transformer_1.Transform)(trim),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Matches)(/^[6-9]\d{9}$/),
    __metadata("design:type", String)
], CompanyRegistrationDto.prototype, "adminMobile", void 0);
class PatientRegistrationDto extends BaseRegistrationDto {
    patientName;
    mobile;
    email;
    gender;
    address;
    paymentMethod;
}
exports.PatientRegistrationDto = PatientRegistrationDto;
__decorate([
    (0, swagger_1.ApiProperty)({ minLength: 2, maxLength: 200 }),
    (0, class_transformer_1.Transform)(trim),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(2),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], PatientRegistrationDto.prototype, "patientName", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ pattern: '^[6-9][0-9]{9}$' }),
    (0, class_transformer_1.Transform)(trim),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Matches)(/^[6-9]\d{9}$/),
    __metadata("design:type", String)
], PatientRegistrationDto.prototype, "mobile", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ format: 'email' }),
    (0, class_transformer_1.Transform)(optionalText),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEmail)(),
    (0, class_validator_1.MaxLength)(254),
    __metadata("design:type", String)
], PatientRegistrationDto.prototype, "email", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: ['Female', 'Male', 'Other', 'Prefer not to say'] }),
    (0, class_transformer_1.Transform)(optionalText),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['Female', 'Male', 'Other', 'Prefer not to say']),
    __metadata("design:type", String)
], PatientRegistrationDto.prototype, "gender", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ minLength: 8, maxLength: 2000 }),
    (0, class_transformer_1.Transform)(trim),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(8),
    (0, class_validator_1.MaxLength)(2000),
    __metadata("design:type", String)
], PatientRegistrationDto.prototype, "address", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: exports.PATIENT_PAYMENTS }),
    (0, class_validator_1.IsIn)(exports.PATIENT_PAYMENTS),
    __metadata("design:type", String)
], PatientRegistrationDto.prototype, "paymentMethod", void 0);
class RegistrationQueryDto {
    kind;
    status;
    page = 1;
    pageSize = 25;
}
exports.RegistrationQueryDto = RegistrationQueryDto;
__decorate([
    (0, swagger_1.ApiProperty)({ enum: client_1.RegistrationKind }),
    (0, class_validator_1.IsEnum)(client_1.RegistrationKind),
    __metadata("design:type", String)
], RegistrationQueryDto.prototype, "kind", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: client_1.RegistrationStatus }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(client_1.RegistrationStatus),
    __metadata("design:type", String)
], RegistrationQueryDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ default: 1, minimum: 1 }),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(100000),
    __metadata("design:type", Object)
], RegistrationQueryDto.prototype, "page", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ default: 25, minimum: 1, maximum: 100 }),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(100),
    __metadata("design:type", Object)
], RegistrationQueryDto.prototype, "pageSize", void 0);
class SummaryQueryDto {
    kind;
}
exports.SummaryQueryDto = SummaryQueryDto;
__decorate([
    (0, swagger_1.ApiProperty)({ enum: client_1.RegistrationKind }),
    (0, class_validator_1.IsEnum)(client_1.RegistrationKind),
    __metadata("design:type", String)
], SummaryQueryDto.prototype, "kind", void 0);
class SubmissionResponseDto {
    registrationId;
    status;
}
exports.SubmissionResponseDto = SubmissionResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'REG-CUS-a21ed864-6b44-4632-9251-2d7ad50bd290' }),
    __metadata("design:type", String)
], SubmissionResponseDto.prototype, "registrationId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: client_1.RegistrationStatus, example: 'PENDING' }),
    __metadata("design:type", String)
], SubmissionResponseDto.prototype, "status", void 0);
class SummaryResponseDto {
    pending;
    approved;
    rejected;
}
exports.SummaryResponseDto = SummaryResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], SummaryResponseDto.prototype, "pending", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], SummaryResponseDto.prototype, "approved", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], SummaryResponseDto.prototype, "rejected", void 0);
//# sourceMappingURL=registration.dto.js.map