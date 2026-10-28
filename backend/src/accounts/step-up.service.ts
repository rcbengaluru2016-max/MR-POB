import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ErpUser, Prisma } from '@prisma/client';
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto';
import { AuthService } from '../auth/auth.service';
import { ConfigService } from '../config/config.service';
import { PrismaService } from '../database/prisma.service';
import { CreateAdminDto, StepUpChallengeDto, StepUpVerifyDto } from './accounts.dto';

export const tokenHash = (value: string) => createHash('sha256').update(value).digest('hex');
export const createAccountBinding = (input: CreateAdminDto) => ({ name: input.name.trim(), email: input.email.trim().toLowerCase(), role: input.role, state: input.state, password: input.password });

@Injectable()
export class StepUpService {
  constructor(private readonly prisma: PrismaService, private readonly auth: AuthService, private readonly config: ConfigService) {}
  binding(operation: string, target: unknown) {
    return createHmac('sha256', this.config.get('IDEMPOTENCY_SECRET')).update(JSON.stringify({ operation, target })).digest('hex');
  }
  private key() { return createHash('sha256').update(this.config.get('IDEMPOTENCY_SECRET')).update(':account-step-up').digest(); }
  private seal(value: string) {
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', this.key(), iv);
    return Buffer.concat([iv, cipher.update(value), cipher.final(), cipher.getAuthTag()]).toString('base64url');
  }
  private open(value: string) {
    const bytes = Buffer.from(value, 'base64url'), cipher = createDecipheriv('aes-256-gcm', this.key(), bytes.subarray(0, 12));
    cipher.setAuthTag(bytes.subarray(-16));
    return Buffer.concat([cipher.update(bytes.subarray(12, -16)), cipher.final()]).toString();
  }
  async challenge(input: StepUpChallengeDto, actor: ErpUser) {
    let target: unknown;
    if (input.operation === 'PASSWORD_RESET') {
      if (!input.targetId || input.account) throw new BadRequestException('A reset target is required');
      const account = await this.prisma.erpUser.findFirst({ where: { id: input.targetId, role: { in: ['ADMIN', 'SUPER_ADMIN'] }, deletedAt: null }, select: { id: true } });
      if (!account) throw new BadRequestException('Account not found');
      target = input.targetId;
    } else {
      if (!input.account || input.account.role !== 'SUPER_ADMIN' || input.targetId) throw new BadRequestException('Super Admin account details are required');
      target = createAccountBinding(input.account);
    }
    return this.challengeBound(actor, input.password, this.binding(input.operation, target));
  }
  async challengeBound(actor: ErpUser, password: string, binding: string, softwareOnly = false) {
    const fresh = await this.auth.startStepUp(actor, password);
    if (softwareOnly && fresh.challengeName !== 'SOFTWARE_TOKEN_MFA') throw new UnauthorizedException('Authenticator verification is required');
    const expiresAt = new Date(Date.now() + 5 * 60_000);
    const challenge = await this.prisma.accountStepUp.create({ data: {
      actorId: actor.id, binding,
      encryptedSession: this.seal(fresh.session), username: fresh.username, challengeName: fresh.challengeName, expiresAt,
    } });
    return { challengeId: challenge.id, challengeName: fresh.challengeName, expiresAt };
  }
  async verify(input: StepUpVerifyDto, actor: ErpUser, binding?: string) {
    const now = new Date();
    const claimed = await this.prisma.accountStepUp.updateMany({ where: { id: input.challengeId, actorId: actor.id, ...(binding ? { binding } : {}), expiresAt: { gt: now }, attempts: { lt: 5 }, verifiedAt: null, consumedAt: null }, data: { attempts: { increment: 1 } } });
    if (claimed.count !== 1) throw new UnauthorizedException('Invalid or expired MFA challenge');
    const challenge = await this.prisma.accountStepUp.findUniqueOrThrow({ where: { id: input.challengeId } });
    try { await this.auth.verifyStepUp(actor.id, { ...challenge, session: this.open(challenge.encryptedSession), code: input.code }); }
    catch (error) {
      await this.prisma.auditEvent.create({ data: { actorId: actor.id, action: 'ACCOUNT_STEP_UP_FAILED' } });
      throw error;
    }
    const proof = randomBytes(32).toString('base64url');
    const verified = await this.prisma.accountStepUp.updateMany({ where: { id: challenge.id, verifiedAt: null, expiresAt: { gt: new Date() } }, data: { verifiedAt: new Date(), proofHash: tokenHash(proof), encryptedSession: '', expiresAt: new Date(Date.now() + 2 * 60_000) } });
    if (verified.count !== 1) throw new UnauthorizedException('MFA challenge has already been used');
    return { stepUpProof: proof };
  }
  async consume(tx: Prisma.TransactionClient, proof: string | undefined, actorId: string, operation: string, target: unknown) {
    if (!proof) throw new UnauthorizedException('Fresh MFA authorization is required');
    const consumed = await tx.accountStepUp.updateMany({ where: { actorId, proofHash: tokenHash(proof), binding: this.binding(operation, target), verifiedAt: { not: null }, consumedAt: null, expiresAt: { gt: new Date() } }, data: { consumedAt: new Date() } });
    if (consumed.count !== 1) throw new UnauthorizedException('MFA authorization is expired, mismatched or already used');
  }
}
