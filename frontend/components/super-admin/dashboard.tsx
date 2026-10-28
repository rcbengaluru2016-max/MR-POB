"use client";

import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDateTime } from "@/lib/utils";

type Kind = "customer" | "company" | "patient";
type Status = "pending_verification" | "approved" | "rejected";
type Summary = {
  period: string;
  range: { start: string; end: string };
  kpis: Record<string, { value: number; change: number }>;
  byKind: Record<Kind, Record<Status, number>>;
  categoryShare: Record<Kind, number>;
  statusShare: Record<Status, number>;
  trend: { date: string; count: number }[];
  recent: { id: string; kind: Kind; name: string; status: string; submittedAt: string; email: string }[];
};

const kindLabels: Record<Kind, string> = { customer: "Customer", company: "Company", patient: "Patient" };
const statusLabels: Record<Status, string> = {
  pending_verification: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};
const statusColors: Record<Status, string> = {
  pending_verification: "#d97706",
  approved: "#15803d",
  rejected: "#dc2626",
};
const metricLabels: Record<string, string> = {
  total: "Total Registrations",
  customer: "Customer Registrations",
  company: "Company Registrations",
  patient: "Patient Registrations",
  pending: "Pending Registrations",
  approved: "Approved Registrations",
  rejected: "Rejected Registrations",
};

