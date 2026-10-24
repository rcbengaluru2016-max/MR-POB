import { AuthenticatedRequest } from '../auth/auth.guard';
import { CompanyRegistrationDto, CustomerRegistrationDto, PatientRegistrationDto, RegistrationQueryDto, SummaryQueryDto } from './registration.dto';
import { RegistrationsService } from './registrations.service';
import { AnalyticsService } from './analytics.service';
import { AnalyticsQueryDto, RegistrationDecisionDto } from './management.dto';
export declare class RegistrationsController {
    private readonly registrations;
    constructor(registrations: RegistrationsService);
    customer(input: CustomerRegistrationDto, files: Express.Multer.File[], key?: string): Promise<{
        registrationId: string;
        status: import(".prisma/client").$Enums.RegistrationStatus;
    }>;
    company(input: CompanyRegistrationDto, files: Express.Multer.File[], key?: string): Promise<{
        registrationId: string;
        status: import(".prisma/client").$Enums.RegistrationStatus;
    }>;
    patient(input: PatientRegistrationDto, files: Express.Multer.File[], key?: string): Promise<{
        registrationId: string;
        status: import(".prisma/client").$Enums.RegistrationStatus;
    }>;
}
export declare class OwnedRegistrationsController {
    private readonly registrations;
    constructor(registrations: RegistrationsService);
    mine(request: AuthenticatedRequest): Promise<{
        items: ({
            readOnly: boolean;
            activationPending: boolean;
            id: string;
            kind: import(".prisma/client").$Enums.RegistrationKind;
            status: import(".prisma/client").$Enums.RegistrationStatus;
            submittedAt: Date;
            mobile: string;
            email: string | null;
            termsAcceptedAt: Date;
            termsVersion: string;
            decidedAt: Date | null;
            decidedById: string | null;
            rejectionReason: string | null;
            files: {
                [k: string]: {
                    id: string;
                    name: string;
                    type: string;
                    size: number;
                    sha256: string;
                    accessPath: string;
                };
            };
            addressLine1: string;
            addressLine2: string | null;
            addressLine3: string | null;
            addressLine4: string | null;
            pinCode: string;
            address: string;
        } | {
            readOnly: boolean;
            activationPending: boolean;
            id: string;
            kind: import(".prisma/client").$Enums.RegistrationKind;
            status: import(".prisma/client").$Enums.RegistrationStatus;
            submittedAt: Date;
            mobile: string;
            email: string | null;
            termsAcceptedAt: Date;
            termsVersion: string;
            decidedAt: Date | null;
            decidedById: string | null;
            rejectionReason: string | null;
            files: {
                [k: string]: {
                    id: string;
                    name: string;
                    type: string;
                    size: number;
                    sha256: string;
                    accessPath: string;
                };
            };
            addressLine1?: undefined;
            addressLine2?: undefined;
            addressLine3?: undefined;
            addressLine4?: undefined;
            pinCode?: undefined;
            address?: undefined;
        } | {
            readOnly: boolean;
            activationPending: boolean;
            id: string;
            kind: import(".prisma/client").$Enums.RegistrationKind;
            status: import(".prisma/client").$Enums.RegistrationStatus;
            submittedAt: Date;
            mobile: string;
            email: string | null;
            termsAcceptedAt: Date;
            termsVersion: string;
            decidedAt: Date | null;
            decidedById: string | null;
            rejectionReason: string | null;
            files: {
                [k: string]: {
                    id: string;
                    name: string;
                    type: string;
                    size: number;
                    sha256: string;
                    accessPath: string;
                };
            };
            addressLine1: string;
            addressLine2: string | null;
            addressLine3: string | null;
            addressLine4: string | null;
            pinCode: string;
            address: string;
            companyName: string;
            division: string;
            headquarter: string;
            adminFullName: string;
        } | {
            readOnly: boolean;
            activationPending: boolean;
            id: string;
            kind: import(".prisma/client").$Enums.RegistrationKind;
            status: import(".prisma/client").$Enums.RegistrationStatus;
            submittedAt: Date;
            mobile: string;
            email: string | null;
            termsAcceptedAt: Date;
            termsVersion: string;
            decidedAt: Date | null;
            decidedById: string | null;
            rejectionReason: string | null;
            files: {
                [k: string]: {
                    id: string;
                    name: string;
                    type: string;
                    size: number;
                    sha256: string;
                    accessPath: string;
                };
            };
            addressLine1?: undefined;
            addressLine2?: undefined;
            addressLine3?: undefined;
            addressLine4?: undefined;
            pinCode?: undefined;
            address?: undefined;
            companyName: string;
            division: string;
            headquarter: string;
            adminFullName: string;
        } | {
            readOnly: boolean;
            activationPending: boolean;
            id: string;
            kind: import(".prisma/client").$Enums.RegistrationKind;
            status: import(".prisma/client").$Enums.RegistrationStatus;
            submittedAt: Date;
            mobile: string;
            email: string | null;
            termsAcceptedAt: Date;
            termsVersion: string;
            decidedAt: Date | null;
            decidedById: string | null;
            rejectionReason: string | null;
            files: {
                [k: string]: {
                    id: string;
                    name: string;
                    type: string;
                    size: number;
                    sha256: string;
                    accessPath: string;
                };
            };
            addressLine1: string;
            addressLine2: string | null;
            addressLine3: string | null;
            addressLine4: string | null;
            pinCode: string;
            address: string;
            paymentMethod: string;
            patientName: string;
            gender: string | null;
        } | {
            readOnly: boolean;
            activationPending: boolean;
            id: string;
            kind: import(".prisma/client").$Enums.RegistrationKind;
            status: import(".prisma/client").$Enums.RegistrationStatus;
            submittedAt: Date;
            mobile: string;
            email: string | null;
            termsAcceptedAt: Date;
            termsVersion: string;
            decidedAt: Date | null;
            decidedById: string | null;
            rejectionReason: string | null;
            files: {
                [k: string]: {
                    id: string;
                    name: string;
                    type: string;
                    size: number;
                    sha256: string;
                    accessPath: string;
                };
            };
            addressLine1?: undefined;
            addressLine2?: undefined;
            addressLine3?: undefined;
            addressLine4?: undefined;
            pinCode?: undefined;
            address: string;
            paymentMethod: string;
            patientName: string;
            gender: string | null;
        } | {
            readOnly: boolean;
            activationPending: boolean;
            id: string;
            kind: import(".prisma/client").$Enums.RegistrationKind;
            status: import(".prisma/client").$Enums.RegistrationStatus;
            submittedAt: Date;
            mobile: string;
            email: string | null;
            termsAcceptedAt: Date;
            termsVersion: string;
            decidedAt: Date | null;
            decidedById: string | null;
            rejectionReason: string | null;
            files: {
                [k: string]: {
                    id: string;
                    name: string;
                    type: string;
                    size: number;
                    sha256: string;
                    accessPath: string;
                };
            };
            addressLine1: string;
            addressLine2: string | null;
            addressLine3: string | null;
            addressLine4: string | null;
            pinCode: string;
            address: string;
            customerName: string;
            businessName: string;
            customerType: string;
            dlNumber1: string;
            dlNumber2: string;
            dlNumber3: string | null;
            fssaiNumber: string | null;
            gstNumber: string;
            creditDays: string;
            paymentMethod: string;
        } | {
            readOnly: boolean;
            activationPending: boolean;
            id: string;
            kind: import(".prisma/client").$Enums.RegistrationKind;
            status: import(".prisma/client").$Enums.RegistrationStatus;
            submittedAt: Date;
            mobile: string;
            email: string | null;
            termsAcceptedAt: Date;
            termsVersion: string;
            decidedAt: Date | null;
            decidedById: string | null;
            rejectionReason: string | null;
            files: {
                [k: string]: {
                    id: string;
                    name: string;
                    type: string;
                    size: number;
                    sha256: string;
                    accessPath: string;
                };
            };
            addressLine1?: undefined;
            addressLine2?: undefined;
            addressLine3?: undefined;
            addressLine4?: undefined;
            pinCode?: undefined;
            address: {
                registrationId: string;
                addressLine1: string;
                addressLine2: string | null;
                addressLine3: string | null;
                addressLine4: string | null;
                pinCode: string;
            } | null;
            customerName: string;
            businessName: string;
            customerType: string;
            dlNumber1: string;
            dlNumber2: string;
            dlNumber3: string | null;
            fssaiNumber: string | null;
            gstNumber: string;
            creditDays: string;
            paymentMethod: string;
        })[];
    }>;
}
export declare class AdminRegistrationsController {
    private readonly registrations;
    private readonly analytics;
    constructor(registrations: RegistrationsService, analytics: AnalyticsService);
    dashboard(query: AnalyticsQueryDto): Promise<{
        period: "daily" | "weekly" | "monthly" | "custom";
        range: {
            start: string;
            end: string;
        };
        kpis: {
            [k: string]: {
                value: number;
                change: number;
            };
        };
        byKind: Record<import(".prisma/client").$Enums.RegistrationKind, Record<string, number>>;
        categoryShare: {
            customer: number;
            company: number;
            patient: number;
        };
        statusShare: {
            pending_verification: number;
            approved: number;
            rejected: number;
        };
        trend: {
            date: string;
            count: number;
        }[];
        recent: {
            id: string;
            kind: import(".prisma/client").$Enums.RegistrationKind;
            status: "approved" | "rejected" | "pending_verification";
            submittedAt: Date;
            name: string;
            email: string;
        }[];
    }>;
    list(query: RegistrationQueryDto): Promise<{
        items: {
            id: string;
            kind: import(".prisma/client").$Enums.RegistrationKind;
            status: import(".prisma/client").$Enums.RegistrationStatus;
            submittedAt: Date;
            mobile: string;
            email: string;
            accountStatus: string;
            name: string;
            businessType: string;
        }[];
        total: number;
        page: number;
        pageSize: number;
    }>;
    summary(query: SummaryQueryDto): Promise<{
        pending: number;
        approved: number;
        rejected: number;
    }>;
    approved(query: RegistrationQueryDto): Promise<{
        items: {
            id: string;
            kind: import(".prisma/client").$Enums.RegistrationKind;
            status: import(".prisma/client").$Enums.RegistrationStatus;
            submittedAt: Date;
            mobile: string;
            email: string;
            accountStatus: string;
            name: string;
            businessType: string;
        }[];
        total: number;
        page: number;
        pageSize: number;
    }>;
    detail(id: string): Promise<{
        record: {
            id: string;
            kind: import(".prisma/client").$Enums.RegistrationKind;
            status: import(".prisma/client").$Enums.RegistrationStatus;
            submittedAt: Date;
            mobile: string;
            email: string | null;
            termsAcceptedAt: Date;
            termsVersion: string;
            decidedAt: Date | null;
            decidedById: string | null;
            rejectionReason: string | null;
            readOnly: boolean;
            activationPending: boolean;
            files: {
                [k: string]: {
                    id: string;
                    name: string;
                    type: string;
                    size: number;
                    sha256: string;
                    accessPath: string;
                };
            };
            addressLine1: string;
            addressLine2: string | null;
            addressLine3: string | null;
            addressLine4: string | null;
            pinCode: string;
            address: string;
        } | {
            id: string;
            kind: import(".prisma/client").$Enums.RegistrationKind;
            status: import(".prisma/client").$Enums.RegistrationStatus;
            submittedAt: Date;
            mobile: string;
            email: string | null;
            termsAcceptedAt: Date;
            termsVersion: string;
            decidedAt: Date | null;
            decidedById: string | null;
            rejectionReason: string | null;
            readOnly: boolean;
            activationPending: boolean;
            files: {
                [k: string]: {
                    id: string;
                    name: string;
                    type: string;
                    size: number;
                    sha256: string;
                    accessPath: string;
                };
            };
            addressLine1?: undefined;
            addressLine2?: undefined;
            addressLine3?: undefined;
            addressLine4?: undefined;
            pinCode?: undefined;
            address?: undefined;
        } | {
            id: string;
            kind: import(".prisma/client").$Enums.RegistrationKind;
            status: import(".prisma/client").$Enums.RegistrationStatus;
            submittedAt: Date;
            mobile: string;
            email: string | null;
            termsAcceptedAt: Date;
            termsVersion: string;
            decidedAt: Date | null;
            decidedById: string | null;
            rejectionReason: string | null;
            readOnly: boolean;
            activationPending: boolean;
            files: {
                [k: string]: {
                    id: string;
                    name: string;
                    type: string;
                    size: number;
                    sha256: string;
                    accessPath: string;
                };
            };
            addressLine1: string;
            addressLine2: string | null;
            addressLine3: string | null;
            addressLine4: string | null;
            pinCode: string;
            address: string;
            companyName: string;
            division: string;
            headquarter: string;
            adminFullName: string;
        } | {
            id: string;
            kind: import(".prisma/client").$Enums.RegistrationKind;
            status: import(".prisma/client").$Enums.RegistrationStatus;
            submittedAt: Date;
            mobile: string;
            email: string | null;
            termsAcceptedAt: Date;
            termsVersion: string;
            decidedAt: Date | null;
            decidedById: string | null;
            rejectionReason: string | null;
            readOnly: boolean;
            activationPending: boolean;
            files: {
                [k: string]: {
                    id: string;
                    name: string;
                    type: string;
                    size: number;
                    sha256: string;
                    accessPath: string;
                };
            };
            addressLine1?: undefined;
            addressLine2?: undefined;
            addressLine3?: undefined;
            addressLine4?: undefined;
            pinCode?: undefined;
            address?: undefined;
            companyName: string;
            division: string;
            headquarter: string;
            adminFullName: string;
        } | {
            id: string;
            kind: import(".prisma/client").$Enums.RegistrationKind;
            status: import(".prisma/client").$Enums.RegistrationStatus;
            submittedAt: Date;
            mobile: string;
            email: string | null;
            termsAcceptedAt: Date;
            termsVersion: string;
            decidedAt: Date | null;
            decidedById: string | null;
            rejectionReason: string | null;
            readOnly: boolean;
            activationPending: boolean;
            files: {
                [k: string]: {
                    id: string;
                    name: string;
                    type: string;
                    size: number;
                    sha256: string;
                    accessPath: string;
                };
            };
            addressLine1: string;
            addressLine2: string | null;
            addressLine3: string | null;
            addressLine4: string | null;
            pinCode: string;
            address: string;
            paymentMethod: string;
            patientName: string;
            gender: string | null;
        } | {
            id: string;
            kind: import(".prisma/client").$Enums.RegistrationKind;
            status: import(".prisma/client").$Enums.RegistrationStatus;
            submittedAt: Date;
            mobile: string;
            email: string | null;
            termsAcceptedAt: Date;
            termsVersion: string;
            decidedAt: Date | null;
            decidedById: string | null;
            rejectionReason: string | null;
            readOnly: boolean;
            activationPending: boolean;
            files: {
                [k: string]: {
                    id: string;
                    name: string;
                    type: string;
                    size: number;
                    sha256: string;
                    accessPath: string;
                };
            };
            addressLine1?: undefined;
            addressLine2?: undefined;
            addressLine3?: undefined;
            addressLine4?: undefined;
            pinCode?: undefined;
            address: string;
            paymentMethod: string;
            patientName: string;
            gender: string | null;
        } | {
            id: string;
            kind: import(".prisma/client").$Enums.RegistrationKind;
            status: import(".prisma/client").$Enums.RegistrationStatus;
            submittedAt: Date;
            mobile: string;
            email: string | null;
            termsAcceptedAt: Date;
            termsVersion: string;
            decidedAt: Date | null;
            decidedById: string | null;
            rejectionReason: string | null;
            readOnly: boolean;
            activationPending: boolean;
            files: {
                [k: string]: {
                    id: string;
                    name: string;
                    type: string;
                    size: number;
                    sha256: string;
                    accessPath: string;
                };
            };
            addressLine1: string;
            addressLine2: string | null;
            addressLine3: string | null;
            addressLine4: string | null;
            pinCode: string;
            address: string;
            customerName: string;
            businessName: string;
            customerType: string;
            dlNumber1: string;
            dlNumber2: string;
            dlNumber3: string | null;
            fssaiNumber: string | null;
            gstNumber: string;
            creditDays: string;
            paymentMethod: string;
        } | {
            id: string;
            kind: import(".prisma/client").$Enums.RegistrationKind;
            status: import(".prisma/client").$Enums.RegistrationStatus;
            submittedAt: Date;
            mobile: string;
            email: string | null;
            termsAcceptedAt: Date;
            termsVersion: string;
            decidedAt: Date | null;
            decidedById: string | null;
            rejectionReason: string | null;
            readOnly: boolean;
            activationPending: boolean;
            files: {
                [k: string]: {
                    id: string;
                    name: string;
                    type: string;
                    size: number;
                    sha256: string;
                    accessPath: string;
                };
            };
            addressLine1?: undefined;
            addressLine2?: undefined;
            addressLine3?: undefined;
            addressLine4?: undefined;
            pinCode?: undefined;
            address: {
                registrationId: string;
                addressLine1: string;
                addressLine2: string | null;
                addressLine3: string | null;
                addressLine4: string | null;
                pinCode: string;
            } | null;
            customerName: string;
            businessName: string;
            customerType: string;
            dlNumber1: string;
            dlNumber2: string;
            dlNumber3: string | null;
            fssaiNumber: string | null;
            gstNumber: string;
            creditDays: string;
            paymentMethod: string;
        };
    }>;
    decide(id: string, input: RegistrationDecisionDto, request: AuthenticatedRequest): Promise<{
        ok: boolean;
        status: "APPROVED" | "REJECTED";
        decidedAt: Date;
        activationPending: boolean;
    }>;
}
