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
exports.AdminRegistrationsController = exports.OwnedRegistrationsController = exports.RegistrationsController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const swagger_1 = require("@nestjs/swagger");
const multer_1 = require("multer");
const throttler_1 = require("@nestjs/throttler");
const auth_guard_1 = require("../auth/auth.guard");
const registration_dto_1 = require("./registration.dto");
const registrations_service_1 = require("./registrations.service");
const analytics_service_1 = require("./analytics.service");
const management_dto_1 = require("./management.dto");
const limits = { fileSize: 5 * 1024 * 1024, files: 6, fields: 30, fieldSize: 4096, parts: 36 };
function SubmissionDocs(dto, requiredFiles, optionalFiles = []) {
    return (0, common_1.applyDecorators)((0, swagger_1.ApiConsumes)('multipart/form-data'), (0, swagger_1.ApiHeader)({ name: 'Idempotency-Key', required: false, description: '16–128 alphanumeric/underscore/hyphen characters. Replay must contain identical normalized registration data and document bytes.' }), (0, swagger_1.ApiBody)({ schema: { allOf: [{ $ref: (0, swagger_1.getSchemaPath)(dto) }, { type: 'object', ...(requiredFiles.length ? { required: requiredFiles } : {}), properties: Object.fromEntries([...requiredFiles, ...optionalFiles].map(name => [name, { type: 'string', format: 'binary', description: 'Maximum 5 MiB. PDF/JPEG/PNG/WEBP; company files images only.' }])) }] } }), (0, swagger_1.ApiCreatedResponse)({ type: registration_dto_1.SubmissionResponseDto }), (0, swagger_1.ApiBadRequestResponse)({ description: 'Missing/invalid fields, document slots, confirmation or terms; unexpected fields are rejected.' }), (0, swagger_1.ApiConflictResponse)({ description: 'Duplicate contact/GST or idempotency key reused with differing data.' }), (0, swagger_1.ApiPayloadTooLargeResponse)({ description: 'File exceeds 5 MiB or multipart limit.' }), (0, swagger_1.ApiUnsupportedMediaTypeResponse)({ description: 'File extension, MIME or decoded content is unsupported.' }), (0, swagger_1.ApiTooManyRequestsResponse)({ description: 'Public registration submission rate exceeded (10 requests per minute per application instance/IP).' }), (0, swagger_1.ApiServiceUnavailableResponse)({ description: 'Storage/database unavailable; submission was not reported successful.' }));
}
let RegistrationsController = class RegistrationsController {
    registrations;
    constructor(registrations) {
        this.registrations = registrations;
    }
    customer(input, files, key) {
        return this.registrations.submit('customer', input, files ?? [], key);
    }
    company(input, files, key) {
        return this.registrations.submit('company', input, files ?? [], key);
    }
    patient(input, files, key) {
        return this.registrations.submit('patient', input, files ?? [], key);
    }
};
exports.RegistrationsController = RegistrationsController;
__decorate([
    (0, common_1.Post)('customers'),
    (0, swagger_1.ApiOperation)({ summary: 'Submit a customer registration; does not create an ERP account' }),
    SubmissionDocs(registration_dto_1.CustomerRegistrationDto, ['dl1', 'dl2', 'gstCertificate', 'shopOutside', 'shopInside'], ['dl3']),
    (0, common_1.UseInterceptors)((0, platform_express_1.AnyFilesInterceptor)({ storage: (0, multer_1.memoryStorage)(), limits })),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.UploadedFiles)()),
    __param(2, (0, common_1.Headers)('idempotency-key')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [registration_dto_1.CustomerRegistrationDto, Array, String]),
    __metadata("design:returntype", void 0)
], RegistrationsController.prototype, "customer", null);
__decorate([
    (0, common_1.Post)('companies'),
    (0, swagger_1.ApiOperation)({ summary: 'Submit a company registration; does not create an ERP account' }),
    SubmissionDocs(registration_dto_1.CompanyRegistrationDto, ['companyLogo', 'adminPhoto']),
    (0, common_1.UseInterceptors)((0, platform_express_1.AnyFilesInterceptor)({ storage: (0, multer_1.memoryStorage)(), limits })),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.UploadedFiles)()),
    __param(2, (0, common_1.Headers)('idempotency-key')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [registration_dto_1.CompanyRegistrationDto, Array, String]),
    __metadata("design:returntype", void 0)
], RegistrationsController.prototype, "company", null);
__decorate([
    (0, common_1.Post)('patients'),
    (0, swagger_1.ApiOperation)({ summary: 'Submit a patient registration; ID proof is optional' }),
    SubmissionDocs(registration_dto_1.PatientRegistrationDto, [], ['idProof']),
    (0, common_1.UseInterceptors)((0, platform_express_1.AnyFilesInterceptor)({ storage: (0, multer_1.memoryStorage)(), limits })),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.UploadedFiles)()),
    __param(2, (0, common_1.Headers)('idempotency-key')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [registration_dto_1.PatientRegistrationDto, Array, String]),
    __metadata("design:returntype", void 0)
], RegistrationsController.prototype, "patient", null);
exports.RegistrationsController = RegistrationsController = __decorate([
    (0, swagger_1.ApiTags)('Registrations'),
    (0, swagger_1.ApiExtraModels)(registration_dto_1.CustomerRegistrationDto, registration_dto_1.CompanyRegistrationDto, registration_dto_1.PatientRegistrationDto),
    (0, throttler_1.Throttle)({ default: { limit: 10, ttl: 60000 } }),
    (0, common_1.Controller)('registrations'),
    __metadata("design:paramtypes", [registrations_service_1.RegistrationsService])
], RegistrationsController);
let OwnedRegistrationsController = class OwnedRegistrationsController {
    registrations;
    constructor(registrations) {
        this.registrations = registrations;
    }
    mine(request) { return this.registrations.mine(request.user); }
};
exports.OwnedRegistrationsController = OwnedRegistrationsController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Approved profiles for the active authenticated owner, scoped to their ERP role' }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], OwnedRegistrationsController.prototype, "mine", null);
exports.OwnedRegistrationsController = OwnedRegistrationsController = __decorate([
    (0, swagger_1.ApiTags)('Approved owner profiles'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(auth_guard_1.CognitoGuard),
    (0, common_1.Controller)('registrations/me'),
    __metadata("design:paramtypes", [registrations_service_1.RegistrationsService])
], OwnedRegistrationsController);
const listItemSchema = {
    type: 'object', required: ['id', 'kind', 'status', 'submittedAt', 'name', 'mobile', 'businessType'],
    properties: { id: { type: 'string' }, kind: { type: 'string', enum: ['customer', 'company', 'patient'] }, status: { type: 'string', enum: ['PENDING', 'APPROVED', 'REJECTED'] }, submittedAt: { type: 'string', format: 'date-time' }, name: { type: 'string' }, mobile: { type: 'string' }, email: { type: 'string' }, accountStatus: { type: 'string', enum: ['active', 'inactive'] }, businessType: { type: 'string' } },
};
let AdminRegistrationsController = class AdminRegistrationsController {
    registrations;
    analytics;
    constructor(registrations, analytics) {
        this.registrations = registrations;
        this.analytics = analytics;
    }
    dashboard(query) { return this.analytics.dashboard(query); }
    list(query) { return this.registrations.list(query); }
    summary(query) { return this.registrations.summary(query.kind); }
    approved(query) { return this.registrations.approved(query); }
    detail(id) { return this.registrations.detail(id); }
    decide(id, input, request) { return this.registrations.decide(id, input, request.user.id); }
};
exports.AdminRegistrationsController = AdminRegistrationsController;
__decorate([
    (0, common_1.Get)('analytics'),
    (0, swagger_1.ApiOperation)({ summary: 'Shared dashboard KPIs, category/status totals, daily trend and recent registrations in a UTC range' }),
    (0, swagger_1.ApiOkResponse)({ schema: { type: 'object', required: ['period', 'range', 'kpis', 'byKind', 'categoryShare', 'statusShare', 'trend', 'recent'], properties: { period: { type: 'string' }, range: { type: 'object', properties: { start: { type: 'string', format: 'date' }, end: { type: 'string', format: 'date' } } }, kpis: { type: 'object', additionalProperties: { type: 'object', properties: { value: { type: 'integer' }, change: { type: 'integer' } } } }, byKind: { type: 'object', additionalProperties: { type: 'object', additionalProperties: { type: 'integer' } } }, categoryShare: { type: 'object', additionalProperties: { type: 'integer' } }, statusShare: { type: 'object', additionalProperties: { type: 'integer' } }, trend: { type: 'array', items: { type: 'object', properties: { date: { type: 'string', format: 'date' }, count: { type: 'integer' } } } }, recent: { type: 'array', items: { type: 'object', properties: listItemSchema.properties } } } } }),
    (0, swagger_1.ApiBadRequestResponse)({ description: 'Invalid period, invalid calendar dates, reversed range or custom range longer than 180 days.' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [management_dto_1.AnalyticsQueryDto]),
    __metadata("design:returntype", void 0)
], AdminRegistrationsController.prototype, "dashboard", null);
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Paginated registrations belonging to the requested type' }),
    (0, swagger_1.ApiOkResponse)({ schema: { type: 'object', properties: { items: { type: 'array', items: listItemSchema }, total: { type: 'integer' }, page: { type: 'integer' }, pageSize: { type: 'integer' } } } }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [registration_dto_1.RegistrationQueryDto]),
    __metadata("design:returntype", void 0)
], AdminRegistrationsController.prototype, "list", null);
__decorate([
    (0, common_1.Get)('summary'),
    (0, swagger_1.ApiOperation)({ summary: 'Status totals calculated from PostgreSQL for the requested type' }),
    (0, swagger_1.ApiOkResponse)({ type: registration_dto_1.SummaryResponseDto }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [registration_dto_1.SummaryQueryDto]),
    __metadata("design:returntype", void 0)
], AdminRegistrationsController.prototype, "summary", null);
__decorate([
    (0, common_1.Get)('approved'),
    (0, swagger_1.ApiOperation)({ summary: 'Approved records of the requested category, reusing the original registration and profile' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [registration_dto_1.RegistrationQueryDto]),
    __metadata("design:returntype", void 0)
], AdminRegistrationsController.prototype, "approved", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'Complete registration fields and document metadata without storage URLs or credentials' }),
    (0, swagger_1.ApiOkResponse)({ schema: { type: 'object', properties: { record: { type: 'object', description: 'Common registration fields, type-specific customer/company/patient fields, readOnly:false, activationPending:true and files keyed by slot.', properties: { ...listItemSchema.properties, readOnly: { type: 'boolean', enum: [false] }, activationPending: { type: 'boolean', enum: [true] }, email: { type: 'string', nullable: true }, termsAcceptedAt: { type: 'string', format: 'date-time' }, termsVersion: { type: 'string' }, decidedAt: { type: 'string', format: 'date-time', nullable: true }, rejectionReason: { type: 'string', nullable: true }, files: { type: 'object', additionalProperties: { type: 'object', properties: { id: { type: 'string', format: 'uuid' }, name: { type: 'string' }, type: { type: 'string' }, size: { type: 'integer' }, sha256: { type: 'string' }, accessPath: { type: 'string' } } } } }, additionalProperties: true } } } }),
    (0, swagger_1.ApiNotFoundResponse)({ description: 'Registration not found.' }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], AdminRegistrationsController.prototype, "detail", null);
