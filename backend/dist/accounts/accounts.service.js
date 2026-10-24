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
exports.AccountsService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../database/prisma.service");
const cognito_accounts_service_1 = require("./cognito-accounts.service");
const accountSelect = { id: true, username: true, email: true, displayName: true, role: true, state: true, createdById: true, createdAt: true, updatedAt: true, cognitoSub: true };
function present({ displayName, cognitoSub, ...account }) {
    return { ...account, name: displayName, provisioningRequired: !cognitoSub };
}
let AccountsService = class AccountsService {
    prisma;
    identities;
    constructor(prisma, identities) {
        this.prisma = prisma;
        this.identities = identities;
    }
    async create(input, actorId) {
        const email = input.email.trim().toLowerCase();
        try {
            const account = await this.prisma.$transaction(async (tx) => {
                const duplicate = await tx.erpUser.findFirst({ where: { OR: [{ username: { equals: email, mode: 'insensitive' } }, { email: { equals: email, mode: 'insensitive' } }] }, select: { id: true } });
                if (duplicate)
                    throw new common_1.ConflictException('An account already uses this email or username');
                // Reserve the unique login before touching Cognito. A failed/ambiguous remote
                // operation leaves this durable, inactive account available for an explicit retry.
                const created = await tx.erpUser.create({ data: { username: email, email, displayName: input.name.trim(), role: 'ADMIN', state: 'INACTIVE', createdById: actorId }, select: accountSelect });
                await tx.auditEvent.create({ data: { actorId, action: 'ADMIN_ACCOUNT_RESERVED', detail: { accountId: created.id, role: 'ADMIN' } } });
                return created;
            });
            return await this.locked(account.id, () => this.provision(account.id, input.password, input.state, actorId, 'ADMIN_ACCOUNT_CREATED'));
        }
        catch (error) {
            if (error instanceof client_1.Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
                throw new common_1.ConflictException('An account already uses this email or username');
            throw error;
        }
    }
    // A transaction-scoped PostgreSQL advisory lock serializes operations across
    // backend instances. Business writes use independent committed transactions:
    // INACTIVE must be visible to JWT authorization before any remote operation.
    // A process crash releases the lock but cannot undo that access restriction.
    locked(id, action) {
        return this.prisma.$transaction(async (tx) => {
            await tx.$queryRaw `SELECT 1::int FROM pg_advisory_xact_lock(hashtextextended(${id}, 0))`;
            return action();
        }, { maxWait: 5_000, timeout: 45_000 });
    }
    async findAdmin(id) {
        const account = await this.prisma.erpUser.findFirst({ where: { id, role: 'ADMIN' }, select: accountSelect });
        if (!account)
            throw new common_1.NotFoundException('Admin account not found');
        return account;
    }
    async pause(id, actorId, operation) {
        await this.prisma.$transaction(async (tx) => {
            await tx.erpUser.update({ where: { id }, data: { state: 'INACTIVE' } });
            await tx.auditEvent.create({ data: { actorId, action: 'ADMIN_ACCOUNT_OPERATION_STARTED', detail: { accountId: id, operation } } });
        });
    }
    remoteError(error) {
        if (error instanceof common_1.HttpException)
            throw error;
        const name = error instanceof Error ? error.name : '';
        if (['InvalidPasswordException', 'PasswordHistoryPolicyViolationException'].includes(name))
            throw new common_1.BadRequestException('The password does not meet the authentication provider policy. The account remains inactive; reset its password to retry.');
        if (['UsernameExistsException', 'AliasExistsException'].includes(name))
            throw new common_1.ConflictException('This login already exists in the authentication provider. The ERP account remains inactive; contact the administrator.');
        throw new common_1.ServiceUnavailableException('Account setup could not be completed. The account remains inactive. Refresh Users & Accounts, then set/reset its password to retry. Check Cognito configuration and backend AWS credentials.');
    }
    async complete(id, state, actorId, action) {
        return this.prisma.$transaction(async (tx) => {
            const account = await tx.erpUser.update({ where: { id }, data: { state }, select: accountSelect });
            await tx.auditEvent.create({ data: { actorId, action, detail: { accountId: id, state } } });
            return { account: present(account) };
        });
    }
    async provision(id, password, state, actorId, action) {
        const account = await this.findAdmin(id);
        await this.pause(id, actorId, action);
        try {
            let sub = account.cognitoSub;
            await this.identities.password(account, password, async (subject) => {
                await this.prisma.erpUser.update({ where: { id }, data: { cognitoSub: subject } });
                sub = subject;
            });
            if (!sub)
                throw new Error('Identity binding missing');
            await this.identities.state(sub, state);
            return await this.complete(id, state, actorId, action);
        }
        catch (error) {
            this.remoteError(error);
        }
    }
    async setPassword(id, password, actorId) {
        return this.locked(id, async () => {
            const account = await this.findAdmin(id);
            return this.provision(id, password, account.state, actorId, 'ADMIN_ACCOUNT_PASSWORD_SET');
        });
    }
    async list(query) {
        const [items, total] = await this.prisma.$transaction([
            this.prisma.erpUser.findMany({ where: { role: 'ADMIN' }, select: accountSelect, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
            this.prisma.erpUser.count({ where: { role: 'ADMIN' } }),
        ], { isolationLevel: client_1.Prisma.TransactionIsolationLevel.RepeatableRead });
        return { items: items.map(present), total, page: query.page, pageSize: query.pageSize };
    }
    async detail(id) {
        const account = await this.prisma.erpUser.findFirst({ where: { id, role: 'ADMIN' }, select: accountSelect });
        if (!account)
            throw new common_1.NotFoundException('Admin account not found');
        return { account: present(account) };
    }
    async setState(id, state, actorId) {
        return this.locked(id, async () => {
            const account = await this.findAdmin(id);
            if (!account.cognitoSub && state === 'ACTIVE')
                throw new common_1.BadRequestException('Set an initial password before activating this account.');
            await this.pause(id, actorId, 'STATE_CHANGE');
            try {
                if (account.cognitoSub)
                    await this.identities.state(account.cognitoSub, state);
                return await this.complete(id, state, actorId, 'ADMIN_ACCOUNT_STATE_CHANGED');
            }
            catch (error) {
                this.remoteError(error);
            }
        });
    }
};
exports.AccountsService = AccountsService;
exports.AccountsService = AccountsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, cognito_accounts_service_1.CognitoAccountsService])
], AccountsService);
//# sourceMappingURL=accounts.service.js.map