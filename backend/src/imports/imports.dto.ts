import { Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { ImportStatus, RegistrationKind } from '@prisma/client';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ImportQueryDto {
  @ApiPropertyOptional({ enum: RegistrationKind }) @IsOptional() @IsEnum(RegistrationKind) kind?: RegistrationKind;
  @ApiPropertyOptional({ enum: ImportStatus }) @IsOptional() @IsEnum(ImportStatus) status?: ImportStatus;
  @ApiPropertyOptional({ default: 1 }) @Type(() => Number) @IsInt() @Min(1) @Max(100000) page = 1;
  @ApiPropertyOptional({ default: 25 }) @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 25;
  @ApiPropertyOptional({ enum: ['asc', 'desc'] }) @IsIn(['asc', 'desc']) order: 'asc' | 'desc' = 'desc';
}