__decorate([
    (0, common_1.Post)(':id/decision'),
    (0, swagger_1.ApiOperation)({ summary: 'Approve/reject a pending registration; records an audited decision without provisioning credentials, master records or activation email' }),
    (0, swagger_1.ApiCreatedResponse)({ schema: { type: 'object', properties: { ok: { type: 'boolean' }, status: { type: 'string', enum: ['APPROVED', 'REJECTED'] }, decidedAt: { type: 'string', format: 'date-time' }, activationPending: { type: 'boolean', enum: [true] } } } }),
    (0, swagger_1.ApiBadRequestResponse)({ description: 'Invalid action or missing rejection reason (8–2000 characters).' }),
    (0, swagger_1.ApiNotFoundResponse)({ description: 'Registration not found.' }),
    (0, swagger_1.ApiConflictResponse)({ description: 'Registration already decided by a reviewer.' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, management_dto_1.RegistrationDecisionDto, Object]),
    __metadata("design:returntype", void 0)
], AdminRegistrationsController.prototype, "decide", null);
exports.AdminRegistrationsController = AdminRegistrationsController = __decorate([
    (0, swagger_1.ApiTags)('Admin registrations'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiUnauthorizedResponse)({ description: 'Missing, expired or invalid Cognito access token.' }),
    (0, swagger_1.ApiForbiddenResponse)({ description: 'ERP account is inactive or does not have ADMIN/SUPER_ADMIN role.' }),
    (0, common_1.UseGuards)(auth_guard_1.CognitoGuard, auth_guard_1.AdminGuard),
    (0, common_1.Controller)('admin/registrations'),
    __metadata("design:paramtypes", [registrations_service_1.RegistrationsService, analytics_service_1.AnalyticsService])
], AdminRegistrationsController);
//# sourceMappingURL=registrations.controller.js.map