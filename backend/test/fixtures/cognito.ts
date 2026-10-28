// Test transport only. Production always uses the AWS SDK's real transport.
import { randomUUID } from 'node:crypto';
export class TestCognito {
  users = new Map<string, { sub: string; password: string; enabled: boolean; temporary?: boolean; enrolled?: boolean; attributes: { Name: string; Value: string }[] }>();
  failNext = '';
  mfaUsers = new Set<string>();
  challenges = new Map<string, string>();
  phases = new Map<string, string>();
  mfaPolicy = 'OPTIONAL';
  seed(username: string, sub: string, password: string) { this.users.set(username, { sub, password, enabled: true, attributes: [{ Name: 'sub', Value: sub }] }); }
  send = async (command: any): Promise<any> => {
    const kind = command.constructor.name;
    if (this.failNext === kind) { this.failNext = ''; throw new Error('Simulated provider failure'); }
    const input = command.input;
    // This project's username-based pool does not accept sub as Username.
    const key = this.users.has(input.Username) ? input.Username : undefined;
    const user = key ? this.users.get(key)! : undefined;
    const view = () => ({ Username: key, Enabled: user?.enabled, UserMFASettingList: key && this.mfaUsers.has(key) ? ['SOFTWARE_TOKEN_MFA'] : [], UserAttributes: user?.attributes, $metadata: {} });
    if (kind === 'AdminSetUserMFAPreferenceCommand') { if (input.SoftwareTokenMfaSettings?.Enabled === false) this.mfaUsers.delete(input.Username); return {}; }
    if (kind === 'AssociateSoftwareTokenCommand' && input.AccessToken) {
      const username = [...this.users].find(([, value]) => value.sub === input.AccessToken)?.[0];
      if (!username) throw new Error('Invalid access token');
      const session = randomUUID(); this.challenges.set(session, username); this.phases.set(session, 'SETUP_ACCESS');
      return { Session: session, SecretCode: 'JBSWY3DPEHPK3PXP' };
    }
    if (kind === 'VerifySoftwareTokenCommand' && this.phases.get(input.Session) === 'SETUP_ACCESS') {
      if (input.UserCode !== '123456') throw new Error('Invalid setup code');
      this.phases.set(input.Session, 'SETUP_ACCESS_VERIFIED'); return { Status: 'SUCCESS', Session: input.Session };
    }
    if (kind === 'SetUserMFAPreferenceCommand' && input.AccessToken) {
      const username = [...this.users].find(([, value]) => value.sub === input.AccessToken)?.[0];
      if (!username) throw new Error('Invalid access token');
      this.users.get(username)!.enrolled = true; this.mfaUsers.add(username); return {};
    }
    if (kind === 'AdminGetUserCommand') { if (!user) throw Object.assign(new Error(), { name: 'UserNotFoundException' }); return view(); }
    if (kind === 'AdminCreateUserCommand') {
      if (user) throw Object.assign(new Error(), { name: 'UsernameExistsException' });
      const sub = randomUUID();
      this.users.set(input.Username, { sub, password: '', enabled: true, attributes: [...input.UserAttributes, { Name: 'sub', Value: sub }] });
      return { User: { Username: input.Username, Attributes: this.users.get(input.Username)!.attributes }, $metadata: {} };
    }
    if (kind === 'AdminSetUserPasswordCommand' && user) { user.password = input.Password; user.temporary = !input.Permanent; return {}; }
    if (kind === 'AdminEnableUserCommand' && user) { user.enabled = true; return {}; }
    if (kind === 'AdminDisableUserCommand' && user) { user.enabled = false; return {}; }
    if (kind === 'AdminUserGlobalSignOutCommand' && user) return {};
    if (kind === 'AdminDeleteUserCommand') { if (key) this.users.delete(key); return {}; }
    if (kind === 'GlobalSignOutCommand') return {};
    if (kind === 'ChangePasswordCommand') {
      const identity = [...this.users.values()].find(u => u.sub === input.AccessToken);
      if (!identity?.enabled || identity.password !== input.PreviousPassword) throw new Error('Invalid credentials');
      identity.password = input.ProposedPassword;
      return {};
    }
    if (kind === 'GetUserPoolMfaConfigCommand') return { MfaConfiguration: this.mfaPolicy, SoftwareTokenMfaConfiguration: { Enabled: true } };
    if (kind === 'InitiateAuthCommand') {
      const identity = this.users.get(input.AuthParameters.USERNAME);
      if (!identity?.enabled || identity.password !== input.AuthParameters.PASSWORD) throw new Error('Invalid credentials');
      if (identity.temporary) {
        const session = randomUUID(); this.challenges.set(session, input.AuthParameters.USERNAME); this.phases.set(session, 'PASSWORD');
        return { ChallengeName: 'NEW_PASSWORD_REQUIRED', Session: session, ChallengeParameters: { USERNAME: input.AuthParameters.USERNAME } };
      }
      if (this.mfaUsers.has(input.AuthParameters.USERNAME)) {
        const session = randomUUID(); this.challenges.set(session, input.AuthParameters.USERNAME);
        return { ChallengeName: 'SOFTWARE_TOKEN_MFA', Session: session, ChallengeParameters: { USERNAME: input.AuthParameters.USERNAME } };
      }
      return { AuthenticationResult: { AccessToken: identity.sub, ExpiresIn: 3600 } };
    }
    if (kind === 'AssociateSoftwareTokenCommand' && this.phases.get(input.Session) === 'SETUP') return { Session: input.Session, SecretCode: 'JBSWY3DPEHPK3PXP' };
    if (kind === 'VerifySoftwareTokenCommand' && this.phases.get(input.Session) === 'SETUP') {
      if (input.UserCode !== '123456') throw new Error('Invalid setup code');
      this.phases.set(input.Session, 'SETUP_VERIFIED');
      return { Status: 'SUCCESS', Session: input.Session };
    }
    if (kind === 'RespondToAuthChallengeCommand') {
      const username = this.challenges.get(input.Session), identity = username ? this.users.get(username) : undefined;
      if (identity?.enabled && username === input.ChallengeResponses.USERNAME && input.ChallengeName === 'NEW_PASSWORD_REQUIRED' && this.phases.get(input.Session) === 'PASSWORD') {
        identity.password = input.ChallengeResponses.NEW_PASSWORD; identity.temporary = false;
        if (this.mfaPolicy === 'OPTIONAL') return { AuthenticationResult: { AccessToken: identity.sub, ExpiresIn: 3600 } };
        this.phases.set(input.Session, 'SETUP');
        return { ChallengeName: 'MFA_SETUP', Session: input.Session, ChallengeParameters: { USERNAME: username } };
      }
      if (identity?.enabled && username === input.ChallengeResponses.USERNAME && input.ChallengeName === 'MFA_SETUP' && this.phases.get(input.Session) === 'SETUP_VERIFIED') {
        identity.enrolled = true; this.mfaUsers.add(username!); this.challenges.delete(input.Session); this.phases.delete(input.Session);
        return { AuthenticationResult: { AccessToken: identity.sub, ExpiresIn: 3600 } };
      }
      if (!identity?.enabled || username !== input.ChallengeResponses.USERNAME || input.ChallengeResponses.SOFTWARE_TOKEN_MFA_CODE !== '123456') throw new Error('Invalid MFA');
      this.challenges.delete(input.Session);
      return { AuthenticationResult: { AccessToken: identity.sub, ExpiresIn: 3600 } };
    }
    throw new Error(`Unexpected test command: ${kind}`);
  };
}
