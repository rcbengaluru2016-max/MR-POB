import { BadRequestException, ForbiddenException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ChangePasswordCommand, GlobalSignOutCommand, CognitoIdentityProviderClient, AdminGetUserCommand, GetUserPoolMfaConfigCommand } from '@aws-sdk/client-cognito-identity-provider';
import { ErpUser } from '@prisma/client';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { PrismaService } from '../database/prisma.service';
import { ConfigService } from '../config/config.service';
import { AccountPasswordDto, StepUpVerifyDto } from './accounts.dto';
import { StepUpService, tokenHash } from './step-up.service';

export class CurrentPasswordChallengeDto {
  @IsString() @MinLength(1) @MaxLength(256) currentPassword!: string;
}
export class CurrentPasswordChangeDto extends AccountPasswordDto {
  @IsString() @MinLength(1) @MaxLength(256) currentPassword!: string;
  @IsString() @MinLength(1) @MaxLength(128) confirmPassword!: string;
  @IsString() @Matches(/^[A-Za-z0-9_-]{43}$/) stepUpProof!: string;
}

export const PASSWORD_CHANGE_SUCCESS = 'Your password has been changed successfully. Please sign in again using your new password.';

@Injectable()
export class CurrentAccountService {
  private readonly client;
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService, private readonly stepUp: StepUpService) {
    this.client = new CognitoIdentityProviderClient({ region: config.get('AWS_REGION'), maxAttempts: 1 });
  }
  private target(token: string) { return { session: tokenHash(token) }; }
  private binding(token: string) { return this.stepUp.binding('SELF_PASSWORD_CHANGE', this.target(token)); }
  private active(actor: ErpUser) {
    if (actor.state !== 'ACTIVE' || actor.deletedAt) throw new ForbiddenException('Account is not active');
  }
  async security(actor: ErpUser) {
    this.active(actor);
    if (actor.role !== 'SUPER_ADMIN') throw new ForbiddenException('Super administrator access required');
    try {
      const identity = await this.client.send(new AdminGetUserCommand({ UserPoolId: this.config.get('COGNITO_USER_POOL_ID'), Username: actor.username }), { abortSignal: AbortSignal.timeout(5000) });
      if (!identity.Enabled || !actor.cognitoSub || !identity.UserAttributes?.some(a => a.Name === 'sub' && a.Value === actor.cognitoSub)) throw new ForbiddenException('Account identity is unavailable');
      const policy = await this.client.send(new GetUserPoolMfaConfigCommand({ UserPoolId: this.config.get('COGNITO_USER_POOL_ID') }), { abortSignal: AbortSignal.timeout(5000) });
      const enabled = !actor.mfaEnrollmentRequired && ['ON', 'OPTIONAL'].includes(policy.MfaConfiguration ?? '') && policy.SoftwareTokenMfaConfiguration?.Enabled === true && identity.UserMFASettingList?.includes('SOFTWARE_TOKEN_MFA') === true;
      return { mfaEnabled: enabled, mfaMethod: enabled ? 'SOFTWARE_TOKEN_MFA' : null, mfaStatus: enabled ? 'VERIFIED' : 'SETUP_REQUIRED' };
    } catch (error) {
      if (error instanceof ForbiddenException) throw error;
      throw new ServiceUnavailableException('Unable to retrieve security status. Please retry.');
    }
  }
  async me(actor: ErpUser) {
    this.active(actor);
    return { id: actor.id, accountHolder: actor.displayName, username: actor.username, email: actor.email, role: actor.role, status: actor.state,
      createdAt: actor.createdAt.toISOString(), lastSuccessfulLogin: actor.lastLoginAt?.toISOString() ?? null,
      ...(actor.role === 'SUPER_ADMIN' ? { security: await this.security(actor) } : {}) };
  }
  private async requireMfa(actor: ErpUser) {
    if (!(await this.security(actor)).mfaEnabled) throw new ForbiddenException('Authenticator setup or recovery is required');
  }
  private audit(actor: ErpUser, action: string) { return this.prisma.auditEvent.create({ data: { actorId: actor.id, action } }); }
  async challenge(actor: ErpUser, token: string, input: CurrentPasswordChallengeDto) {
    try {
      await this.requireMfa(actor);
      const result = await this.stepUp.challengeBound(actor, input.currentPassword, this.binding(token), true);
      await this.audit(actor, 'SELF_PASSWORD_CHANGE_CHALLENGE');
      return result;
    } catch (error) { await this.audit(actor, 'SELF_PASSWORD_CHANGE_CHALLENGE_FAILED'); throw error; }
  }
  async verify(actor: ErpUser, token: string, input: StepUpVerifyDto) {
    try {
      await this.requireMfa(actor);
      const result = await this.stepUp.verify(input, actor, this.binding(token));
      await this.audit(actor, 'SELF_PASSWORD_CHANGE_MFA_VERIFIED');
      return result;
    } catch (error) { await this.audit(actor, 'SELF_PASSWORD_CHANGE_MFA_FAILED'); throw error; }
  }
  async change(actor: ErpUser, token: string, input: CurrentPasswordChangeDto) {
    try { return await this.performChange(actor, token, input); }
    catch (error) { await this.audit(actor, 'SELF_PASSWORD_CHANGE_REJECTED'); throw error; }
  }
  private async performChange(actor: ErpUser, token: string, input: CurrentPasswordChangeDto) {
    if (input.password !== input.confirmPassword) throw new BadRequestException('Passwords do not match');
    if (input.password === input.currentPassword) throw new BadRequestException('Choose a password different from your current password');
    await this.requireMfa(actor);
    // Commit consumption before the remote write: a timeout must never release a proof.
    // Revoke locally first so a provider/sign-out interruption cannot leave old JWTs usable.
    await this.prisma.$transaction(async tx => {
      await this.stepUp.consume(tx, input.stepUpProof, actor.id, 'SELF_PASSWORD_CHANGE', this.target(token));
      const active = await tx.erpUser.updateMany({ where: { id: actor.id, state: 'ACTIVE', deletedAt: null, role: 'SUPER_ADMIN' }, data: { tokensValidAfter: new Date() } });
      if (active.count !== 1) throw new ForbiddenException('Account is not active');
      await tx.auditEvent.create({ data: { actorId: actor.id, action: 'SELF_PASSWORD_CHANGE_STARTED' } });
    });
    try {
      await this.client.send(new ChangePasswordCommand({ AccessToken: token, PreviousPassword: input.currentPassword, ProposedPassword: input.password }), { abortSignal: AbortSignal.timeout(8000) });
    } catch (error) {
      await this.prisma.erpUser.updateMany({ where: { id: actor.id }, data: { tokensValidAfter: new Date() } });
      await this.audit(actor, 'SELF_PASSWORD_CHANGE_FAILED');
      if (['InvalidPasswordException', 'PasswordHistoryPolicyViolationException'].includes((error as Error).name)) throw new BadRequestException('The password does not satisfy the account password policy. Please sign in and retry.');
      throw new ServiceUnavailableException('Password update could not be confirmed. Please sign in again before retrying.');
    }
    await this.audit(actor, 'SELF_PASSWORD_CHANGED');
    try {
      await this.client.send(new GlobalSignOutCommand({ AccessToken: token }), { abortSignal: AbortSignal.timeout(8000) });
      await this.audit(actor, 'SELF_PASSWORD_CHANGE_SESSIONS_REVOKED');
    } catch { await this.audit(actor, 'SELF_PASSWORD_CHANGE_REMOTE_SIGNOUT_FAILED'); }
    // Also fence off sessions issued while the provider operation was in flight.
    await this.prisma.erpUser.updateMany({ where: { id: actor.id }, data: { tokensValidAfter: new Date() } });
    return { ok: true, message: PASSWORD_CHANGE_SUCCESS };
  }
}
