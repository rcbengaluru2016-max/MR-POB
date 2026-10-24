import { RegistrationKind, RegistrationStatus } from '@prisma/client';
export declare const CUSTOMER_TYPES: string[];
export declare const CREDIT_DAYS: string[];
export declare const CUSTOMER_PAYMENTS: string[];
export declare const PATIENT_PAYMENTS: string[];
export declare class BaseRegistrationDto {
    password: string;
    confirmPassword: string;
    termsAccepted: boolean;
}
export declare class CustomerRegistrationDto extends BaseRegistrationDto {
    customerName: string;
    mobile: string;
    email?: string;
    businessName: string;
    customerType: string;
    addressLine1: string;
    addressLine2?: string;
    addressLine3?: string;
    addressLine4?: string;
    pinCode: string;
    dlNumber1: string;
    dlNumber2: string;
    dlNumber3?: string;
    fssaiNumber?: string;
    gstNumber: string;
    creditDays: string;
    paymentMethod: string;
}
export declare class CompanyRegistrationDto extends BaseRegistrationDto {
    companyName: string;
    division: string;
    headquarter: string;
    adminFullName: string;
    adminEmail: string;
    adminMobile: string;
}
export declare class PatientRegistrationDto extends BaseRegistrationDto {
    patientName: string;
    mobile: string;
    email?: string;
    gender?: string;
    address: string;
    paymentMethod: string;
}
export declare class RegistrationQueryDto {
    kind: RegistrationKind;
    status?: RegistrationStatus;
    page: number;
    pageSize: number;
}
export declare class SummaryQueryDto {
    kind: RegistrationKind;
}
export declare class SubmissionResponseDto {
    registrationId: string;
    status: RegistrationStatus;
}
export declare class SummaryResponseDto {
    pending: number;
    approved: number;
    rejected: number;
}
export type RegistrationInput = CustomerRegistrationDto | CompanyRegistrationDto | PatientRegistrationDto;
