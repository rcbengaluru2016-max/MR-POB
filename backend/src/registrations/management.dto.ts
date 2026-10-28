import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AnalyticsQueryDto {
  @ApiPropertyOptional({ enum: ['daily', 'weekly', 'monthly', 'custom'], default: 'monthly' })
  @IsIn(['daily', 'weekly', 'monthly', 'custom']) period: 'daily' | 'weekly' | 'monthly' | 'custom' = 'monthly';
  @ApiPropertyOptional({ format: 'date', description: 'Required for custom period; UTC inclusive, at most 180 days.' })
  @IsOptional() @IsString() @MaxLength(10) start?: string;
  @ApiPropertyOptional({ format: 'date' }) @IsOptional() @IsString() @MaxLength(10) end?: string;
}

export class RegistrationDecisionDto {
  @ApiProperty({ enum: ['approve', 'reject'] }) @IsIn(['approve', 'reject']) action!: 'approve' | 'reject';
  @ApiPropertyOptional({ description: 'Structured rejection code; required for reject.' })
  @IsOptional() @IsString() @MaxLength(50) reasonCode?: string;
  @ApiPropertyOptional({ description: 'Administrator reviewed custom reason for external communication.' })
  @IsOptional() @IsBoolean() reasonReviewed?: boolean;
  @ApiPropertyOptional({ minLength: 8, maxLength: 500, description: 'Custom externally reviewed reason; required for OTHER.' })
  @ValidateIf(input => input.reason !== undefined)
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @MinLength(8) @MaxLength(2000) reason?: string;
}
