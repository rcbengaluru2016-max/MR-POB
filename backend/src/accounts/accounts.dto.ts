import { Transform, Type } from 'class-transformer';
import { IsEmail, IsIn, IsInt, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
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

  @ApiProperty({ enum: ['ADMIN'] }) @IsIn(['ADMIN']) role!: 'ADMIN';

  @ApiPropertyOptional({ enum: ['ACTIVE', 'INACTIVE'], default: 'INACTIVE' })
  @IsIn(['ACTIVE', 'INACTIVE']) state: 'ACTIVE' | 'INACTIVE' = 'INACTIVE';
}

export class AccountQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 }) @Type(() => Number) @IsInt() @Min(1) @Max(100000) page = 1;
  @ApiPropertyOptional({ default: 25, minimum: 1, maximum: 100 }) @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 25;
}

export class AccountStateDto {
  @ApiProperty({ enum: ['ACTIVE', 'INACTIVE'] }) @IsIn(['ACTIVE', 'INACTIVE']) state!: 'ACTIVE' | 'INACTIVE';
}

export class AdminAccountDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() username!: string;
  @ApiProperty({ type: String, nullable: true }) email!: string | null;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: ['ADMIN'] }) role!: string;
  @ApiProperty({ enum: ['ACTIVE', 'INACTIVE'] }) state!: string;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) createdById!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ format: 'date-time' }) updatedAt!: Date;
  @ApiProperty({ description: 'True until a Cognito identity has been linked; use the password endpoint to complete setup.' }) provisioningRequired!: boolean;
}
