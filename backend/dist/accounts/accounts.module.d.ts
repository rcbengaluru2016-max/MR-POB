import { AuthenticatedRequest } from '../auth/auth.guard';
import { AccountsService } from './accounts.service';
import { AccountPasswordDto, AccountQueryDto, AccountStateDto, CreateAdminDto } from './accounts.dto';
export declare class AccountsController {
    private readonly accounts;
    constructor(accounts: AccountsService);
    create(input: CreateAdminDto, request: AuthenticatedRequest): Promise<{
        account: {
            name: string;
            provisioningRequired: boolean;
            id: string;
            username: string;
            email: string | null;
            role: import(".prisma/client").$Enums.Role;
            state: import(".prisma/client").$Enums.UserState;
            createdAt: Date;
            updatedAt: Date;
            createdById: string | null;
        };
    }>;
    list(query: AccountQueryDto): Promise<{
        items: {
            name: string;
            provisioningRequired: boolean;
            id: string;
            username: string;
            email: string | null;
            role: import(".prisma/client").$Enums.Role;
            state: import(".prisma/client").$Enums.UserState;
            createdAt: Date;
            updatedAt: Date;
            createdById: string | null;
        }[];
        total: number;
        page: number;
        pageSize: number;
    }>;
    detail(id: string): Promise<{
        account: {
            name: string;
            provisioningRequired: boolean;
            id: string;
            username: string;
            email: string | null;
            role: import(".prisma/client").$Enums.Role;
            state: import(".prisma/client").$Enums.UserState;
            createdAt: Date;
            updatedAt: Date;
            createdById: string | null;
        };
    }>;
    password(id: string, input: AccountPasswordDto, request: AuthenticatedRequest): Promise<{
        account: {
            name: string;
            provisioningRequired: boolean;
            id: string;
            username: string;
            email: string | null;
            role: import(".prisma/client").$Enums.Role;
            state: import(".prisma/client").$Enums.UserState;
            createdAt: Date;
            updatedAt: Date;
            createdById: string | null;
        };
    }>;
    state(id: string, input: AccountStateDto, request: AuthenticatedRequest): Promise<{
        account: {
            name: string;
            provisioningRequired: boolean;
            id: string;
            username: string;
            email: string | null;
            role: import(".prisma/client").$Enums.Role;
            state: import(".prisma/client").$Enums.UserState;
            createdAt: Date;
            updatedAt: Date;
            createdById: string | null;
        };
    }>;
}
export declare class AccountsModule {
}
