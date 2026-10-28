import { BadRequestException, ConflictException, ForbiddenException, HttpException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AccountQueryDto, CreateAdminDto } from './accounts.dto';
import { CognitoAccountsService } from './cognito-accounts.service';
import { createAccountBinding, StepUpService, tokenHash } from './step-up.service';
import { ConfigService } from '../config/config.service';
import { randomBytes } from 'node:crypto';

const accountSelect = { id: true, username: true, email: true, displayName: true, role: true, state: true, createdById: true, createdAt: true, updatedAt: true, lastLoginAt: true, cognitoSub: true } satisfies Prisma.ErpUserSelect;
type Account = Prisma.ErpUserGetPayload<{ select: typeof accountSelect }>;
function present({ displayName, cognitoSub, ...account }: Account) {
  return { ...account, name: displayName, provisioningRequired: !cognitoSub };
}

@Injectable()
export class AccountsService {
  constructor(private readonly prisma: PrismaService, private readonly identities: CognitoAccountsService, private readonly stepUp: StepUpService, private readonly config: ConfigService) {}
  async create(input: CreateAdminDto, actorId: string, attempt = 0): Promise<{ account: ReturnType<typeof present> }> {
    const email = input.email.trim().toLowerCase();
    try { await this.identities.preflight(email); }
    catch (error) { this.remoteError(error); }
    if (input.role === 'SUPER_ADMIN') await this.identities.requireMfaPolicy();
    try {
      const account = await this.prisma.$transaction(async tx => {
        if (input.role === 'SUPER_ADMIN') await this.stepUp.consume(tx, input.stepUpProof, actorId, 'CREATE_SUPER_ADMIN', createAccountBinding(input));
        const duplicate = await tx.erpUser.findFirst({ where: { OR: [{ username: { equals: email, mode: 'insensitive' } }, { email: { equals: email, mode: 'insensitive' } }] }, select: { ...accountSelect, deletedAt: true } });
        // The same creator can retry initial Admin setup after a credentials
        // outage. Bound, deleted, active and other creators' logins stay reserved.
        if (duplicate && input.role === 'ADMIN' && duplicate.role === 'ADMIN' && duplicate.state === 'INACTIVE' && !duplicate.deletedAt && !duplicate.cognitoSub && duplicate.createdById === actorId && duplicate.displayName === input.name.trim()) return duplicate;
        if (duplicate) throw new ConflictException('An account already uses this email or username');
        // Reserve the unique login before touching Cognito. A failed/ambiguous remote
        // operation leaves this durable, inactive account available for an explicit retry.
        const created = await tx.erpUser.create({ data: { username: email, email, displayName: input.name.trim(), role: input.role, state: 'INACTIVE', mfaEnrollmentRequired: input.role === 'SUPER_ADMIN', createdById: actorId }, select: accountSelect });
        await tx.auditEvent.create({ data: { actorId, action: 'ADMIN_ACCOUNT_RESERVED', detail: { accountId: created.id, role: input.role } } });
        return created;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      return await this.locked(account.id, async () => {
        // Another simultaneous create may have completed while this request
        // waited for the account lock. A retry must never reset a bound login.
        const current = await this.findAdmin(account.id);
        if (current.cognitoSub || current.state !== 'INACTIVE') throw new ConflictException('An account already uses this email or username');
        return this.provision(account.id, input.password, input.state, actorId, 'ADMIN_ACCOUNT_CREATED');
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
        if (attempt < 2) return this.create(input, actorId, attempt + 1);
        throw new ConflictException('Another account operation is in progress. Please retry.');
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('An account already uses this email or username');
      throw error;
    }
  }
  // A transaction-scoped PostgreSQL advisory lock serializes operations across
  // backend instances. Business writes use independent committed transactions:
  // INACTIVE must be visible to JWT authorization before any remote operation.
  // A process crash releases the lock but cannot undo that access restriction.
  private locked<T>(id: string, action: () => Promise<T>) {
    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT 1::int FROM pg_advisory_xact_lock(hashtextextended(${id}, 0))`;
      return action();
    }, { maxWait: 5_000, timeout: 45_000 });
  }
  private async findAdmin(id: string) {
    const account = await this.prisma.erpUser.findFirst({ where: { id, role: { in: ['ADMIN', 'SUPER_ADMIN'] }, deletedAt: null }, select: accountSelect });
    if (!account) throw new NotFoundException('Account not found');
    return account;
  }
  private async pause(id: string, actorId: string, operation: string) {
    await this.prisma.$transaction(async tx => {
      const previous = await tx.erpUser.findUniqueOrThrow({ where: { id }, select: { state: true } });
      await tx.erpUser.update({ where: { id }, data: { state: 'INACTIVE', tokensValidAfter: new Date() } });
      await tx.auditEvent.create({ data: { actorId, action: 'ADMIN_ACCOUNT_OPERATION_STARTED', detail: { accountId: id, operation, previousState: previous.state } } });
    });
  }
  private remoteError(error: unknown): never {
    if (error instanceof HttpException) throw error;
    const name = error instanceof Error ? error.name : '';
    if (['CredentialsProviderError', 'TokenProviderError', 'ExpiredTokenException', 'ExpiredToken', 'InvalidClientTokenId', 'UnrecognizedClientException'].includes(name)) {
      throw Object.assign(new ServiceUnavailableException('AWS authentication is unavailable. Renew the backend AWS session and retry account creation.'), { code: 'ACCOUNT_AWS_CREDENTIALS_UNAVAILABLE' });
    }
    if (['InvalidPasswordException', 'PasswordHistoryPolicyViolationException'].includes(name)) throw new BadRequestException('The password does not meet the authentication provider policy. The account remains inactive; reset its password to retry.');
    if (['UsernameExistsException', 'AliasExistsException'].includes(name)) throw new ConflictException('This login already exists in the authentication provider. The ERP account remains inactive; contact the administrator.');
    throw new ServiceUnavailableException('Account setup could not be completed. The account remains inactive. Refresh Users & Accounts, then set/reset its password to retry. Check Cognito configuration and backend AWS credentials.');
  }
  private async complete(id: string, state: 'ACTIVE' | 'INACTIVE', actorId: string, action: string) {
    return this.prisma.$transaction(async tx => {
      const account = await tx.erpUser.update({ where: { id }, data: { state }, select: accountSelect });
      await tx.auditEvent.create({ data: { actorId, action, detail: { accountId: id, state } } });
      return { account: present(account) };
    });
  }
  private async provision(id: string, password: string, state: 'ACTIVE' | 'INACTIVE', actorId: string, action: string) {
    const account = await this.findAdmin(id);
    await this.pause(id, actorId, action);
    try {
      let sub = account.cognitoSub;
      await this.identities.password(account, password, async subject => {
        await this.prisma.erpUser.update({ where: { id }, data: { cognitoSub: subject } });
        sub = subject;
      }, account.role !== 'SUPER_ADMIN');
      if (!sub) throw new Error('Identity binding missing');
      await this.identities.state({ username: account.username, cognitoSub: sub }, state);
      return await this.complete(id, state, actorId, action);
    } catch (error) { this.remoteError(error); }
  }
  async list(query: AccountQueryDto) {
    const where: Prisma.ErpUserWhereInput = { deletedAt: null, role: query.role ?? { in: ['ADMIN', 'SUPER_ADMIN'] }, ...(query.state ? { state: query.state } : {}), ...(query.search?.trim() ? { OR: ['displayName', 'username', 'email'].map(key => ({ [key]: { contains: query.search!.trim(), mode: 'insensitive' } })) } : {}) };
    const sort = { name: 'displayName', email: 'email', role: 'role', status: 'state', createdAt: 'createdAt', lastLoginAt: 'lastLoginAt' }[query.sort] ?? 'createdAt';
    const [items, total] = await this.prisma.$transaction([
      this.prisma.erpUser.findMany({ where, select: accountSelect, orderBy: [{ [sort]: query.direction }, { id: query.direction }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      this.prisma.erpUser.count({ where }),
    ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    return { items: items.map(present), total, page: query.page, pageSize: query.pageSize, pageCount: Math.ceil(total / query.pageSize) };
  }
  async detail(id: string) {
    const account = await this.prisma.erpUser.findFirst({ where: { id, role: { in: ['ADMIN', 'SUPER_ADMIN'] }, deletedAt: null }, select: accountSelect });
    if (!account) throw new NotFoundException('Admin account not found');
    return { account: present(account) };
  }
  async setState(id: string, state: 'ACTIVE' | 'INACTIVE', actorId: string) {
    return this.locked('account-status-changes', () => this.locked(id, async () => {
      const account = await this.findAdmin(id);
      if (id === actorId) throw new ForbiddenException('You cannot change your own account status');
      if (account.role === 'SUPER_ADMIN' && state === 'INACTIVE' && await this.prisma.erpUser.count({ where: { role: 'SUPER_ADMIN', state: 'ACTIVE', deletedAt: null } }) <= 1) throw new ForbiddenException('The last active Super Admin cannot be deactivated');
      if (!account.cognitoSub && state === 'ACTIVE') throw new BadRequestException('Set an initial password before activating this account.');
      await this.pause(id, actorId, 'STATE_CHANGE');
      try {
        if (account.cognitoSub) await this.identities.state(account, state);
        return await this.complete(id, state, actorId, 'ADMIN_ACCOUNT_STATE_CHANGED');
      } catch (error) { this.remoteError(error); }
    }));
  }

  async remove(id: string, actorId: string) {
    return this.locked(id, async () => {
      const account = await this.findAdmin(id);
      if (account.role !== 'ADMIN' || id === actorId) throw new ForbiddenException('Super Admin accounts and your own account cannot be deleted');
      await this.pause(id, actorId, 'DELETE');
      try { await this.identities.remove({ ...account, displayName: account.displayName }); }
      catch (error) { this.remoteError(error); }
      await this.prisma.$transaction(async tx => {
        await tx.erpUser.update({ where: { id }, data: { state: 'INACTIVE', deletedAt: new Date() } });
        await tx.accountResetToken.updateMany({ where: { accountId: id, usedAt: null }, data: { invalidatedAt: new Date() } });
        await tx.auditEvent.create({ data: { actorId, action: 'ADMIN_ACCOUNT_DELETED', detail: { accountId: id, previousState: account.state } } });
      });
      return { success: true };
    });
  }

  async resetLink(id: string, proof: string, actorId: string) {
    const origin = new URL(this.config.get('FRONTEND_ORIGIN'));
    if (origin.protocol !== 'https:' && !(this.config.get('NODE_ENV') !== 'production' && ['localhost', '127.0.0.1'].includes(origin.hostname))) throw new ServiceUnavailableException('A trusted HTTPS frontend origin is required');
    return this.locked(id, async () => {
      const account = await this.findAdmin(id);
      const token = randomBytes(32).toString('base64url'), now = new Date(), expiresAt = new Date(now.getTime() + 30 * 60_000);
      await this.prisma.$transaction(async tx => {
        await this.stepUp.consume(tx, proof, actorId, 'PASSWORD_RESET', id);
        await tx.accountResetToken.updateMany({ where: { accountId: id, usedAt: null, invalidatedAt: null }, data: { invalidatedAt: now } });
        await tx.accountResetToken.create({ data: { accountId: id, tokenHash: tokenHash(token), createdAt: now, expiresAt, createdById: actorId, previousState: account.state } });
        await tx.auditEvent.create({ data: { actorId, action: 'ACCOUNT_RESET_LINK_CREATED', detail: { accountId: id } } });
      });
      // The fragment stays in the browser and is never sent in page access logs.
      return { resetUrl: `${origin.origin}/reset-password#token=${token}`, expiresAt };
    });
  }
  async resetAdminPassword(id: string, password: string, confirmPassword: string, actorId: string) {
    if (password !== confirmPassword) throw new BadRequestException('Passwords do not match');
    return this.locked(id, async () => {
      const account = await this.findAdmin(id);
      if (account.role !== 'ADMIN' || account.id === actorId) throw new ForbiddenException('This password reset operation is restricted to Admin accounts');
      await this.pause(id, actorId, 'DIRECT_PASSWORD_RESET');
      try {
        let sub = account.cognitoSub;
        await this.identities.password(account, password, async subject => {
          await this.prisma.erpUser.update({ where: { id }, data: { cognitoSub: subject } }); sub = subject;
        });
        const linked = { username: account.username, cognitoSub: sub };
        // Revoke all provider sessions before restoring the previous status.
        await this.identities.state(linked, 'INACTIVE');
        if (account.state === 'ACTIVE') await this.identities.state(linked, 'ACTIVE');
        await this.prisma.$transaction(async tx => {
          await tx.erpUser.update({ where: { id }, data: { state: account.state } });
          await tx.accountResetToken.updateMany({ where: { accountId: id, usedAt: null }, data: { invalidatedAt: new Date() } });
          await tx.auditEvent.create({ data: { actorId, action: 'ADMIN_PASSWORD_RESET_BY_SUPER_ADMIN', detail: { accountId: id, state: account.state } } });
        });
        return { success: true };
      } catch (error) { this.remoteError(error); }
    });
  }
  async validateReset(token: string) {
    const reset = await this.prisma.accountResetToken.findFirst({ where: { tokenHash: tokenHash(token), usedAt: null, invalidatedAt: null, claimedAt: null, expiresAt: { gt: new Date() }, account: { deletedAt: null } }, select: { id: true } });
    if (!reset) throw new BadRequestException('Reset link is invalid, expired or already used');
    return { valid: true };
  }
  async completeReset(token: string, password: string, confirmPassword: string) {
    if (password !== confirmPassword) throw new BadRequestException('Passwords do not match');
    const reset = await this.prisma.accountResetToken.findUnique({ where: { tokenHash: tokenHash(token) } });
    if (!reset) throw new BadRequestException('Reset link is invalid, expired or already used');
    return this.locked(reset.accountId, async () => {
      const beforeReset = await this.findAdmin(reset.accountId);
      // Claim and suspend access in a committed transaction before any provider write.
      await this.prisma.$transaction(async tx => {
        const claim = await tx.accountResetToken.updateMany({ where: { id: reset.id, usedAt: null, invalidatedAt: null, claimedAt: null, expiresAt: { gt: new Date() } }, data: { claimedAt: new Date(), previousState: beforeReset.state } });
        if (claim.count !== 1) throw new BadRequestException('Reset link is invalid, expired or already used');
        await tx.erpUser.update({ where: { id: reset.accountId }, data: { state: 'INACTIVE', tokensValidAfter: new Date() } });
      });
      try {
        const account = await this.findAdmin(reset.accountId);
        await this.identities.password(account, password, async sub => { await this.prisma.erpUser.update({ where: { id: account.id }, data: { cognitoSub: sub } }); });
        const current = await this.findAdmin(reset.accountId);
        await this.identities.state(current, 'INACTIVE');
        if (beforeReset.state === 'ACTIVE') await this.identities.state(current, 'ACTIVE');
        await this.prisma.$transaction(async tx => {
          await tx.erpUser.update({ where: { id: current.id }, data: { state: beforeReset.state } });
          await tx.accountResetToken.update({ where: { id: reset.id }, data: { usedAt: new Date() } });
          await tx.auditEvent.create({ data: { actorId: reset.createdById, action: 'ACCOUNT_PASSWORD_RESET_COMPLETED', detail: { accountId: current.id } } });
        });
        return { success: true };
      } catch (error) {
        await this.prisma.auditEvent.create({ data: { actorId: reset.createdById, action: 'ACCOUNT_PASSWORD_RESET_RECOVERY_REQUIRED', detail: { accountId: reset.accountId } } });
        this.remoteError(error);
      }
    });
  }
}
