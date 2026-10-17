"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Employee = { id: string; designation: string; createdAt: string; reportingManagerId?: string; status?: "active" | "inactive" };
type Range = "30" | "90" | "365" | "all";
type Stats = { totalEmployees: number; totalMrs: number; totalProducts: number; totalOrders: number; ordersPendingCustomerApproval: number; ordersPendingBilling: number; completedOrders: number };

function withinRange(date: string, range: Range, now: number) {
  return range === "all" || new Date(date).getTime() >= now - Number(range) * 24 * 60 * 60 * 1000;
}

export function CompanyDashboard() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [range, setRange] = useState<Range>("30");
  const [chartType, setChartType] = useState<"bar" | "pie">("bar");
  const [error, setError] = useState("");
  const [stats, setStats] = useState<Stats | null>(null);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    let active = true;
    fetch("/api/company/employees", { cache: "no-store" }).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load company analytics.");
      if (active) setEmployees(data.employees);
    }).catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Unable to load company analytics."); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    fetch(`/api/company/analytics?range=${range}`, { cache: "no-store" }).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load company analytics.");
      if (active) setStats(data.stats as Stats);
    }).catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Unable to load company analytics."); });
    return () => { active = false; };
  }, [range]);

  const filtered = useMemo(() => employees.filter((employee) => employee.status !== "inactive" && withinRange(employee.createdAt, range, now)), [employees, range, now]);
  const designationCounts = useMemo(() => {
    const counts = new Map<string, number>();
    filtered.forEach((employee) => counts.set(employee.designation, (counts.get(employee.designation) ?? 0) + 1));
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 7);
  }, [filtered]);
  const hires = useMemo(() => {
    const dayCount = range === "30" ? 14 : range === "90" ? 12 : 12;
    const daysPerBucket = range === "30" ? 2 : range === "90" ? 8 : 30;
    return Array.from({ length: dayCount }, (_, index) => {
      const end = now - (dayCount - index - 1) * daysPerBucket * 24 * 60 * 60 * 1000;
      const start = end - daysPerBucket * 24 * 60 * 60 * 1000;
      const count = filtered.filter((employee) => { const time = new Date(employee.createdAt).getTime(); return time >= start && time < end; }).length;
      return { label: new Date(end).toLocaleDateString(undefined, { month: "short", day: "numeric" }), count };
    });
  }, [filtered, now, range]);
  const maxCount = Math.max(1, ...designationCounts.map(([, count]) => count));
  const pieSegments = useMemo(() => {
    const colors = ["#1746b5", "#e51b23", "#16a36a", "#e58b16", "#7556c9", "#0a8f9d", "#8c5a32"];
    const total = designationCounts.reduce((sum, [, count]) => sum + count, 0) || 1;
    return designationCounts.map(([label, count], index) => {
      const start = designationCounts.slice(0, index).reduce((sum, [, priorCount]) => sum + priorCount / total * 100, 0);
      const end = start + count / total * 100;
      return { label, count, color: colors[index % colors.length], start, end };
    });
  }, [designationCounts]);

  const tiles = [
    { label: "Total Employees", value: stats?.totalEmployees },
    { label: "Total MRs", value: stats?.totalMrs },
    { label: "Total Products", value: stats?.totalProducts },
    { label: "Total Orders", value: stats?.totalOrders },
    { label: "Orders Pending Customer Approval", value: stats?.ordersPendingCustomerApproval },
    { label: "Orders Pending Billing", value: stats?.ordersPendingBilling },
    { label: "Completed Orders", value: stats?.completedOrders },
  ];

  return <div className="company-content">
    <div className="company-page-heading"><div><h1>Dashboard</h1><p>Company activity and organisational analytics.</p></div><label className="company-range-label">Date range<select value={range} onChange={(event) => setRange(event.target.value as Range)}><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="365">Last 12 months</option><option value="all">All time</option></select></label></div>
    {error && <div className="company-error-banner" role="alert">{error}</div>}
    <section className="company-kpis company-analytics-kpis" aria-label="Company analytics">{tiles.map((tile) => <article className="company-kpi" key={tile.label}><strong>{tile.value ?? "—"}</strong><span>{tile.label}</span></article>)}</section>
    <div className="company-charts-grid">
      <section className="company-panel company-chart-panel"><div className="company-panel-heading"><div><h2>Employees by designation</h2><p>New employee records for the selected date range</p></div><div className="company-chart-toggle" role="group" aria-label="Chart type"><button type="button" aria-pressed={chartType === "bar"} onClick={() => setChartType("bar")}>Bar chart</button><button type="button" aria-pressed={chartType === "pie"} onClick={() => setChartType("pie")}>Pie chart</button></div></div>
        {chartType === "bar" ? designationCounts.length ? <div className="company-bar-chart">{designationCounts.map(([label, count]) => <div className="company-bar-row" key={label}><span title={label}>{label}</span><div><i style={{ width: `${Math.max(4, count / maxCount * 100)}%` }} title={`${count} ${count === 1 ? "employee" : "employees"}`} /></div><strong>{count}</strong></div>)}</div> : <div className="company-empty">No employee data for this date range.</div> : pieSegments.length ? <div className="company-pie-wrap"><div className="company-pie-chart" role="img" aria-label={pieSegments.map((segment) => `${segment.label}: ${segment.count}`).join(", ")} style={{ background: `conic-gradient(${pieSegments.map((segment) => `${segment.color} ${segment.start}% ${segment.end}%`).join(", ")})` }}><span>{filtered.length}<small>Employees</small></span></div><ul className="company-chart-legend">{pieSegments.map((segment) => <li key={segment.label} title={`${segment.label}: ${segment.count}`}><i style={{ backgroundColor: segment.color }} />{segment.label}<strong>{segment.count}</strong></li>)}</ul></div> : <div className="company-empty">No employee data for this date range.</div>}
      </section>
      <section className="company-panel company-chart-panel"><div className="company-panel-heading"><div><h2>Employee additions</h2><p>New employees over the selected period</p></div></div>
        {range === "all" ? <div className="company-empty">Choose a date range to view the employee addition trend.</div> : filtered.length ? <div className="company-trend-chart">{hires.map((point) => <div className="company-trend-column" key={point.label} title={`${point.label}: ${point.count} added`}><span style={{ height: `${Math.max(3, point.count / Math.max(1, ...hires.map((item) => item.count)) * 100)}%` }} /><small>{point.label}</small></div>)}</div> : <div className="company-empty">No employee additions during this period.</div>}
      </section>
    </div>
    <div className="company-dashboard-grid"><section className="company-panel"><div className="company-panel-heading"><div><h2>Organisational Flow</h2><p>Company team structure</p></div><Link href="/company/organisational-flow">Open</Link></div><div className="company-empty">{employees.length ? `${employees.length} employee records in your organisation.` : "Add the first employee to begin your hierarchy."}</div></section><section className="company-panel"><div className="company-panel-heading"><div><h2>Company workspace</h2><p>Quick links to your operating modules</p></div></div><div className="company-quick-links"><Link href="/company/product-uploading">Product Uploading</Link><Link href="/company/special-rates">Special Rates</Link><Link href="/company/order-status">Order Status</Link><Link href="/company/reports">Reports</Link></div></section></div>
  </div>;
}
