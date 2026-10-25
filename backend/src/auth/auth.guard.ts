import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { ErpUser } from '@prisma/client';
import { AuthService } from './auth.service';

export type AuthenticatedRequest = Request & { user: ErpUser };

@Injectable()
export class CognitoGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const match = /^Bearer ([^\s]+)$/.exec(request.headers.authorization ?? '');
    if (!match) throw new UnauthorizedException('Bearer access token required');
    request.user = await this.auth.authenticate(match[1]);
    return true;
  }
}

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const user = context.switchToHttp().getRequest<AuthenticatedRequest>().user;
    if (!user || user.state !== 'ACTIVE' || !['ADMIN', 'SUPER_ADMIN'].includes(user.role)) throw new ForbiddenException('Administrator access required');
    return true;
  }
}

@Injectable()
export class SuperAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const user = context.switchToHttp().getRequest<AuthenticatedRequest>().user;
    if (!user || user.state !== 'ACTIVE' || user.role !== 'SUPER_ADMIN') throw new ForbiddenException('Super administrator access required');
    return true;
  }
}
