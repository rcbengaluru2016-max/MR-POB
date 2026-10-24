import { PrismaService } from '../database/prisma.service';
import { AccountQueryDto, CreateAdminDto } from './accounts.dto';
import { CognitoAccountsService } from './cognito-accounts.service';
export declare class AccountsService {
    private readonly prisma;
    private readonly identities;
    constructor(prisma: PrismaService, identities: CognitoAccountsService);
    create(input: CreateAdminDto, actorId: string): Promise<{
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
    private locked;
    private findAdmin;
    private pause;
    private remoteError;
    private complete;
    private provision;
    setPassword(id: string, password: string, actorId: string): Promise<{
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
    setState(id: string, state: 'ACTIVE' | 'INACTIVE', actorId: string): Promise<{
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
