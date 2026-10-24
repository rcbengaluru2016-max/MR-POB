import { PrismaService } from '../database/prisma.service';
import { AnalyticsQueryDto } from './management.dto';
export declare function analyticsRange(query: AnalyticsQueryDto, now?: Date): {
    start: Date;
    end: Date;
    previousStart: Date;
};
export declare class AnalyticsService {
    private readonly prisma;
    constructor(prisma: PrismaService);
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
}
