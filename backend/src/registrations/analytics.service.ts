import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, RegistrationKind, RegistrationStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AnalyticsQueryDto } from './management.dto';

const day = 86_400_000;
const dateKey = (date: Date) => date.toISOString().slice(0, 10);
export function analyticsRange(query: AnalyticsQueryDto, now = new Date()) {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  let end = new Date(today.getTime() + day);
  let start: Date;
  if (query.period === 'custom') {
    const parse = (value?: string) => {
      if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new BadRequestException('Choose a valid custom date range');
      const parsed = new Date(`${value}T00:00:00.000Z`);
      if (!Number.isFinite(parsed.getTime()) || dateKey(parsed) !== value) throw new BadRequestException('Choose a valid custom date range');
      return parsed;
    };
    start = parse(query.start);
    const last = parse(query.end);
    if (start > last || last.getTime() - start.getTime() > 179 * day) throw new BadRequestException('Custom date ranges must contain 1–180 days');
    end = new Date(last.getTime() + day);
  } else {
    const days = { daily: 1, weekly: 7, monthly: 30 }[query.period];
    start = new Date(today.getTime() - (days - 1) * day);
  }
  return { start, end, previousStart: new Date(start.getTime() - (end.getTime() - start.getTime())) };
}

const statusName = { PENDING: 'pending_verification', APPROVED: 'approved', REJECTED: 'rejected' } as const;
@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}
  async dashboard(query: AnalyticsQueryDto) {
    const { start, end, previousStart } = analyticsRange(query);
    return this.prisma.$transaction(async tx => {
      const current = await tx.registration.groupBy({ by: ['kind', 'status'], where: { submittedAt: { gte: start, lt: end } }, _count: { _all: true } });
      const previous = await tx.registration.groupBy({ by: ['kind', 'status'], where: { submittedAt: { gte: previousStart, lt: start } }, _count: { _all: true } });
      const daily = await tx.$queryRaw<{ date: string; count: number }[]>(Prisma.sql`
        SELECT to_char("submittedAt"::date, 'YYYY-MM-DD') AS date, count(*)::int AS count
        FROM "Registration" WHERE "submittedAt" >= ${start} AND "submittedAt" < ${end}
        GROUP BY "submittedAt"::date ORDER BY "submittedAt"::date`);
      const recentRows = await tx.registration.findMany({ where: { submittedAt: { gte: start, lt: end } }, orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }], take: 8, select: { id: true, kind: true, status: true, submittedAt: true, email: true, customer: { select: { customerName: true } }, company: { select: { companyName: true } }, patient: { select: { patientName: true } } } });
      type Group = { kind: RegistrationKind; status: RegistrationStatus; _count: { _all: number } };
      const metrics = (groups: Group[]) => {
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
        const old = before[key as keyof typeof before];
        return [key, { value, change: old ? Math.round((value - old) / old * 100) : value ? 100 : 0 }];
      }));
      const empty = () => ({ pending_verification: 0, approved: 0, rejected: 0 });
      const byKind: Record<RegistrationKind, Record<string, number>> = { customer: empty(), company: empty(), patient: empty() };
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
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
}
