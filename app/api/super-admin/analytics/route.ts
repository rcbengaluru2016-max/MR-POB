import { NextResponse } from "next/server";
import type { RegistrationRecord, RegistrationStatus } from "@/lib/types";
import { getStore } from "@/lib/server/store";
import { isSuperAdminReady } from "@/lib/server/super-admin";

const kinds = ["customer", "mr", "patient"] as const;
const statuses: RegistrationStatus[] = ["pending_verification", "approved", "rejected"];

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function inRange(record: RegistrationRecord, start: Date, endExclusive: Date) {
  const submitted = Date.parse(record.submittedAt);
  return Number.isFinite(submitted) && submitted >= start.getTime() && submitted < endExclusive.getTime();
}

function count(records: RegistrationRecord[], predicate: (record: RegistrationRecord) => boolean) {
  return records.filter(predicate).length;
}

function percentChange(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : 100;
  return Math.round(((current - previous) / previous) * 100);
}

export async function GET(request: Request) {
  if (!(await isSuperAdminReady())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  const period = params.get("period") ?? "monthly";
  const today = new Date();
  const todayStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const end = new Date(todayStart.getTime() + 86_400_000);
  let start: Date;

  if (period === "custom") {
    const from = params.get("start");
    const through = params.get("end");
    if (!from || !through || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(through)) {
      return NextResponse.json({ error: "Choose a valid custom date range." }, { status: 400 });
    }
    start = new Date(`${from}T00:00:00.000Z`);
    const lastDay = new Date(`${through}T00:00:00.000Z`);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(lastDay.getTime()) || dateKey(start) !== from || dateKey(lastDay) !== through || start > lastDay) {
      return NextResponse.json({ error: "Choose a valid custom date range." }, { status: 400 });
    }
    if ((lastDay.getTime() - start.getTime()) / 86_400_000 > 179) {
      return NextResponse.json({ error: "Custom date ranges must be 180 days or shorter." }, { status: 400 });
    }
    end.setTime(lastDay.getTime() + 86_400_000);
  } else {
    const days = period === "daily" ? 1 : period === "weekly" ? 7 : period === "monthly" ? 30 : 0;
    if (!days) return NextResponse.json({ error: "Invalid date filter." }, { status: 400 });
    start = new Date(todayStart.getTime() - (days - 1) * 86_400_000);
  }

  const duration = end.getTime() - start.getTime();
  const previousEnd = start;
  const previousStart = new Date(previousEnd.getTime() - duration);
  const store = await getStore();
  const current = store.registrations.filter((record) => inRange(record, start, end));
  const previous = store.registrations.filter((record) => inRange(record, previousStart, previousEnd));
  const metrics = {
    total: (records: RegistrationRecord[]) => records.length,
    customer: (records: RegistrationRecord[]) => count(records, (record) => record.kind === "customer"),
    mr: (records: RegistrationRecord[]) => count(records, (record) => record.kind === "mr"),
    patient: (records: RegistrationRecord[]) => count(records, (record) => record.kind === "patient"),
    pending: (records: RegistrationRecord[]) => count(records, (record) => record.status === "pending_verification"),
    approved: (records: RegistrationRecord[]) => count(records, (record) => record.status === "approved"),
    rejected: (records: RegistrationRecord[]) => count(records, (record) => record.status === "rejected"),
  };
  const kpis = Object.fromEntries(
    Object.entries(metrics).map(([key, calculate]) => {
      const currentValue = calculate(current);
      return [key, { value: currentValue, change: percentChange(currentValue, calculate(previous)) }];
    }),
  );

  const byKind = Object.fromEntries(kinds.map((kind) => [
    kind,
    Object.fromEntries(statuses.map((status) => [
      status,
      count(current, (record) => record.kind === kind && record.status === status),
    ])),
  ]));
  const categoryShare = Object.fromEntries(kinds.map((kind) => [
    kind,
    count(current, (record) => record.kind === kind),
  ]));
  const statusShare = Object.fromEntries(statuses.map((status) => [
    status,
    count(current, (record) => record.status === status),
  ]));

  const dayTotals = new Map<string, number>();
  for (const item of current) {
    const key = dateKey(new Date(item.submittedAt));
    dayTotals.set(key, (dayTotals.get(key) ?? 0) + 1);
  }
  const trend = Array.from({ length: Math.ceil(duration / 86_400_000) }, (_, index) => {
    const day = new Date(start.getTime() + index * 86_400_000);
    const key = dateKey(day);
    return { date: key, count: dayTotals.get(key) ?? 0 };
  });

  const recent = [...current]
    .sort((left, right) => right.submittedAt.localeCompare(left.submittedAt))
    .slice(0, 8)
    .map((record) => ({
      id: record.id,
      kind: record.kind,
      status: record.status,
      submittedAt: record.submittedAt,
      name: record.kind === "customer" ? record.customerName : record.kind === "mr" ? record.mrName : record.patientName,
      email: record.email || "",
    }));

  return NextResponse.json({
    period,
    range: { start: dateKey(start), end: dateKey(new Date(end.getTime() - 1)) },
    kpis,
    byKind,
    categoryShare,
    statusShare,
    trend,
    recent,
  });
}