export function SuperAdminDashboard({ basePath = "/super-admin" }: { basePath?: string }) {
  const [period, setPeriod] = useState("monthly");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [view, setView] = useState<"bar" | "pie">("bar");
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ key: string; data: Summary | null; error: string } | null>(null);
  const incompleteCustomRange = period === "custom" && (!startDate || !endDate);
  const query = new URLSearchParams({ period });
  if (period === "custom") {
    query.set("start", startDate);
    query.set("end", endDate);
  }
  const queryString = query.toString();
  const requestKey = `${queryString}:${attempt}`;
  const data = result?.key === requestKey ? result.data : null;
  const error = result?.key === requestKey ? result.error : "";
  const loading = !incompleteCustomRange && result?.key !== requestKey;

  useEffect(() => {
    const controller = new AbortController();
    if (incompleteCustomRange) {
      return () => controller.abort();
    }

    fetch(`/api/super-admin/analytics?${queryString}`, { signal: controller.signal })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Unable to load analytics.");
        return result as Summary;
      })
      .then((data) => {
        if (!controller.signal.aborted) setResult({ key: requestKey, data, error: "" });
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted || (reason instanceof DOMException && reason.name === "AbortError")) return;
        setResult({ key: requestKey, data: null, error: reason instanceof Error ? reason.message : "Unable to load analytics." });
      });
    return () => controller.abort();
  }, [queryString, requestKey, incompleteCustomRange]);

  const chartTotal = useMemo(
    () => data ? Object.values(data.categoryShare).reduce((sum, value) => sum + value, 0) : 0,
    [data],
  );

  return (
    <div className="space-y-7">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">Dashboard</h1>
          <p className="mt-1 text-sm text-muted">Registration activity and verification status across all user categories.</p>
        </div>
        <div className="flex w-full flex-wrap items-end gap-3 sm:w-auto">
          <label className="grid min-w-36 flex-1 gap-1.5 text-xs font-semibold text-muted sm:flex-none">
            Date range
          <span className="relative">
          <select value={period} onChange={(event) => setPeriod(event.target.value)} className="h-10 w-full appearance-none rounded-xl border border-line bg-white py-2 pl-3 pr-10 text-sm font-medium text-foreground shadow-sm outline-none transition hover:border-slate-400 focus:border-brand focus:ring-4 focus:ring-brand/10 sm:min-w-40">
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="custom">Custom</option>
            </select>
            <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          </span>
          </label>
          {period === "custom" ? (
            <>
              <label className="grid min-w-36 flex-1 gap-1.5 text-xs font-semibold text-muted sm:flex-none">From<input type="date" max={endDate || undefined} value={startDate} onChange={(event) => setStartDate(event.target.value)} className="h-10 w-full rounded-xl border border-line bg-white px-3 text-sm font-medium text-foreground shadow-sm outline-none transition hover:border-slate-400 focus:border-brand focus:ring-4 focus:ring-brand/10" /></label>
              <label className="grid min-w-36 flex-1 gap-1.5 text-xs font-semibold text-muted sm:flex-none">To<input type="date" min={startDate || undefined} value={endDate} onChange={(event) => setEndDate(event.target.value)} className="h-10 w-full rounded-xl border border-line bg-white px-3 text-sm font-medium text-foreground shadow-sm outline-none transition hover:border-slate-400 focus:border-brand focus:ring-4 focus:ring-brand/10" /></label>
            </>
          ) : null}
        </div>
      </header>

      {incompleteCustomRange ? <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800" role="status">Choose a start and end date to view custom analytics.</p> : error ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-danger" role="alert"><p>{error}</p><button type="button" onClick={() => setAttempt((value) => value + 1)} className="rounded-lg border border-red-300 px-3 py-1.5 font-semibold hover:bg-red-100">Retry</button></div> : null}
      {loading ? <p className="text-sm text-muted" role="status">Loading registration analytics…</p> : null}

      {data && !loading && !error && !incompleteCustomRange ? (
        <>
          <section aria-label="Registration KPIs" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Object.entries(metricLabels).map(([key, label]) => {
              const metric = data.kpis[key];
              const change = metric?.change ?? 0;
              const changeColor = change > 0
                ? "text-success"
                : change < 0
                  ? "text-danger"
                  : "text-slate-400";
              return (
                <article key={key} className="rounded-2xl border border-line bg-white p-4 shadow-sm sm:p-5">
                  <p className="text-sm text-muted">{label}</p>
                  <p className="mt-2 text-3xl font-semibold text-foreground">{metric?.value ?? 0}</p>
                  <p className={`mt-1 text-xs ${changeColor}`}>{change > 0 ? "+" : ""}{change}% vs previous period</p>
                </article>
              );
            })}
          </section>

          <section className="grid gap-4 xl:grid-cols-2">
            <article className="rounded-2xl border border-line bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-foreground">Registrations by category and status</h2>
                  <p className="mt-1 text-xs text-muted">{data.range.start} – {data.range.end}</p>
                </div>
                <div className="inline-flex rounded-lg border border-line p-1" role="group" aria-label="Chart view">
                  {(["bar", "pie"] as const).map((mode) => <button key={mode} type="button" onClick={() => setView(mode)} aria-pressed={view === mode} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${view === mode ? "bg-brand text-white" : "text-muted hover:bg-background"}`}>{mode === "bar" ? "Bar chart" : "Pie chart"}</button>)}
                </div>
              </div>
              {view === "bar" ? <CategoryBarChart data={data} /> : <CategoryPieChart data={data} total={chartTotal} />}
              {view === "bar" ? <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
                {(Object.keys(statusLabels) as Status[]).map((status) => <Legend key={status} color={statusColors[status]} label={statusLabels[status]} />)}
              </div> : null}
            </article>

            <article className="rounded-2xl border border-line bg-white p-5 shadow-sm">
              <h2 className="font-semibold text-foreground">Registration trend</h2>
              <p className="mt-1 text-xs text-muted">Daily registrations during the selected period</p>
              <TrendChart points={data.trend} />
            </article>
          </section>

          <section className="grid gap-4 xl:grid-cols-3">
            <article className="flex h-[360px] flex-col rounded-2xl border border-line bg-white p-5 shadow-sm xl:col-span-1">
              <h2 className="font-semibold text-foreground">Status distribution</h2>
              <div className="mt-5 space-y-4 overflow-y-auto pr-1">
                {(Object.keys(statusLabels) as Status[]).map((status) => {
                  const count = data.statusShare[status] ?? 0;
                  const percent = chartTotal ? Math.round((count / chartTotal) * 100) : 0;
                  return <div key={status}><div className="mb-1 flex justify-between text-sm"><span>{statusLabels[status]}</span><span className="text-muted">{count} · {percent}%</span></div><div className="h-2 overflow-hidden rounded-full bg-background"><div className="h-full rounded-full" style={{ width: `${percent}%`, backgroundColor: statusColors[status] }} /></div></div>;
                })}
              </div>
            </article>
            <article className="flex h-[360px] min-w-0 flex-col rounded-2xl border border-line bg-white p-5 shadow-sm xl:col-span-2">
              <div className="shrink-0"><h2 className="font-semibold text-foreground">Recent registrations</h2></div>
              <div className="mt-4 min-h-0 flex-1 overflow-auto">
                <table className="min-w-[620px] w-full text-left text-sm">
                  <thead className="sticky top-0 bg-white text-xs uppercase text-muted"><tr><th className="pb-2 pr-3">Name</th><th className="pb-2 pr-3">Category</th><th className="pb-2 pr-3">Date</th><th className="pb-2 pr-3">Status</th><th className="pb-2">Action</th></tr></thead>
                  <tbody>{data.recent.map((item) => <tr key={item.id} className="border-t border-line"><td className="py-2.5 pr-3"><span className="font-medium">{item.name}</span><span className="block text-xs text-muted">{item.email || "No email provided"}</span></td><td className="py-2.5 pr-3">{kindLabels[item.kind]}</td><td className="whitespace-nowrap py-2.5 pr-3">{formatDateTime(item.submittedAt)}</td><td className="py-2.5 pr-3"><StatusBadge value={item.status} /></td><td className="py-2.5"><Link href={item.status === "approved" ? `${basePath}/registrations/${item.kind}/${encodeURIComponent(item.id)}` : `${basePath}/approvals/${item.kind}/${encodeURIComponent(item.id)}`} className="inline-flex min-h-8 items-center rounded-lg border border-line px-3 text-xs font-semibold text-foreground hover:border-brand hover:text-brand">View</Link></td></tr>)}
                  {!data.recent.length ? <tr><td colSpan={5} className="py-8 text-center text-muted">No registrations in this period.</td></tr> : null}</tbody>
                </table>
              </div>
            </article>
          </section>
        </>
      ) : null}
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return <span className="inline-flex items-center gap-2 text-xs text-muted"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />{label}</span>;
}

function CategoryBarChart({ data }: { data: Summary }) {
  const max = Math.max(1, ...Object.values(data.byKind).map((counts) => Object.values(counts).reduce((sum, value) => sum + value, 0)));
  const statuses = Object.keys(statusLabels) as Status[];
  const [active, setActive] = useState<{ kind: Kind; status: Status; count: number; x: number; y: number } | null>(null);
  return <svg role="group" aria-label="Interactive bar chart comparing registration counts by category and status" viewBox="0 0 600 250" preserveAspectRatio="xMidYMid meet" className="mt-5 h-56 w-full touch-pan-y">
    <defs><linearGradient id="bar-tooltip" x1="0" x2="1"><stop offset="0%" stopColor="#17243b"/><stop offset="100%" stopColor="#253b62"/></linearGradient></defs>
    {[0, 1, 2, 3].map((line) => <line key={line} x1="48" x2="590" y1={205 - line * 58} y2={205 - line * 58} stroke="#dce3ed" strokeDasharray="4 5" />)}
    {(Object.keys(kindLabels) as Kind[]).map((kind, index) => {
      let offset = 0;
      const x = 125 + index * 175;
      const total = Object.values(data.byKind[kind]).reduce((sum, value) => sum + value, 0);
      return <g key={kind}>
        {statuses.map((status) => {
          const count = data.byKind[kind][status] ?? 0;
          const height = (count / max) * 174;
          const y = 205 - offset - height;
          offset += height;
          const selected = active?.kind === kind && active.status === status;
          return <rect key={status} x={x} y={y} width="66" height={Math.max(0, height)} fill={statusColors[status]} rx="4" opacity={active && !selected ? 0.42 : 1} className="cursor-pointer outline-none transition-opacity duration-200 hover:brightness-110 focus-visible:stroke-slate-900 focus-visible:stroke-2" tabIndex={0} role="button" aria-label={`${kindLabels[kind]} ${statusLabels[status]}: ${count}`} onPointerEnter={() => setActive({ kind, status, count, x: x + 33, y: Math.max(30, y - 8) })} onPointerLeave={() => setActive(null)} onFocus={() => setActive({ kind, status, count, x: x + 33, y: Math.max(30, y - 8) })} onBlur={() => setActive(null)} onClick={() => setActive((current) => current?.kind === kind && current.status === status ? null : { kind, status, count, x: x + 33, y: Math.max(30, y - 8) })} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setActive((current) => current?.kind === kind && current.status === status ? null : { kind, status, count, x: x + 33, y: Math.max(30, y - 8) }); } }}>
            <title>{kindLabels[kind]} · {statusLabels[status]} · {count} registrations</title>
          </rect>;
        })}
        <text x={x + 33} y="228" textAnchor="middle" fill="#17243b" fontSize="13">{kindLabels[kind]}</text>
        <text x={x + 33} y={Math.max(20, 194 - (total / max) * 174)} textAnchor="middle" fill="#17243b" fontSize="12">{total}</text>
      </g>;
    })}
    {active ? <g pointerEvents="none" className="animate-in fade-in duration-150"><rect x={Math.min(465, Math.max(8, active.x - 68))} y={active.y < 60 ? active.y + 10 : active.y - 56} width="136" height="48" rx="8" fill="url(#bar-tooltip)"/><text x={Math.min(465, Math.max(8, active.x - 68)) + 10} y={active.y < 60 ? active.y + 28 : active.y - 38} fill="white" fontSize="11" fontWeight="600">{kindLabels[active.kind]} · {statusLabels[active.status]}</text><text x={Math.min(465, Math.max(8, active.x - 68)) + 10} y={active.y < 60 ? active.y + 44 : active.y - 22} fill="#dbeafe" fontSize="11">{active.count} registrations</text></g> : null}
  </svg>;
}

function CategoryPieChart({ data, total }: { data: Summary; total: number }) {
  const colors: Record<Kind, string> = { customer: "#123daa", company: "#e51b23", patient: "#7389c4" };
  const [active, setActive] = useState<Kind | null>(null);
  let angle = -90;
  const slices = (Object.keys(kindLabels) as Kind[]).map((kind) => {
    const value = data.categoryShare[kind] ?? 0;
    const sweep = total ? (value / total) * 360 : 0;
    const start = angle;
    angle += sweep;
    const point = (degrees: number) => ({ x: 110 + 82 * Math.cos((degrees * Math.PI) / 180), y: 110 + 82 * Math.sin((degrees * Math.PI) / 180) });
    const from = point(start);
    const to = point(start + sweep);
    const path = sweep >= 359.99
      ? `M 110 28 A 82 82 0 1 1 109.99 28 L 110 110 Z`
      : `M 110 110 L ${from.x} ${from.y} A 82 82 0 ${sweep > 180 ? 1 : 0} 1 ${to.x} ${to.y} Z`;
    return { kind, value, sweep, path };
  });
  return <div className="flex min-h-56 flex-wrap items-center justify-center gap-6 py-4 sm:gap-8">
    <svg role="group" aria-label="Interactive pie chart showing registration share by category" viewBox="0 0 220 220" className="h-44 w-44 shrink-0 touch-pan-y">
      {slices.map(({ kind, value, path }) => <path key={kind} d={path} fill={colors[kind]} stroke="white" strokeWidth="2" opacity={active && active !== kind ? 0.42 : 1} className="cursor-pointer transition-all duration-200 hover:brightness-110 focus-visible:stroke-slate-900 focus-visible:stroke-[3px]" tabIndex={0} role="button" aria-label={`${kindLabels[kind]}: ${value} registrations`} onPointerEnter={() => setActive(kind)} onPointerLeave={() => setActive(null)} onFocus={() => setActive(kind)} onBlur={() => setActive(null)} onClick={() => setActive((current) => current === kind ? null : kind)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setActive((current) => current === kind ? null : kind); } }}><title>{kindLabels[kind]}: {value} registrations ({total ? Math.round((value / total) * 100) : 0}%)</title></path>)}
      <circle cx="110" cy="110" r="43" fill="white" pointerEvents="none" />
      <text x="110" y="106" textAnchor="middle" fill="#17243b" fontSize="12" fontWeight="600" pointerEvents="none">{active ? kindLabels[active] : "Total"}</text>
      <text x="110" y="124" textAnchor="middle" fill="#64748b" fontSize="13" pointerEvents="none">{active ? data.categoryShare[active] : total}</text>
    </svg>
    <div className="grid gap-3">{(Object.keys(kindLabels) as Kind[]).map((kind) => <button type="button" key={kind} onPointerEnter={() => setActive(kind)} onPointerLeave={() => setActive(null)} onFocus={() => setActive(kind)} onBlur={() => setActive(null)} onClick={() => setActive((current) => current === kind ? null : kind)} aria-pressed={active === kind} className={`flex items-center gap-2 rounded-md text-left text-xs transition-colors ${active === kind ? "text-foreground" : "text-muted hover:text-foreground"}`}><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colors[kind] }} />{kindLabels[kind]} · {data.categoryShare[kind]} ({total ? Math.round((data.categoryShare[kind] / total) * 100) : 0}%)</button>)}</div>
  </div>;
}

function TrendChart({ points }: { points: Summary["trend"] }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const max = Math.max(1, ...points.map((point) => point.count));
  const width = 600;
  const height = 230;
  const coordinates = points.map((point, index) => {
    const x = points.length <= 1 ? width / 2 : 45 + (index * (width - 70)) / (points.length - 1);
    const count = Number.isFinite(point.count) ? Math.max(0, point.count) : 0;
    const y = 190 - (count / max) * 155;
    return { x, y, point: { ...point, count } };
  });
  const pointsString = coordinates.map(({ x, y }) => `${x},${y}`).join(" ");
  const active = activeIndex === null ? null : coordinates[activeIndex];
  return <svg role="group" aria-label="Interactive line chart showing registrations over time" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" className="mt-5 h-56 w-full touch-pan-y">
    <defs><linearGradient id="trend-area" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#123daa" stopOpacity="0.18"/><stop offset="100%" stopColor="#123daa" stopOpacity="0.01"/></linearGradient></defs>
    {[0, 1, 2, 3].map((line) => <line key={line} x1="42" x2="590" y1={190 - line * 50} y2={190 - line * 50} stroke="#dce3ed" strokeDasharray="4 5" />)}
    {points.length > 1 ? <polygon points={`45,190 ${pointsString} ${coordinates[coordinates.length - 1]?.x ?? 45},190`} fill="url(#trend-area)" className="transition-opacity duration-300" /> : null}
    {points.length > 1 ? <polyline points={pointsString} fill="none" stroke="#123daa" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" className="transition-all duration-300" /> : null}
    {coordinates.map(({ x, y, point }, index) => <g key={point.date} onPointerEnter={() => setActiveIndex(index)} onPointerLeave={() => setActiveIndex(null)} onFocus={() => setActiveIndex(index)} onBlur={() => setActiveIndex(null)} onClick={() => setActiveIndex((current) => current === index ? null : index)} className="cursor-pointer outline-none">
      <circle cx={x} cy={y} r="13" fill="transparent" tabIndex={0} role="button" aria-label={`${point.date}: ${point.count} registrations`} />
      <circle cx={x} cy={y} r={activeIndex === index ? 6 : 3.5} fill="white" stroke="#123daa" strokeWidth={activeIndex === index ? 3 : 2} className="pointer-events-none transition-all duration-200"><title>{point.date}: {point.count} registrations</title></circle>
    </g>)}
    {active ? <g pointerEvents="none"><rect x={Math.min(width - 128, Math.max(4, active.x - 62))} y={active.y < 60 ? active.y + 14 : active.y - 50} width="124" height="42" rx="8" fill="#17243b"/><text x={Math.min(width - 128, Math.max(4, active.x - 62)) + 10} y={active.y < 60 ? active.y + 31 : active.y - 33} fill="white" fontSize="10" fontWeight="600">{active.point.date}</text><text x={Math.min(width - 128, Math.max(4, active.x - 62)) + 10} y={active.y < 60 ? active.y + 46 : active.y - 17} fill="#dbeafe" fontSize="10">{active.point.count} registrations</text></g> : null}
    <text x="45" y="218" fill="#64748b" fontSize="11">{points[0]?.date ?? ""}</text>
    <text x="590" y="218" textAnchor="end" fill="#64748b" fontSize="11">{points[points.length - 1]?.date ?? ""}</text>
  </svg>;
}
