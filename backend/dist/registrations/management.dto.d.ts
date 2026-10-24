export declare class AnalyticsQueryDto {
    period: 'daily' | 'weekly' | 'monthly' | 'custom';
    start?: string;
    end?: string;
}
export declare class RegistrationDecisionDto {
    action: 'approve' | 'reject';
    reason?: string;
}
