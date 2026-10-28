import { ConflictException, Injectable } from '@nestjs/common';
import {
  AdminCreateUserCommand, AdminDisableUserCommand, AdminEnableUserCommand, AdminGetUserCommand,
  AdminSetUserPasswordCommand, AdminSetUserMFAPreferenceCommand, AdminUserGlobalSignOutCommand, AdminDeleteUserCommand, GetUserPoolMfaConfigCommand, CognitoIdentityProviderClient,
} from '@aws-sdk/client-cognito-identity-provider';
import { ConfigService } from '../config/config.service';

type IdentityAccount = { id: string; username: string; email: string | null; displayName: string; cognitoSub: string | null };

@Injectable()
export class CognitoAccountsService {
  private readonly client;
  constructor(private readonly config: ConfigService) {
    // Bound every remote request, including credentials resolution and retries.
    this.client = new CognitoIdentityProviderClient({ region: config.get('AWS_REGION'), maxAttempts: 1 });
  }
  private parameters(username: string) { return { UserPoolId: this.config.get('COGNITO_USER_POOL_ID'), Username: username }; }
  private async get(username: string) {
    try { return await this.client.send(new AdminGetUserCommand(this.parameters(username)), { abortSignal: AbortSignal.timeout(5_000) }); }
    catch (error) { if ((error as Error).name === 'UserNotFoundException') return null; throw error; }
  }
  async preflight(username: string) {
    // Resolve credentials and check the same provider permission used by setup
    // before reserving a database login. Never change an existing identity here.
    await this.get(username);
  }
  async adminPasswordOnly(account: IdentityAccount & { role: string }) {
    if (account.role !== 'ADMIN') throw new ConflictException('Admin-only MFA operation');
    const policy = await this.client.send(new GetUserPoolMfaConfigCommand({ UserPoolId: this.config.get('COGNITO_USER_POOL_ID') }), { abortSignal: AbortSignal.timeout(5000) });
    if (policy.MfaConfiguration !== 'OPTIONAL') throw new ConflictException('Admin password-only login requires the configured role-based MFA policy.');
    const identity = await this.get(account.username);
    if (!identity?.Username || !account.cognitoSub || !identity.UserAttributes?.some(a => a.Name === 'sub' && a.Value === account.cognitoSub)) throw new ConflictException('The linked login identity is missing or has changed');
    await this.client.send(new AdminSetUserMFAPreferenceCommand({ ...this.parameters(identity.Username), SoftwareTokenMfaSettings: { Enabled: false, PreferredMfa: false }, SMSMfaSettings: { Enabled: false, PreferredMfa: false } }), { abortSignal: AbortSignal.timeout(5000) });
  }
  async password(account: IdentityAccount, password: string, bind: (sub: string) => Promise<void>, permanent = true) {
    const marker = `urn:zenex:erp:${account.id}`;
    let identity = await this.get(account.username);
    if (!identity) {
      if (account.cognitoSub) throw new ConflictException('The linked login identity is missing. Contact the administrator.');
      // A durable ownership marker lets a retry recover an ambiguous create timeout.
      // Never adopt an unrelated existing Cognito identity or move its email alias.
      const created = await this.client.send(new AdminCreateUserCommand({
        ...this.parameters(account.username), MessageAction: 'SUPPRESS', ForceAliasCreation: false,
        TemporaryPassword: password,
        UserAttributes: [...(account.email ? [{ Name: 'email', Value: account.email }] : []), { Name: 'name', Value: account.displayName }, { Name: 'profile', Value: marker }],
      }), { abortSignal: AbortSignal.timeout(5_000) });
      identity = { Username: created.User?.Username, UserAttributes: created.User?.Attributes, $metadata: created.$metadata };
    }
    const sub = identity.UserAttributes?.find(attribute => attribute.Name === 'sub')?.Value;
    const owned = account.cognitoSub ? sub === account.cognitoSub : identity.UserAttributes?.some(attribute => attribute.Name === 'profile' && attribute.Value === marker);
    if (!identity.Username || !sub || !owned) throw new ConflictException('This login identity already exists or cannot be safely linked. The ERP account remains inactive.');
    // Commit the subject before making credentials usable. It is never supplied by a caller.
    await bind(sub);
    await this.client.send(new AdminSetUserPasswordCommand({ ...this.parameters(identity.Username), Password: password, Permanent: permanent }), { abortSignal: AbortSignal.timeout(5_000) });
  }
  async state(account: Pick<IdentityAccount, 'username' | 'cognitoSub'>, state: 'ACTIVE' | 'INACTIVE') {
    const identity = await this.get(account.username);
    if (!account.cognitoSub || !identity?.Username || !identity.UserAttributes?.some(attribute => attribute.Name === 'sub' && attribute.Value === account.cognitoSub)) {
      throw new ConflictException('The linked login identity is missing or has changed. The ERP account remains inactive.');
    }
    const input = this.parameters(identity.Username);
    await this.client.send(state === 'ACTIVE' ? new AdminEnableUserCommand(input) : new AdminDisableUserCommand(input), { abortSignal: AbortSignal.timeout(5_000) });
    if (state === 'INACTIVE') await this.client.send(new AdminUserGlobalSignOutCommand(input), { abortSignal: AbortSignal.timeout(5_000) });
  }
  async remove(account: IdentityAccount) {
    const identity = await this.get(account.username);
    if (!identity) return;
    const sub = identity.UserAttributes?.find(attribute => attribute.Name === 'sub')?.Value;
    const owned = account.cognitoSub ? sub === account.cognitoSub : identity.UserAttributes?.some(attribute => attribute.Name === 'profile' && attribute.Value === `urn:zenex:erp:${account.id}`);
    if (!identity.Username || !owned) throw new ConflictException('An unrelated authentication identity uses this login. No identity was changed.');
    const parameters = this.parameters(identity.Username);
    await this.client.send(new AdminDisableUserCommand(parameters), { abortSignal: AbortSignal.timeout(5000) });
    await this.client.send(new AdminUserGlobalSignOutCommand(parameters), { abortSignal: AbortSignal.timeout(5000) });
    await this.client.send(new AdminDeleteUserCommand(parameters), { abortSignal: AbortSignal.timeout(5000) });
  }
  async requireMfaPolicy() {
    const policy = await this.client.send(new GetUserPoolMfaConfigCommand({ UserPoolId: this.config.get('COGNITO_USER_POOL_ID') }), { abortSignal: AbortSignal.timeout(5000) });
    if (!['ON', 'OPTIONAL'].includes(policy.MfaConfiguration ?? '') || !policy.SoftwareTokenMfaConfiguration?.Enabled) throw new ConflictException('New Super Admins require Cognito software-token MFA enrollment. Ask your AWS administrator to configure the pool; no account was created.');
  }
}
