import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { getMetadataStorage, validate } from 'class-validator';
import { RegistrationKind } from '@prisma/client';
import { CompanyRegistrationDto, CustomerRegistrationDto, PatientRegistrationDto, RegistrationInput } from '../registrations/registration.dto';
import { documentSlots } from '../documents/documents.service';

export const registrationDtos = { customer: CustomerRegistrationDto, company: CompanyRegistrationDto, patient: PatientRegistrationDto };
export function category(value: string): RegistrationKind {
  if (!Object.hasOwn(registrationDtos, value)) throw new BadRequestException('Invalid registration category');
  return value as RegistrationKind;
}
export function columns(kind: RegistrationKind) {
  return ['masterCode', ...new Set(getMetadataStorage().getTargetValidationMetadatas(registrationDtos[kind], '', false, false).map(m => m.propertyName))]
    .filter(name => kind === 'company' || !['password', 'confirmPassword'].includes(name))
    .concat([...documentSlots[kind].required, ...documentSlots[kind].optional].map(slot => `${slot}File`));
}
export async function validateInput(kind: RegistrationKind, fields: Record<string, unknown>) {
  const { masterCode: _masterCode, ...registrationFields } = fields;
  const input = plainToInstance(registrationDtos[kind] as typeof CustomerRegistrationDto, registrationFields);
  const errors = await validate(input, { whitelist: true, forbidNonWhitelisted: true, forbidUnknownValues: true, validationError: { target: false, value: false } });
  // Report field identifiers only: validator messages must never interpolate submitted values.
  return { input: input as RegistrationInput, errors: errors.map(error => `Invalid or missing ${error.property}`) };
}
export function safeFields(input: RegistrationInput): Record<string, string | boolean> {
  const allowed = new Set(getMetadataStorage().getTargetValidationMetadatas(input.constructor, '', false, false).map(m => m.propertyName));
  return Object.fromEntries(Object.entries(input).filter(([key, value]) => allowed.has(key) && !['password', 'confirmPassword'].includes(key) && value !== undefined));
}
export function safeFilename(name: string) {
  if (!name || name.length > 200 || /[\\/:\x00-\x1f\x7f]/.test(name) || name.includes('..') || /[. ]$/.test(name)) throw new BadRequestException('Unsafe document or workbook filename');
  return name;
}

export { importedMasterCodeError as masterCodeError } from '../common/master-code';
