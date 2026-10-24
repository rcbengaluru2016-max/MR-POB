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
exports.AnalyticsService = void 0;
exports.analyticsRange = analyticsRange;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../database/prisma.service");
const day = 86_400_000;
const dateKey = (date) => date.toISOString().slice(0, 10);
function analyticsRange(query, now = new Date()) {
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    let end = new Date(today.getTime() + day);
    let start;
    if (query.period === 'custom') {
        const parse = (value) => {
            if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value))
                throw new common_1.BadRequestException('Choose a valid custom date range');
            const parsed = new Date(`${value}T00:00:00.000Z`);
            if (!Number.isFinite(parsed.getTime()) || dateKey(parsed) !== value)
                throw new common_1.BadRequestException('Choose a valid custom date range');
            return parsed;
        };
        start = parse(query.start);
        const last = parse(query.end);
        if (start > last || last.getTime() - start.getTime() > 179 * day)
            throw new common_1.BadRequestException('Custom date ranges must contain 1–180 days');
        end = new Date(last.getTime() + day);
    }
    else {
        const days = { daily: 1, weekly: 7, monthly: 30 }[query.period];
        start = new Date(today.getTime() - (days - 1) * day);
    }
    return { start, end, previousStart: new Date(start.getTime() - (end.getTime() - start.getTime())) };
}
const statusName = { PENDING: 'pending_verification', APPROVED: 'approved', REJECTED: 'rejected' };
let AnalyticsService = class AnalyticsService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async dashboard(query) {
        const { start, end, previousStart } = analyticsRange(query);
        return this.prisma.$transaction(async (tx) => {
            const current = await tx.registration.groupBy({ by: ['kind', 'status'], where: { submittedAt: { gte: start, lt: end } }, _count: { _all: true } });
            const previous = await tx.registration.groupBy({ by: ['kind', 'status'], where: { submittedAt: { gte: previousStart, lt: start } }, _count: { _all: true } });
            const daily = await tx.$queryRaw(client_1.Prisma.sql `
        SELECT to_char("submittedAt"::date, 'YYYY-MM-DD') AS date, count(*)::int AS count
        FROM "Registration" WHERE "submittedAt" >= ${start} AND "submittedAt" < ${end}
        GROUP BY "submittedAt"::date ORDER BY "submittedAt"::date`);
            const recentRows = await tx.registration.findMany({ where: { submittedAt: { gte: start, lt: end } }, orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }], take: 8, select: { id: true, kind: true, status: true, submittedAt: true, email: true, customer: { select: { customerName: true } }, company: { select: { companyName: true } }, patient: { select: { patientName: true } } } });
            const metrics = (groups) => {
                const result = { total: 0, customer: 0, company: 0, patient: 0, pending: 0, approved: 0, rejected: 0 };
                for (const row of groups) {
                    result.total += row._count._all;
                    result[row.kind] += row._count._all;
                    result[row.status === 'PENDING' ? 'pending' : row.status === 'APPROVED' ? 'approved' : 'rejected'] += row._count._all;
                }
                return result;
            };
            const values = metrics(current), before = metrics(previous);
            const kpis = Object.fromEntries(Object.entries(values).map(([key, value]) => {
                const old = before[key];
                return [key, { value, change: old ? Math.round((value - old) / old * 100) : value ? 100 : 0 }];
            }));
            const empty = () => ({ pending_verification: 0, approved: 0, rejected: 0 });
            const byKind = { customer: empty(), company: empty(), patient: empty() };
            const statusShare = { pending_verification: 0, approved: 0, rejected: 0 };
            for (const row of current) {
                byKind[row.kind][statusName[row.status]] = row._count._all;
                statusShare[statusName[row.status]] += row._count._all;
            }
            const totals = new Map(daily.map(item => [item.date, item.count]));
            const trend = Array.from({ length: (end.getTime() - start.getTime()) / day }, (_, i) => {
                const date = dateKey(new Date(start.getTime() + i * day));
                return { date, count: totals.get(date) ?? 0 };
            });
            return { period: query.period, range: { start: dateKey(start), end: dateKey(new Date(end.getTime() - 1)) }, kpis, byKind,
                categoryShare: { customer: values.customer, company: values.company, patient: values.patient }, statusShare, trend,
                recent: recentRows.map(row => ({ id: row.id, kind: row.kind, status: statusName[row.status], submittedAt: row.submittedAt, name: row.customer?.customerName ?? row.company?.companyName ?? row.patient?.patientName ?? '', email: row.email ?? '' })) };
        }, { isolationLevel: client_1.Prisma.TransactionIsolationLevel.RepeatableRead });
    }
};
exports.AnalyticsService = AnalyticsService;
exports.AnalyticsService = AnalyticsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], AnalyticsService);
//# sourceMappingURL=analytics.service.js.map