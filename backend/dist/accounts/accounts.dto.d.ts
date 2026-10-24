export declare class AccountPasswordDto {
    password: string;
}
export declare class CreateAdminDto extends AccountPasswordDto {
    name: string;
    email: string;
    role: 'ADMIN';
    state: 'ACTIVE' | 'INACTIVE';
}
export declare class AccountQueryDto {
    page: number;
    pageSize: number;
}
export declare class AccountStateDto {
    state: 'ACTIVE' | 'INACTIVE';
}
export declare class AdminAccountDto {
    id: string;
    username: string;
    email: string | null;
    name: string;
    role: string;
    state: string;
    createdById: string | null;
    createdAt: Date;
    updatedAt: Date;
    provisioningRequired: boolean;
}
