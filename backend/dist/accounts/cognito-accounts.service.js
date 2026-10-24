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
exports.CognitoAccountsService = void 0;
const common_1 = require("@nestjs/common");
const client_cognito_identity_provider_1 = require("@aws-sdk/client-cognito-identity-provider");
const config_service_1 = require("../config/config.service");
let CognitoAccountsService = class CognitoAccountsService {
    config;
    client;
    constructor(config) {
        this.config = config;
        // Bound every remote request, including credentials resolution and retries.
        this.client = new client_cognito_identity_provider_1.CognitoIdentityProviderClient({ region: config.get('AWS_REGION'), maxAttempts: 1 });
    }
    parameters(username) { return { UserPoolId: this.config.get('COGNITO_USER_POOL_ID'), Username: username }; }
    async get(username) {
        try {
            return await this.client.send(new client_cognito_identity_provider_1.AdminGetUserCommand(this.parameters(username)), { abortSignal: AbortSignal.timeout(5_000) });
        }
        catch (error) {
            if (error.name === 'UserNotFoundException')
                return null;
            throw error;
        }
    }
    async password(account, password, bind) {
        const marker = `urn:zenex:erp:${account.id}`;
        let identity = await this.get(account.cognitoSub ?? account.username);
        if (!identity) {
            if (account.cognitoSub)
                throw new common_1.ConflictException('The linked login identity is missing. Contact the administrator.');
            // A durable ownership marker lets a retry recover an ambiguous create timeout.
            // Never adopt an unrelated existing Cognito identity or move its email alias.
            const created = await this.client.send(new client_cognito_identity_provider_1.AdminCreateUserCommand({
                ...this.parameters(account.username), MessageAction: 'SUPPRESS', ForceAliasCreation: false,
                TemporaryPassword: password,
                UserAttributes: [{ Name: 'email', Value: account.email ?? account.username }, { Name: 'name', Value: account.displayName }, { Name: 'profile', Value: marker }],
            }), { abortSignal: AbortSignal.timeout(5_000) });
            identity = { Username: created.User?.Username, UserAttributes: created.User?.Attributes, $metadata: created.$metadata };
        }
        const sub = identity.UserAttributes?.find(attribute => attribute.Name === 'sub')?.Value;
        const owned = account.cognitoSub ? sub === account.cognitoSub : identity.UserAttributes?.some(attribute => attribute.Name === 'profile' && attribute.Value === marker);
        if (!identity.Username || !sub || !owned)
            throw new common_1.ConflictException('This login identity already exists or cannot be safely linked. The ERP account remains inactive.');
        // Commit the subject before making credentials usable. It is never supplied by a caller.
        await bind(sub);
        await this.client.send(new client_cognito_identity_provider_1.AdminSetUserPasswordCommand({ ...this.parameters(identity.Username), Password: password, Permanent: true }), { abortSignal: AbortSignal.timeout(5_000) });
    }
    async state(sub, state) {
        const identity = await this.get(sub);
        if (!identity?.Username || !identity.UserAttributes?.some(attribute => attribute.Name === 'sub' && attribute.Value === sub)) {
            throw new common_1.ConflictException('The linked login identity is missing or has changed. The ERP account remains inactive.');
        }
        const input = this.parameters(identity.Username);
        await this.client.send(state === 'ACTIVE' ? new client_cognito_identity_provider_1.AdminEnableUserCommand(input) : new client_cognito_identity_provider_1.AdminDisableUserCommand(input), { abortSignal: AbortSignal.timeout(5_000) });
    }
};
exports.CognitoAccountsService = CognitoAccountsService;
exports.CognitoAccountsService = CognitoAccountsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_service_1.ConfigService])
], CognitoAccountsService);
//# sourceMappingURL=cognito-accounts.service.js.map