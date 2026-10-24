"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const aws_jwt_verify_1 = require("aws-jwt-verify");
const client_cognito_identity_provider_1 = require("@aws-sdk/client-cognito-identity-provider");
const node_crypto_1 = require("node:crypto");
const config_service_1 = require("../config/config.service");
const prisma_service_1 = require("../database/prisma.service");
let AuthService = class AuthService {
    config;
    prisma;
    verifier;
    cognito;
    constructor(config, prisma) {
        this.config = config;
        this.prisma = prisma;
        this.verifier = aws_jwt_verify_1.CognitoJwtVerifier.create({ userPoolId: config.get('COGNITO_USER_POOL_ID'), clientId: config.get('COGNITO_CLIENT_ID'), tokenUse: 'access' });
        this.cognito = new client_cognito_identity_provider_1.CognitoIdentityProviderClient({ region: config.get('AWS_REGION'), maxAttempts: 2 });
    }
    async authenticate(token) {
        let sub;
        try {
            sub = (await this.verifier.verify(token)).sub;
        }
        catch {
            throw new common_1.UnauthorizedException('Invalid or expired access token');
        }
        const user = await this.prisma.erpUser.findUnique({ where: { cognitoSub: sub } });
        if (!user || user.state !== 'ACTIVE')
            throw new common_1.ForbiddenException('ERP account is not active');
        if (['CUSTOMER', 'COMPANY', 'PATIENT'].includes(user.role)) {
            const registration = await this.prisma.registration.findFirst({ where: { ownerId: user.id, kind: user.role.toLowerCase(), status: 'APPROVED' }, select: { id: true } });
            if (!registration)
                throw new common_1.ForbiddenException('An approved registration is required');
        }
        return user;
    }
    session(user) {
        const userType = user.role === 'SUPER_ADMIN' ? 'super_admin' : user.role.toLowerCase();
        return { username: user.username, userType, displayName: user.displayName };
    }
    secretHash(username) {
        const secret = this.config.optional('COGNITO_CLIENT_SECRET');
        return secret ? (0, node_crypto_1.createHmac)('sha256', secret).update(username + this.config.get('COGNITO_CLIENT_ID')).digest('base64') : undefined;
    }
    async result(auth) {
        if (!auth?.AccessToken || !auth.ExpiresIn)
            throw new common_1.UnauthorizedException('Authentication did not complete');
        const user = await this.authenticate(auth.AccessToken);
        return { accessToken: auth.AccessToken, expiresIn: auth.ExpiresIn, user: this.session(user) };
    }
    async login(username, password) {
        const account = await this.prisma.erpUser.findFirst({ where: { OR: [{ username: { equals: username, mode: 'insensitive' } }, { email: { equals: username, mode: 'insensitive' } }] } });
        if (!account?.cognitoSub || account.state !== 'ACTIVE')
            throw new common_1.UnauthorizedException('Unable to sign in with these credentials');
        const hash = this.secretHash(username);
        let result;
        try {
            result = await this.cognito.send(new client_cognito_identity_provider_1.InitiateAuthCommand({
                AuthFlow: 'USER_PASSWORD_AUTH', ClientId: this.config.get('COGNITO_CLIENT_ID'),
                AuthParameters: { USERNAME: username, PASSWORD: password, ...(hash ? { SECRET_HASH: hash } : {}) },
            }));
        }
        catch {
            throw new common_1.UnauthorizedException('Unable to sign in with these credentials');
        }
        if (result.ChallengeName) {
            const canonicalUsername = result.ChallengeParameters?.USER_ID_FOR_SRP ?? result.ChallengeParameters?.USERNAME ?? username;
            if (result.ChallengeName === 'MFA_SETUP' && result.Session) {
                let setup;
                try {
                    setup = await this.cognito.send(new client_cognito_identity_provider_1.AssociateSoftwareTokenCommand({ Session: result.Session }));
                }
                catch {
                    throw new common_1.BadRequestException('Authenticator setup could not start. Check the Cognito MFA configuration.');
                }
                if (!setup.Session || !setup.SecretCode)
                    throw new common_1.BadRequestException('Authenticator setup did not complete. Please sign in again.');
                return { challengeName: 'MFA_SETUP', username: canonicalUsername, session: setup.Session, secretCode: setup.SecretCode };
            }
            if (!['SOFTWARE_TOKEN_MFA', 'SMS_MFA'].includes(result.ChallengeName) || !result.Session) {
                throw new common_1.BadRequestException('Complete account setup through Cognito before signing in');
            }
            // Cognito may canonicalize aliases; use its canonical username for challenge secret hashes.
            return { challengeName: result.ChallengeName, session: result.Session, username: canonicalUsername };
        }
        return this.result(result.AuthenticationResult);
    }
    async challenge(input) {
        const hash = this.secretHash(input.username);
        let result;
        try {
            let session = input.session;
            if (input.challengeName === 'MFA_SETUP') {
                const verified = await this.cognito.send(new client_cognito_identity_provider_1.VerifySoftwareTokenCommand({ Session: session, UserCode: input.code }));
                if (verified.Status !== 'SUCCESS' || !verified.Session)
                    throw new Error('Authenticator code not verified');
                session = verified.Session;
            }
            result = await this.cognito.send(new client_cognito_identity_provider_1.RespondToAuthChallengeCommand({
                ClientId: this.config.get('COGNITO_CLIENT_ID'), Session: session, ChallengeName: input.challengeName,
                ChallengeResponses: { USERNAME: input.username, ...(input.challengeName === 'MFA_SETUP' ? {} : { [input.challengeName === 'SMS_MFA' ? 'SMS_MFA_CODE' : 'SOFTWARE_TOKEN_MFA_CODE']: input.code }), ...(hash ? { SECRET_HASH: hash } : {}) },
            }));
        }
        catch {
            throw new common_1.UnauthorizedException('Invalid or expired authentication challenge');
        }
        return this.result(result.AuthenticationResult);
    }
    async logout(token) {
        try {
            await this.cognito.send(new client_cognito_identity_provider_1.GlobalSignOutCommand({ AccessToken: token }));
        }
        catch { /* Local cookie is cleared even if Cognito session already expired. */ }
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_service_1.ConfigService, prisma_service_1.PrismaService])
], AuthService);
//# sourceMappingURL=auth.service.js.map