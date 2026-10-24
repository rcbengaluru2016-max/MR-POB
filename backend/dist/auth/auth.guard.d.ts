import { CanActivate, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { ErpUser } from '@prisma/client';
import { AuthService } from './auth.service';
export type AuthenticatedRequest = Request & {
    user: ErpUser;
};
export declare class CognitoGuard implements CanActivate {
    private readonly auth;
    constructor(auth: AuthService);
    canActivate(context: ExecutionContext): Promise<boolean>;
}
export declare class AdminGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean;
}
export declare class SuperAdminGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean;
}
