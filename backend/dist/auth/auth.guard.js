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
exports.SuperAdminGuard = exports.AdminGuard = exports.CognitoGuard = void 0;
const common_1 = require("@nestjs/common");
const auth_service_1 = require("./auth.service");
let CognitoGuard = class CognitoGuard {
    auth;
    constructor(auth) {
        this.auth = auth;
    }
    async canActivate(context) {
        const request = context.switchToHttp().getRequest();
        const match = /^Bearer ([^\s]+)$/.exec(request.headers.authorization ?? '');
        if (!match)
            throw new common_1.UnauthorizedException('Bearer access token required');
        request.user = await this.auth.authenticate(match[1]);
        return true;
    }
};
exports.CognitoGuard = CognitoGuard;
exports.CognitoGuard = CognitoGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [auth_service_1.AuthService])
], CognitoGuard);
let AdminGuard = class AdminGuard {
    canActivate(context) {
        const user = context.switchToHttp().getRequest().user;
        if (!user || user.state !== 'ACTIVE' || !['ADMIN', 'SUPER_ADMIN'].includes(user.role))
            throw new common_1.ForbiddenException('Administrator access required');
        return true;
    }
};
exports.AdminGuard = AdminGuard;
exports.AdminGuard = AdminGuard = __decorate([
    (0, common_1.Injectable)()
], AdminGuard);
let SuperAdminGuard = class SuperAdminGuard {
    canActivate(context) {
        const user = context.switchToHttp().getRequest().user;
        if (!user || user.state !== 'ACTIVE' || user.role !== 'SUPER_ADMIN')
            throw new common_1.ForbiddenException('Super administrator access required');
        return true;
    }
};
exports.SuperAdminGuard = SuperAdminGuard;
exports.SuperAdminGuard = SuperAdminGuard = __decorate([
    (0, common_1.Injectable)()
], SuperAdminGuard);
//# sourceMappingURL=auth.guard.js.map