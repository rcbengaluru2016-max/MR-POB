import { ErpUser } from '@prisma/client';
import { ConfigService } from '../config/config.service';
import { PrismaService } from '../database/prisma.service';
export declare class AuthService {
    private readonly config;
    private readonly prisma;
    private readonly verifier;
    private readonly cognito;
    constructor(config: ConfigService, prisma: PrismaService);
    authenticate(token: string): Promise<ErpUser>;
    session(user: ErpUser): {
        username: string;
        userType: string;
        displayName: string;
    };
    private secretHash;
    private result;
    login(username: string, password: string): Promise<{
        accessToken: string;
        expiresIn: number;
        user: {
            username: string;
            userType: string;
            displayName: string;
        };
    } | {
        challengeName: string;
        username: string;
        session: string;
        secretCode: string;
    } | {
        challengeName: "ADMIN_NO_SRP_AUTH" | "PASSWORD" | "CUSTOM_CHALLENGE" | "DEVICE_PASSWORD_VERIFIER" | "DEVICE_SRP_AUTH" | "EMAIL_OTP" | "MFA_SETUP" | "NEW_PASSWORD_REQUIRED" | "PASSWORD_SRP" | "PASSWORD_VERIFIER" | "SELECT_CHALLENGE" | "SELECT_MFA_TYPE" | "SMS_MFA" | "SMS_OTP" | "SOFTWARE_TOKEN_MFA" | "WEB_AUTHN";
        session: string;
        username: string;
        secretCode?: undefined;
    }>;
    challenge(input: {
        username: string;
        session: string;
        challengeName: 'SOFTWARE_TOKEN_MFA' | 'SMS_MFA' | 'MFA_SETUP';
        code: string;
    }): Promise<{
        accessToken: string;
        expiresIn: number;
        user: {
            username: string;
            userType: string;
            displayName: string;
        };
    }>;
    logout(token: string): Promise<void>;
}
