import { Body, Controller, Delete, Get, Module, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiConflictResponse, ApiCreatedResponse, ApiForbiddenResponse, ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse, ApiBadRequestResponse, ApiNotFoundResponse, ApiExtraModels, getSchemaPath } from '@nestjs/swagger';
import { AuthModule } from '../auth/auth.module';
import { AuthenticatedRequest, CognitoGuard, SuperAdminGuard } from '../auth/auth.guard';
import { DatabaseModule } from '../database/prisma.service';
import { AccountsService } from './accounts.service';
import { AccountQueryDto, AccountStateDto, AdminAccountDto, AdminPasswordResetDto, CreateAdminDto, StepUpChallengeDto, StepUpVerifyDto, StepUpProofDto, ResetTokenDto, CompleteResetDto } from './accounts.dto';
import { StepUpService } from './step-up.service';
import { CognitoAccountsService } from './cognito-accounts.service';
import { ConfigModule } from '../config/config.service';
import { CurrentAccountService, CurrentPasswordChallengeDto, CurrentPasswordChangeDto } from './current-account.service';

@ApiTags('Current account') @ApiBearerAuth() @Controller('account/me') @UseGuards(CognitoGuard)
export class CurrentAccountController {
  constructor(private readonly current: CurrentAccountService) {}
  @Get() me(@Req() request: AuthenticatedRequest) { return this.current.me(request.user); }
  @Get('security') @UseGuards(SuperAdminGuard)
  security(@Req() request: AuthenticatedRequest) { return this.current.security(request.user); }
  @Post('change-password/challenge') @UseGuards(SuperAdminGuard) @Throttle({ default: { limit: 5, ttl: 60000 } })
  challenge(@Req() request: AuthenticatedRequest, @Body() input: CurrentPasswordChallengeDto) { return this.current.challenge(request.user, request.headers.authorization!.slice(7), input); }
  @Post('change-password/verify') @UseGuards(SuperAdminGuard) @Throttle({ default: { limit: 10, ttl: 60000 } })
  verify(@Req() request: AuthenticatedRequest, @Body() input: StepUpVerifyDto) { return this.current.verify(request.user, request.headers.authorization!.slice(7), input); }
  @Post('change-password') @UseGuards(SuperAdminGuard) @Throttle({ default: { limit: 5, ttl: 60000 } })
  change(@Req() request: AuthenticatedRequest, @Body() input: CurrentPasswordChangeDto) { return this.current.change(request.user, request.headers.authorization!.slice(7), input); }
}

const accountEnvelope = { type: 'object' as const, properties: { account: { $ref: getSchemaPath(AdminAccountDto) } } };
@ApiTags('Super Admin accounts')
@ApiExtraModels(AdminAccountDto)
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Verified Cognito access token required.' })
@ApiForbiddenResponse({ description: 'Only active SUPER_ADMIN accounts may manage Admin accounts.' })
@ApiBadRequestResponse({ description: 'Invalid fields, weak password or unsupported role.' })
@UseGuards(CognitoGuard, SuperAdminGuard)
@Controller('super-admin/accounts')
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}
  @Post()
  @ApiOperation({ summary: 'Create an Admin without fresh MFA, or a Super Admin with a single-use MFA grant and mandatory first-login setup' })
  @ApiCreatedResponse({ schema: accountEnvelope })
  @ApiConflictResponse({ description: 'Email or username already exists.' })
  create(@Body() input: CreateAdminDto, @Req() request: AuthenticatedRequest) { return this.accounts.create(input, request.user.id); }
  @Get()
  @ApiOperation({ summary: 'List, search, filter, sort and paginate Admin and Super Admin accounts' })
  @ApiOkResponse({ schema: { type: 'object', properties: { items: { type: 'array', items: { $ref: getSchemaPath(AdminAccountDto) } }, total: { type: 'integer' }, page: { type: 'integer' }, pageSize: { type: 'integer' } } } })
  list(@Query() query: AccountQueryDto) { return this.accounts.list(query); }
  @Get(':id')
  @ApiOperation({ summary: 'Retrieve an Admin account by UUID' })
  @ApiOkResponse({ schema: accountEnvelope })
  @ApiNotFoundResponse({ description: 'Admin account not found.' })
  detail(@Param('id', ParseUUIDPipe) id: string) { return this.accounts.detail(id); }
  @Post(':id/password-reset')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Set an Admin password using the current authenticated Super Admin session; preserve status and revoke old sessions' })
  resetAdminPassword(@Param('id', ParseUUIDPipe) id: string, @Body() input: AdminPasswordResetDto, @Req() request: AuthenticatedRequest) { return this.accounts.resetAdminPassword(id, input.password, input.confirmPassword, request.user.id); }
  @Post(':id/password-reset-link')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Generate a one-time 30-minute reset link after operation-bound fresh MFA' })
  resetLink(@Param('id', ParseUUIDPipe) id: string, @Body() input: StepUpProofDto, @Req() request: AuthenticatedRequest) { return this.accounts.resetLink(id, input.stepUpProof, request.user.id); }
  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete an Admin, remove its Cognito identity and preserve business/audit records' })
  remove(@Param('id', ParseUUIDPipe) id: string, @Req() request: AuthenticatedRequest) { return this.accounts.remove(id, request.user.id); }
  @Patch(':id/state')
  @ApiOperation({ summary: 'Enable or disable both ERP access and the linked Cognito identity' })
  @ApiOkResponse({ schema: accountEnvelope })
  @ApiNotFoundResponse({ description: 'Admin account not found.' })
  state(@Param('id', ParseUUIDPipe) id: string, @Body() input: AccountStateDto, @Req() request: AuthenticatedRequest) { return this.accounts.setState(id, input.state, request.user.id); }
}

@ApiTags('Account MFA') @ApiBearerAuth()
@UseGuards(CognitoGuard, SuperAdminGuard)
@Controller('auth/step-up')
export class StepUpController {
  constructor(private readonly stepUp: StepUpService) {}
  @Post('challenge') @Throttle({ default: { limit: 5, ttl: 60000 } })
  challenge(@Body() input: StepUpChallengeDto, @Req() request: AuthenticatedRequest) { return this.stepUp.challenge(input, request.user); }
  @Post('verify') @Throttle({ default: { limit: 10, ttl: 60000 } })
  verify(@Body() input: StepUpVerifyDto, @Req() request: AuthenticatedRequest) { return this.stepUp.verify(input, request.user); }
}

@ApiTags('Password reset') @Controller('auth/password-reset')
export class PasswordResetController {
  constructor(private readonly accounts: AccountsService) {}
  @Post('validate') @Throttle({ default: { limit: 10, ttl: 60000 } })
  validate(@Body() input: ResetTokenDto) { return this.accounts.validateReset(input.token); }
  @Post('complete') @Throttle({ default: { limit: 5, ttl: 60000 } })
  complete(@Body() input: CompleteResetDto) { return this.accounts.completeReset(input.token, input.password, input.confirmPassword); }
}

@Module({ imports: [DatabaseModule, AuthModule, ConfigModule], controllers: [CurrentAccountController, AccountsController, StepUpController, PasswordResetController], providers: [CurrentAccountService, AccountsService, CognitoAccountsService, StepUpService] })
export class AccountsModule {}
