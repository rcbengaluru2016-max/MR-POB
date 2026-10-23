// Test transport only. Production always uses the AWS SDK's real transport.
import { randomUUID } from 'node:crypto';
export class TestCognito {
  users = new Map<string, { sub: string; password: string; enabled: boolean; attributes: { Name: string; Value: string }[] }>();
  failNext = '';
  seed(username: string, sub: string, password: string) { this.users.set(username, { sub, password, enabled: true, attributes: [{ Name: 'sub', Value: sub }] }); }
  send = async (command: any): Promise<any> => {
    const kind = command.constructor.name;
    if (this.failNext === kind) { this.failNext = ''; throw new Error('Simulated provider failure'); }
    const input = command.input;
    const key = this.users.has(input.Username) ? input.Username : [...this.users].find(([, user]) => user.sub === input.Username)?.[0];
    const user = key ? this.users.get(key)! : undefined;
    const view = () => ({ Username: key, UserAttributes: user?.attributes, $metadata: {} });
    if (kind === 'AdminGetUserCommand') { if (!user) throw Object.assign(new Error(), { name: 'UserNotFoundException' }); return view(); }
    if (kind === 'AdminCreateUserCommand') {
      if (user) throw Object.assign(new Error(), { name: 'UsernameExistsException' });
      const sub = randomUUID();
      this.users.set(input.Username, { sub, password: '', enabled: true, attributes: [...input.UserAttributes, { Name: 'sub', Value: sub }] });
      return { User: { Username: input.Username, Attributes: this.users.get(input.Username)!.attributes }, $metadata: {} };
    }
    if (kind === 'AdminSetUserPasswordCommand' && user) { user.password = input.Password; return {}; }
    if (kind === 'AdminEnableUserCommand' && user) { user.enabled = true; return {}; }
    if (kind === 'AdminDisableUserCommand' && user) { user.enabled = false; return {}; }
    if (kind === 'GlobalSignOutCommand') return {};
    if (kind === 'InitiateAuthCommand') {
      const identity = this.users.get(input.AuthParameters.USERNAME);
      if (!identity?.enabled || identity.password !== input.AuthParameters.PASSWORD) throw new Error('Invalid credentials');
      return { AuthenticationResult: { AccessToken: identity.sub, ExpiresIn: 3600 } };
    }
    throw new Error(`Unexpected test command: ${kind}`);
  };
}
