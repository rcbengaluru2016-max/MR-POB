import { applyDecorators, Body, Controller, Get, Headers, Param, Post, Query, Req, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { ApiBadRequestResponse, ApiBearerAuth, ApiBody, ApiConflictResponse, ApiConsumes, ApiCreatedResponse, ApiExtraModels, ApiForbiddenResponse, ApiHeader, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiPayloadTooLargeResponse, ApiServiceUnavailableResponse, ApiTags, ApiTooManyRequestsResponse, ApiUnauthorizedResponse, ApiUnsupportedMediaTypeResponse, getSchemaPath } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { Throttle } from '@nestjs/throttler';
import { CognitoGuard, AdminGuard, AuthenticatedRequest } from '../auth/auth.guard';
import { CompanyRegistrationDto, CustomerRegistrationDto, PatientRegistrationDto, RegistrationQueryDto, SubmissionResponseDto, SummaryQueryDto, SummaryResponseDto } from './registration.dto';
import { RegistrationsService } from './registrations.service';
import { AnalyticsService } from './analytics.service';
import { AnalyticsQueryDto, RegistrationDecisionDto } from './management.dto';

const limits = { fileSize: 5 * 1024 * 1024, files: 6, fields: 30, fieldSize: 4096, parts: 36 };
function SubmissionDocs(dto: typeof CustomerRegistrationDto | typeof CompanyRegistrationDto | typeof PatientRegistrationDto, requiredFiles: string[], optionalFiles: string[] = []) {
  return applyDecorators(
    ApiConsumes('multipart/form-data'),
    ApiHeader({ name: 'Idempotency-Key', required: false, description: '16–128 alphanumeric/underscore/hyphen characters. Replay must contain identical normalized registration data and document bytes.' }),
    ApiBody({ schema: { allOf: [{ $ref: getSchemaPath(dto) }, { type: 'object', ...(requiredFiles.length ? { required: requiredFiles } : {}), properties: Object.fromEntries([...requiredFiles, ...optionalFiles].map(name => [name, { type: 'string', format: 'binary', description: 'Maximum 5 MiB. PDF/JPEG/PNG/WEBP; company files images only.' }])) }] } }),
    ApiCreatedResponse({ type: SubmissionResponseDto }),
    ApiBadRequestResponse({ description: 'Missing/invalid fields, document slots, confirmation or terms; unexpected fields are rejected.' }),
    ApiConflictResponse({ description: 'Duplicate contact/GST or idempotency key reused with differing data.' }),
    ApiPayloadTooLargeResponse({ description: 'File exceeds 5 MiB or multipart limit.' }),
    ApiUnsupportedMediaTypeResponse({ description: 'File extension, MIME or decoded content is unsupported.' }),
    ApiTooManyRequestsResponse({ description: 'Public registration submission rate exceeded (10 requests per minute per application instance/IP).' }),
    ApiServiceUnavailableResponse({ description: 'Storage/database unavailable; submission was not reported successful.' }),
  );
}

@ApiTags('Registrations')
@ApiExtraModels(CustomerRegistrationDto, CompanyRegistrationDto, PatientRegistrationDto)
@Throttle({ default: { limit: 10, ttl: 60000 } })
@Controller('registrations')
export class RegistrationsController {
  constructor(private readonly registrations: RegistrationsService) {}

  @Post('customers')
  @ApiOperation({ summary: 'Submit a customer registration; does not create an ERP account' })
  @SubmissionDocs(CustomerRegistrationDto, ['dl1', 'dl2', 'gstCertificate', 'shopOutside', 'shopInside'], ['dl3'])
  @UseInterceptors(AnyFilesInterceptor({ storage: memoryStorage(), limits }))
  customer(@Body() input: CustomerRegistrationDto, @UploadedFiles() files: Express.Multer.File[], @Headers('idempotency-key') key?: string) {
    return this.registrations.submit('customer', input, files ?? [], key);
  }

  @Post('companies')
  @ApiOperation({ summary: 'Submit a company registration; does not create an ERP account' })
  @SubmissionDocs(CompanyRegistrationDto, ['companyLogo', 'adminPhoto'])
  @UseInterceptors(AnyFilesInterceptor({ storage: memoryStorage(), limits }))
  company(@Body() input: CompanyRegistrationDto, @UploadedFiles() files: Express.Multer.File[], @Headers('idempotency-key') key?: string) {
    return this.registrations.submit('company', input, files ?? [], key);
  }

  @Post('patients')
  @ApiOperation({ summary: 'Submit a patient registration; ID proof is optional' })
  @SubmissionDocs(PatientRegistrationDto, [], ['idProof'])
  @UseInterceptors(AnyFilesInterceptor({ storage: memoryStorage(), limits }))
  patient(@Body() input: PatientRegistrationDto, @UploadedFiles() files: Express.Multer.File[], @Headers('idempotency-key') key?: string) {
    return this.registrations.submit('patient', input, files ?? [], key);
  }
}

@ApiTags('Approved owner profiles') @ApiBearerAuth()
@UseGuards(CognitoGuard)
@Controller('registrations/me')
export class OwnedRegistrationsController {
  constructor(private readonly registrations: RegistrationsService) {}
  @Get()
  @ApiOperation({ summary: 'Approved profiles for the active authenticated owner, scoped to their ERP role' })
  mine(@Req() request: AuthenticatedRequest) { return this.registrations.mine(request.user); }
}

const listItemSchema = {
  type: 'object' as const, required: ['id', 'kind', 'status', 'submittedAt', 'name', 'mobile', 'businessType'],
  properties: { id: { type: 'string', example: 'REG-CUS-ZI0001' }, masterCode: { type: 'string', nullable: true, example: 'ZI0001' }, notificationStatus: { type: 'string', nullable: true }, activationPending: { type: 'boolean' }, kind: { type: 'string', enum: ['customer', 'company', 'patient'] }, status: { type: 'string', enum: ['PENDING', 'APPROVED', 'REJECTED'] }, submittedAt: { type: 'string', format: 'date-time' }, name: { type: 'string' }, mobile: { type: 'string' }, email: { type: 'string' }, accountStatus: { type: 'string', enum: ['active', 'inactive'] }, businessType: { type: 'string' } },
};

@ApiTags('Admin registrations')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing, expired or invalid Cognito access token.' })
@ApiForbiddenResponse({ description: 'ERP account is inactive or does not have ADMIN/SUPER_ADMIN role.' })
@UseGuards(CognitoGuard, AdminGuard)
@Controller('admin/registrations')
export class AdminRegistrationsController {
  constructor(private readonly registrations: RegistrationsService, private readonly analytics: AnalyticsService) {}

  @Get('analytics')
  @ApiOperation({ summary: 'Shared dashboard KPIs, category/status totals, daily trend and recent registrations in a UTC range' })
  @ApiOkResponse({ schema: { type: 'object', required: ['period', 'range', 'kpis', 'byKind', 'categoryShare', 'statusShare', 'trend', 'recent'], properties: { period: { type: 'string' }, range: { type: 'object', properties: { start: { type: 'string', format: 'date' }, end: { type: 'string', format: 'date' } } }, kpis: { type: 'object', additionalProperties: { type: 'object', properties: { value: { type: 'integer' }, change: { type: 'integer' } } } }, byKind: { type: 'object', additionalProperties: { type: 'object', additionalProperties: { type: 'integer' } } }, categoryShare: { type: 'object', additionalProperties: { type: 'integer' } }, statusShare: { type: 'object', additionalProperties: { type: 'integer' } }, trend: { type: 'array', items: { type: 'object', properties: { date: { type: 'string', format: 'date' }, count: { type: 'integer' } } } }, recent: { type: 'array', items: { type: 'object', properties: listItemSchema.properties } } } } })
  @ApiBadRequestResponse({ description: 'Invalid period, invalid calendar dates, reversed range or custom range longer than 180 days.' })
  dashboard(@Query() query: AnalyticsQueryDto) { return this.analytics.dashboard(query); }

  @Get()
  @ApiOperation({ summary: 'Paginated registrations belonging to the requested type' })
  @ApiOkResponse({ schema: { type: 'object', properties: { items: { type: 'array', items: listItemSchema }, total: { type: 'integer' }, page: { type: 'integer' }, pageSize: { type: 'integer' } } } })
  list(@Query() query: RegistrationQueryDto) { return this.registrations.list(query); }

  @Get('summary')
  @ApiOperation({ summary: 'Status totals calculated from PostgreSQL for the requested type' })
  @ApiOkResponse({ type: SummaryResponseDto })
  summary(@Query() query: SummaryQueryDto) { return this.registrations.summary(query.kind); }

  @Get('approved')
  @ApiOperation({ summary: 'Approved records of the requested category, reusing the original registration and profile' })
  approved(@Query() query: RegistrationQueryDto) { return this.registrations.approved(query); }

  @Get(':id')
  @ApiOperation({ summary: 'Complete registration fields and document metadata without storage URLs or credentials' })
  @ApiOkResponse({ schema: { type: 'object', properties: { record: { type: 'object', description: 'Common registration fields, type-specific customer/company/patient fields, readOnly:false, Master Code, account and notification status, and files keyed by slot.', properties: { ...listItemSchema.properties, readOnly: { type: 'boolean', enum: [false] }, activationPending: { type: 'boolean' }, email: { type: 'string', nullable: true }, termsAcceptedAt: { type: 'string', format: 'date-time' }, termsVersion: { type: 'string' }, decidedAt: { type: 'string', format: 'date-time', nullable: true }, rejectionReason: { type: 'string', nullable: true }, files: { type: 'object', additionalProperties: { type: 'object', properties: { id: { type: 'string', format: 'uuid' }, name: { type: 'string' }, type: { type: 'string' }, size: { type: 'integer' }, sha256: { type: 'string' }, accessPath: { type: 'string' } } } } }, additionalProperties: true } } } })
  @ApiNotFoundResponse({ description: 'Registration not found.' })
  detail(@Param('id') id: string) { return this.registrations.detail(id); }

  @Post(':id/decision')
  @ApiOperation({ summary: 'Approve atomically with a shared Master Code, linked owner and notification outbox, or reject; repeat decisions are idempotent' })
  @ApiCreatedResponse({ schema: { type: 'object', properties: { ok: { type: 'boolean' }, status: { type: 'string', enum: ['APPROVED', 'REJECTED'] }, masterCode: { type: 'string', nullable: true, example: 'ZI0001' }, decidedAt: { type: 'string', format: 'date-time' }, activationPending: { type: 'boolean' }, accountStatus: { type: 'string', enum: ['active', 'inactive'] }, notificationStatus: { type: 'string', nullable: true } } } })
  @ApiBadRequestResponse({ description: 'Invalid action, structured rejection reason, or unreviewed/invalid custom text (8–500 characters).' })
  @ApiNotFoundResponse({ description: 'Registration not found.' })
  @ApiConflictResponse({ description: 'Registration already decided by a reviewer.' })
  decide(@Param('id') id: string, @Body() input: RegistrationDecisionDto, @Req() request: AuthenticatedRequest) { return this.registrations.decide(id, input, request.user.id); }
}
