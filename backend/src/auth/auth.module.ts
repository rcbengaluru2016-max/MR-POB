import { Module, Controller, Post, Body, Get, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiTags, ApiResponse } from '@nestjs/swagger';
import { IsIn, IsString, Length, Matches, MaxLength, MinLength } from 'class-validator';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { CognitoGuard, AdminGuard, SuperAdminGuard, AuthenticatedRequest } from './auth.guard';
import { DatabaseModule } from '../database/prisma.service';
import { ConfigModule } from '../config/config.service';

class LoginDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(254) username!: string;
  @ApiProperty({ format: 'password' }) @IsString() @MinLength(1) @MaxLength(256) password!: string;
}
class ChallengeDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(254) username!: string;
  @ApiProperty() @IsString() @Length(1, 4096) session!: string;
  @ApiProperty({ enum: ['SOFTWARE_TOKEN_MFA', 'SMS_MFA', 'MFA_SETUP'] }) @IsIn(['SOFTWARE_TOKEN_MFA', 'SMS_MFA', 'MFA_SETUP']) challengeName!: 'SOFTWARE_TOKEN_MFA' | 'SMS_MFA' | 'MFA_SETUP';
  @ApiProperty() @Matches(/^\d{6}$/) code!: string;
}

@ApiTags('Authentication')
@Controller('auth')
class AuthController {
  constructor(private readonly auth: AuthService) {}
  @Post('login') @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Authenticate an existing Cognito account; does not create or activate ERP accounts' })
  @ApiResponse({ status: 201, description: 'Access token and ERP user, or MFA challenge/session/username' })
  login(@Body() body: LoginDto) { return this.auth.login(body.username, body.password); }
  @Post('challenge') @Throttle({ default: { limit: 10, ttl: 60000 } })
  challenge(@Body() body: ChallengeDto) { return this.auth.challenge(body); }
  @Get('me') @UseGuards(CognitoGuard) @ApiBearerAuth()
  me(@Req() request: AuthenticatedRequest) { return { user: this.auth.session(request.user) }; }
  @Post('logout') @UseGuards(CognitoGuard) @ApiBearerAuth()
  async logout(@Req() request: AuthenticatedRequest) { await this.auth.logout(request.headers.authorization!.slice(7)); return { success: true }; }
}

@Module({ imports: [DatabaseModule, ConfigModule], controllers: [AuthController], providers: [AuthService, CognitoGuard, AdminGuard, SuperAdminGuard], exports: [AuthService, CognitoGuard, AdminGuard, SuperAdminGuard] })
export class AuthModule {}
