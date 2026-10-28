import { Transform, Type } from 'class-transformer';
import { IsEmail, IsIn, IsInt, IsString, IsOptional, IsUUID, ValidateNested, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AccountPasswordDto {
  @ApiProperty({ format: 'password', writeOnly: true, minLength: 12, maxLength: 128, description: 'Uppercase, lowercase, digit and symbol; no whitespace. Never stored by ERP.' })
  @IsString() @MinLength(12) @MaxLength(128)
  @Matches(/^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[^A-Za-z0-9])\S+$/, { message: 'Password must contain uppercase, lowercase, a number and a symbol, without spaces' })
  password!: string;
}

export class CreateAdminDto extends AccountPasswordDto {
  @ApiProperty({ minLength: 2, maxLength: 100 })
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @MinLength(2) @MaxLength(100) name!: string;

  @ApiProperty({ format: 'email', description: 'Also used as username; normalized to lowercase.' })
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  @IsEmail() @MaxLength(254) email!: string;

  @ApiProperty({ enum: ['ADMIN', 'SUPER_ADMIN'] }) @IsIn(['ADMIN', 'SUPER_ADMIN']) role!: 'ADMIN' | 'SUPER_ADMIN';

  @ApiPropertyOptional({ enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' })
  @IsIn(['ACTIVE', 'INACTIVE']) state: 'ACTIVE' | 'INACTIVE' = 'ACTIVE';
  @ApiPropertyOptional({ writeOnly: true }) @IsOptional() @IsString() @Matches(/^[A-Za-z0-9_-]{43}$/) stepUpProof?: string;
}

export class AdminPasswordResetDto extends AccountPasswordDto {
  @ApiProperty({ format: 'password', writeOnly: true })
  @IsString() @MinLength(1) @MaxLength(128) confirmPassword!: string;
}

export class AccountQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 }) @Type(() => Number) @IsInt() @Min(1) @Max(100000) page = 1;
  @ApiPropertyOptional({ default: 25, minimum: 1, maximum: 100 }) @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 25;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(254) search?: string;
  @ApiPropertyOptional({ enum: ['ADMIN', 'SUPER_ADMIN'] }) @IsOptional() @IsIn(['ADMIN', 'SUPER_ADMIN']) role?: 'ADMIN' | 'SUPER_ADMIN';
  @ApiPropertyOptional({ enum: ['ACTIVE', 'INACTIVE'] }) @IsOptional() @IsIn(['ACTIVE', 'INACTIVE']) state?: 'ACTIVE' | 'INACTIVE';
  @ApiPropertyOptional() @IsIn(['name', 'email', 'role', 'status', 'createdAt', 'lastLoginAt']) sort = 'createdAt';
  @ApiPropertyOptional() @IsIn(['asc', 'desc']) direction: 'asc' | 'desc' = 'desc';
}

export class StepUpChallengeDto {
  @ApiProperty({ enum: ['PASSWORD_RESET', 'CREATE_SUPER_ADMIN'] }) @IsIn(['PASSWORD_RESET', 'CREATE_SUPER_ADMIN']) operation!: 'PASSWORD_RESET' | 'CREATE_SUPER_ADMIN';
  @ApiProperty({ format: 'password', writeOnly: true }) @IsString() @MinLength(1) @MaxLength(256) password!: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() targetId?: string;
  @ApiPropertyOptional({ type: CreateAdminDto }) @IsOptional() @ValidateNested() @Type(() => CreateAdminDto) account?: CreateAdminDto;
}
export class StepUpVerifyDto {
  @ApiProperty() @IsUUID() challengeId!: string;
  @ApiProperty() @Matches(/^\d{6}$/) code!: string;
}
export class StepUpProofDto {
  @ApiProperty({ writeOnly: true }) @IsString() @Matches(/^[A-Za-z0-9_-]{43}$/) stepUpProof!: string;
}
export class ResetTokenDto {
  @ApiProperty({ writeOnly: true }) @IsString() @Matches(/^[A-Za-z0-9_-]{43}$/) token!: string;
}
export class CompleteResetDto extends AccountPasswordDto {
  @ApiProperty({ writeOnly: true }) @IsString() @Matches(/^[A-Za-z0-9_-]{43}$/) token!: string;
  @ApiProperty({ format: 'password', writeOnly: true }) @IsString() @MaxLength(128) confirmPassword!: string;
}

export class AccountStateDto {
  @ApiProperty({ enum: ['ACTIVE', 'INACTIVE'] }) @IsIn(['ACTIVE', 'INACTIVE']) state!: 'ACTIVE' | 'INACTIVE';
}

export class AdminAccountDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() username!: string;
  @ApiProperty({ type: String, nullable: true }) email!: string | null;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: ['ADMIN', 'SUPER_ADMIN'] }) role!: string;
  @ApiProperty({ enum: ['ACTIVE', 'INACTIVE'] }) state!: string;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) createdById!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ format: 'date-time' }) updatedAt!: Date;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) lastLoginAt!: Date | null;
  @ApiProperty({ description: 'True until a Cognito identity has been linked; use a fresh-MFA reset link to recover setup.' }) provisioningRequired!: boolean;
}
