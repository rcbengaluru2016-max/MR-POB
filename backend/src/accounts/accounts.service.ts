import { BadRequestException, ConflictException, HttpException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AccountQueryDto, CreateAdminDto } from './accounts.dto';
import { CognitoAccountsService } from './cognito-accounts.service';

const accountSelect = { id: true, username: true, email: true, displayName: true, role: true, state: true, createdById: true, createdAt: true, updatedAt: true, cognitoSub: true } satisfies Prisma.ErpUserSelect;
type Account = Prisma.ErpUserGetPayload<{ select: typeof accountSelect }>;
function present({ displayName, cognitoSub, ...account }: Account) {
  return { ...account, name: displayName, provisioningRequired: !cognitoSub };
}

@Injectable()
export class AccountsService {
  constructor(private readonly prisma: PrismaService, private readonly identities: CognitoAccountsService) {}
  async create(input: CreateAdminDto, actorId: string) {
    const email = input.email.trim().toLowerCase();
    try {
      const account = await this.prisma.$transaction(async tx => {
        const duplicate = await tx.erpUser.findFirst({ where: { OR: [{ username: { equals: email, mode: 'insensitive' } }, { email: { equals: email, mode: 'insensitive' } }] }, select: { id: true } });
        if (duplicate) throw new ConflictException('An account already uses this email or username');
        // Reserve the unique login before touching Cognito. A failed/ambiguous remote
        // operation leaves this durable, inactive account available for an explicit retry.
        const created = await tx.erpUser.create({ data: { username: email, email, displayName: input.name.trim(), role: 'ADMIN', state: 'INACTIVE', createdById: actorId }, select: accountSelect });
        await tx.auditEvent.create({ data: { actorId, action: 'ADMIN_ACCOUNT_RESERVED', detail: { accountId: created.id, role: 'ADMIN' } } });
        return created;
      });
      return await this.locked(account.id, () => this.provision(account.id, input.password, input.state, actorId, 'ADMIN_ACCOUNT_CREATED'));
    } catch (error) {
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
    const account = await this.prisma.erpUser.findFirst({ where: { id, role: 'ADMIN' }, select: accountSelect });
    if (!account) throw new NotFoundException('Admin account not found');
    return account;
  }
  private async pause(id: string, actorId: string, operation: string) {
    await this.prisma.$transaction(async tx => {
      await tx.erpUser.update({ where: { id }, data: { state: 'INACTIVE' } });
      await tx.auditEvent.create({ data: { actorId, action: 'ADMIN_ACCOUNT_OPERATION_STARTED', detail: { accountId: id, operation } } });
    });
  }
  private remoteError(error: unknown): never {
    if (error instanceof HttpException) throw error;
    const name = error instanceof Error ? error.name : '';
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
      });
      if (!sub) throw new Error('Identity binding missing');
      await this.identities.state(sub, state);
      return await this.complete(id, state, actorId, action);
    } catch (error) { this.remoteError(error); }
  }
  async setPassword(id: string, password: string, actorId: string) {
    return this.locked(id, async () => {
      const account = await this.findAdmin(id);
      return this.provision(id, password, account.state, actorId, 'ADMIN_ACCOUNT_PASSWORD_SET');
    });
  }
  async list(query: AccountQueryDto) {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.erpUser.findMany({ where: { role: 'ADMIN' }, select: accountSelect, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      this.prisma.erpUser.count({ where: { role: 'ADMIN' } }),
    ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    return { items: items.map(present), total, page: query.page, pageSize: query.pageSize };
  }
  async detail(id: string) {
    const account = await this.prisma.erpUser.findFirst({ where: { id, role: 'ADMIN' }, select: accountSelect });
    if (!account) throw new NotFoundException('Admin account not found');
    return { account: present(account) };
  }
  async setState(id: string, state: 'ACTIVE' | 'INACTIVE', actorId: string) {
    return this.locked(id, async () => {
      const account = await this.findAdmin(id);
      if (!account.cognitoSub && state === 'ACTIVE') throw new BadRequestException('Set an initial password before activating this account.');
      await this.pause(id, actorId, 'STATE_CHANGE');
      try {
        if (account.cognitoSub) await this.identities.state(account.cognitoSub, state);
        return await this.complete(id, state, actorId, 'ADMIN_ACCOUNT_STATE_CHANGED');
      } catch (error) { this.remoteError(error); }
    });
  }
}
