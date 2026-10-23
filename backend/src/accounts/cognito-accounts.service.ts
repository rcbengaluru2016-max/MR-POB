import { ConflictException, Injectable } from '@nestjs/common';
import {
  AdminCreateUserCommand, AdminDisableUserCommand, AdminEnableUserCommand, AdminGetUserCommand,
  AdminSetUserPasswordCommand, CognitoIdentityProviderClient,
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
  async password(account: IdentityAccount, password: string, bind: (sub: string) => Promise<void>) {
    const marker = `urn:zenex:erp:${account.id}`;
    let identity = await this.get(account.cognitoSub ?? account.username);
    if (!identity) {
      if (account.cognitoSub) throw new ConflictException('The linked login identity is missing. Contact the administrator.');
      // A durable ownership marker lets a retry recover an ambiguous create timeout.
      // Never adopt an unrelated existing Cognito identity or move its email alias.
      const created = await this.client.send(new AdminCreateUserCommand({
        ...this.parameters(account.username), MessageAction: 'SUPPRESS', ForceAliasCreation: false,
        TemporaryPassword: password,
        UserAttributes: [{ Name: 'email', Value: account.email ?? account.username }, { Name: 'name', Value: account.displayName }, { Name: 'profile', Value: marker }],
      }), { abortSignal: AbortSignal.timeout(5_000) });
      identity = { Username: created.User?.Username, UserAttributes: created.User?.Attributes, $metadata: created.$metadata };
    }
    const sub = identity.UserAttributes?.find(attribute => attribute.Name === 'sub')?.Value;
    const owned = account.cognitoSub ? sub === account.cognitoSub : identity.UserAttributes?.some(attribute => attribute.Name === 'profile' && attribute.Value === marker);
    if (!identity.Username || !sub || !owned) throw new ConflictException('This login identity already exists or cannot be safely linked. The ERP account remains inactive.');
    // Commit the subject before making credentials usable. It is never supplied by a caller.
    await bind(sub);
    await this.client.send(new AdminSetUserPasswordCommand({ ...this.parameters(identity.Username), Password: password, Permanent: true }), { abortSignal: AbortSignal.timeout(5_000) });
  }
  async state(sub: string, state: 'ACTIVE' | 'INACTIVE') {
    const identity = await this.get(sub);
    if (!identity?.Username || !identity.UserAttributes?.some(attribute => attribute.Name === 'sub' && attribute.Value === sub)) {
      throw new ConflictException('The linked login identity is missing or has changed. The ERP account remains inactive.');
    }
    const input = this.parameters(identity.Username);
    await this.client.send(state === 'ACTIVE' ? new AdminEnableUserCommand(input) : new AdminDisableUserCommand(input), { abortSignal: AbortSignal.timeout(5_000) });
  }
}
