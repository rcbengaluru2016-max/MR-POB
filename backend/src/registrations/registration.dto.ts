import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Equals, IsEmail, IsEnum, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength, registerDecorator, ValidationArguments } from 'class-validator';
import { RegistrationKind, RegistrationStatus } from '@prisma/client';

export const CUSTOMER_TYPES = ['Retail Pharmacy', 'Hospital', 'Clinic'];
export const CREDIT_DAYS = ['same_day_3', 'week_2', 'days_30_none', 'days_60_special'];
const PAYMENT_METHODS = ['UPI', 'Debit Card', 'Credit Card', 'Net Banking', 'Bank Transfer', 'Wallet', 'Cheque', 'Other'];
export const CUSTOMER_PAYMENTS = ['Cash on Delivery (COD)', ...PAYMENT_METHODS];
export const PATIENT_PAYMENTS = ['Cash on Delivery', ...PAYMENT_METHODS];
const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;
const optionalText = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() || undefined : value;

function MatchesPassword() {
  return (target: object, propertyName: string) => registerDecorator({
    name: 'matchesPassword', target: target.constructor, propertyName,
    options: { message: 'Passwords do not match' },
    validator: { validate: (value: unknown, args: ValidationArguments) => value === (args.object as BaseRegistrationDto).password },
  });
}

export class BaseRegistrationDto {
  @ApiProperty({ minLength: 8, maxLength: 256, format: 'password', writeOnly: true, description: 'Validated then discarded. Account activation sets a new Cognito password.' })
  @IsString() @MinLength(8) @MaxLength(256) @Matches(/^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)[\s\S]+$/, { message: 'Password must contain uppercase, lowercase and a number' })
  password!: string;

  @ApiProperty({ format: 'password', writeOnly: true })
  @IsString() @MaxLength(256) @MatchesPassword()
  confirmPassword!: string;

  @ApiProperty({ type: Boolean, enum: [true], description: 'Multipart value must be the string true.' })
  @Transform(({ value }) => value === 'true' ? true : value)
  @Equals(true, { message: 'You must accept the Terms & Conditions' })
  termsAccepted!: boolean;
}

export class CustomerRegistrationDto extends BaseRegistrationDto {
  @ApiProperty({ minLength: 2, maxLength: 200 }) @Transform(trim) @IsString() @MinLength(2) @MaxLength(200) customerName!: string;
  @ApiProperty({ pattern: '^[6-9][0-9]{9}$' }) @Transform(trim) @IsString() @Matches(/^[6-9]\d{9}$/) mobile!: string;
  @ApiPropertyOptional({ format: 'email' }) @Transform(optionalText) @IsOptional() @IsEmail() @MaxLength(254) email?: string;
  @ApiProperty({ minLength: 2, maxLength: 200 }) @Transform(trim) @IsString() @MinLength(2) @MaxLength(200) businessName!: string;
  @ApiProperty({ enum: CUSTOMER_TYPES }) @IsIn(CUSTOMER_TYPES) customerType!: string;
  @ApiProperty({ minLength: 3, maxLength: 500 }) @Transform(trim) @IsString() @MinLength(3) @MaxLength(500) addressLine1!: string;
  @ApiPropertyOptional({ maxLength: 500 }) @Transform(optionalText) @IsOptional() @IsString() @MaxLength(500) addressLine2?: string;
  @ApiPropertyOptional({ maxLength: 500 }) @Transform(optionalText) @IsOptional() @IsString() @MaxLength(500) addressLine3?: string;
  @ApiPropertyOptional({ maxLength: 500 }) @Transform(optionalText) @IsOptional() @IsString() @MaxLength(500) addressLine4?: string;
  @ApiProperty({ pattern: '^[0-9]{6}$' }) @Transform(trim) @IsString() @Matches(/^\d{6}$/) pinCode!: string;
  @ApiProperty({ minLength: 3, maxLength: 100 }) @Transform(trim) @IsString() @MinLength(3) @MaxLength(100) dlNumber1!: string;
  @ApiProperty({ minLength: 3, maxLength: 100 }) @Transform(trim) @IsString() @MinLength(3) @MaxLength(100) dlNumber2!: string;
  @ApiPropertyOptional({ maxLength: 100 }) @Transform(optionalText) @IsOptional() @IsString() @MaxLength(100) dlNumber3?: string;
  @ApiPropertyOptional({ maxLength: 100 }) @Transform(optionalText) @IsOptional() @IsString() @MaxLength(100) fssaiNumber?: string;
  @ApiProperty({ minLength: 1, maxLength: 100 }) @Transform(trim) @IsString() @MinLength(1) @MaxLength(100) gstNumber!: string;
  @ApiProperty({ enum: CREDIT_DAYS }) @IsIn(CREDIT_DAYS) creditDays!: string;
  @ApiProperty({ enum: CUSTOMER_PAYMENTS }) @IsIn(CUSTOMER_PAYMENTS) paymentMethod!: string;
}

