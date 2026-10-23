import { Body, Controller, Get, Module, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiConflictResponse, ApiCreatedResponse, ApiForbiddenResponse, ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse, ApiBadRequestResponse, ApiNotFoundResponse, ApiExtraModels, getSchemaPath } from '@nestjs/swagger';
import { AuthModule } from '../auth/auth.module';
import { AuthenticatedRequest, CognitoGuard, SuperAdminGuard } from '../auth/auth.guard';
import { DatabaseModule } from '../database/prisma.service';
import { AccountsService } from './accounts.service';
import { AccountPasswordDto, AccountQueryDto, AccountStateDto, AdminAccountDto, CreateAdminDto } from './accounts.dto';
import { CognitoAccountsService } from './cognito-accounts.service';
import { ConfigModule } from '../config/config.service';

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
  @ApiOperation({ summary: 'Create an ADMIN account and its Cognito login credentials' })
  @ApiCreatedResponse({ schema: accountEnvelope })
  @ApiConflictResponse({ description: 'Email or username already exists.' })
  create(@Body() input: CreateAdminDto, @Req() request: AuthenticatedRequest) { return this.accounts.create(input, request.user.id); }
  @Get()
  @ApiOperation({ summary: 'List Admin accounts (Super Admin only)' })
  @ApiOkResponse({ schema: { type: 'object', properties: { items: { type: 'array', items: { $ref: getSchemaPath(AdminAccountDto) } }, total: { type: 'integer' }, page: { type: 'integer' }, pageSize: { type: 'integer' } } } })
  list(@Query() query: AccountQueryDto) { return this.accounts.list(query); }
  @Get(':id')
  @ApiOperation({ summary: 'Retrieve an Admin account by UUID' })
  @ApiOkResponse({ schema: accountEnvelope })
  @ApiNotFoundResponse({ description: 'Admin account not found.' })
  detail(@Param('id', ParseUUIDPipe) id: string) { return this.accounts.detail(id); }
  @Post(':id/password')
  @ApiOperation({ summary: 'Set an Admin password, or finish/retry identity setup for an existing account' })
  @ApiOkResponse({ schema: accountEnvelope })
  password(@Param('id', ParseUUIDPipe) id: string, @Body() input: AccountPasswordDto, @Req() request: AuthenticatedRequest) { return this.accounts.setPassword(id, input.password, request.user.id); }
  @Patch(':id/state')
  @ApiOperation({ summary: 'Enable or disable both ERP access and the linked Cognito identity' })
  @ApiOkResponse({ schema: accountEnvelope })
  @ApiNotFoundResponse({ description: 'Admin account not found.' })
  state(@Param('id', ParseUUIDPipe) id: string, @Body() input: AccountStateDto, @Req() request: AuthenticatedRequest) { return this.accounts.setState(id, input.state, request.user.id); }
}

@Module({ imports: [DatabaseModule, AuthModule, ConfigModule], controllers: [AccountsController], providers: [AccountsService, CognitoAccountsService] })
export class AccountsModule {}