export class CompanyRegistrationDto extends BaseRegistrationDto {
  @ApiProperty({ minLength: 2, maxLength: 200 }) @Transform(trim) @IsString() @MinLength(2) @MaxLength(200) companyName!: string;
  @ApiProperty({ minLength: 1, maxLength: 200 }) @Transform(trim) @IsString() @MinLength(1) @MaxLength(200) division!: string;
  @ApiProperty({ minLength: 2, maxLength: 200 }) @Transform(trim) @IsString() @MinLength(2) @MaxLength(200) headquarter!: string;
  @ApiProperty({ minLength: 2, maxLength: 200 }) @Transform(trim) @IsString() @MinLength(2) @MaxLength(200) adminFullName!: string;
  @ApiProperty({ format: 'email' }) @Transform(trim) @IsEmail() @MaxLength(254) adminEmail!: string;
  @ApiProperty({ pattern: '^[6-9][0-9]{9}$' }) @Transform(trim) @IsString() @Matches(/^[6-9]\d{9}$/) adminMobile!: string;
}

export class PatientRegistrationDto extends BaseRegistrationDto {
  @ApiProperty({ minLength: 2, maxLength: 200 }) @Transform(trim) @IsString() @MinLength(2) @MaxLength(200) patientName!: string;
  @ApiProperty({ pattern: '^[6-9][0-9]{9}$' }) @Transform(trim) @IsString() @Matches(/^[6-9]\d{9}$/) mobile!: string;
  @ApiPropertyOptional({ format: 'email' }) @Transform(optionalText) @IsOptional() @IsEmail() @MaxLength(254) email?: string;
  @ApiPropertyOptional({ enum: ['Female', 'Male', 'Other', 'Prefer not to say'] }) @Transform(optionalText) @IsOptional() @IsIn(['Female', 'Male', 'Other', 'Prefer not to say']) gender?: string;
  @ApiProperty({ minLength: 8, maxLength: 2000 }) @Transform(trim) @IsString() @MinLength(8) @MaxLength(2000) address!: string;
  @ApiProperty({ enum: PATIENT_PAYMENTS }) @IsIn(PATIENT_PAYMENTS) paymentMethod!: string;
}

export class RegistrationQueryDto {
  @ApiProperty({ enum: RegistrationKind }) @IsEnum(RegistrationKind) kind!: RegistrationKind;
  @ApiPropertyOptional({ enum: RegistrationStatus }) @IsOptional() @IsEnum(RegistrationStatus) status?: RegistrationStatus;
  @ApiPropertyOptional({ default: 1, minimum: 1 }) @Type(() => Number) @IsInt() @Min(1) @Max(100000) page = 1;
  @ApiPropertyOptional({ default: 25, minimum: 1, maximum: 100 }) @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 25;
}

export class SummaryQueryDto {
  @ApiProperty({ enum: RegistrationKind }) @IsEnum(RegistrationKind) kind!: RegistrationKind;
}

export class SubmissionResponseDto {
  @ApiProperty({ example: 'REG-CUS-a21ed864-6b44-4632-9251-2d7ad50bd290' }) registrationId!: string;
  @ApiProperty({ enum: RegistrationStatus, example: 'PENDING' }) status!: RegistrationStatus;
}

export class SummaryResponseDto {
  @ApiProperty() pending!: number;
  @ApiProperty() approved!: number;
  @ApiProperty() rejected!: number;
}

export type RegistrationInput = CustomerRegistrationDto | CompanyRegistrationDto | PatientRegistrationDto;
