"use client";

import { useEffect, useMemo, useState } from "react";

type Report = { mrId: string; mrName: string; contactNumber: string; totalOrders: number; orderValue: number; awaitingApproval: number; pendingBilling: number; completed: number };
type Mr = { id: string; fullName: string };
type SortKey = "mrName" | "totalOrders" | "orderValue" | "awaitingApproval" | "pendingBilling" | "completed";
function money(value: number) { return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(value); }

export function CompanyReports() {
  const [reports, setReports] = useState<Report[]>([]);
  const [mrs, setMrs] = useState<Mr[]>([]);
  const [totalOrders, setTotalOrders] = useState(0);
  const [orderValue, setOrderValue] = useState(0);
  const [policy, setPolicy] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [mrId, setMrId] = useState("");
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("mrName");
  const [ascending, setAscending] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(); if (from) params.set("from", from); if (to) params.set("to", to); if (mrId) params.set("mrId", mrId);
      fetch(`/api/company/reports?${params}`, { cache: "no-store" }).then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error || "Unable to load Company reports."); return data; })
        .then((data) => { if (active) { setReports(data.reports as Report[]); setMrs(data.mrs as Mr[]); setTotalOrders(data.totalOrders as number); setOrderValue(data.orderValue as number); setPolicy(data.policy as string); setError(""); } })
        .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Unable to load Company reports."); })
        .finally(() => { if (active) setLoading(false); });
    }, 150);
    return () => { active = false; window.clearTimeout(timer); };
  }, [from, to, mrId]);

  const visible = useMemo(() => reports.filter((report) => report.mrName.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).sort((a, b) => {
    const left = a[sortBy]; const right = b[sortBy];
    const comparison = typeof left === "number" && typeof right === "number" ? left - right : String(left).localeCompare(String(right));
    return ascending ? comparison : -comparison;
  }), [reports, query, sortBy, ascending]);

  function toggleSort(key: SortKey) { if (sortBy === key) setAscending((value) => !value); else { setSortBy(key); setAscending(key === "mrName"); } }
  function sortHeading(label: string, key: SortKey) { return <button className="company-report-sort" type="button" onClick={() => toggleSort(key)}>{label} {sortBy === key ? ascending ? "↑" : "↓" : ""}</button>; }
  function clearFilters() { setFrom(""); setTo(""); setMrId(""); setQuery(""); }

  return <div className="company-content">
    <div className="company-page-heading"><div><h1>Reports</h1><p>Review Company order activity and MR-wise performance.</p></div></div>
    {error && <div className="company-error-banner" role="alert">{error}</div>}
    <section className="company-panel company-order-filters company-report-filters" aria-label="Report filters">
      <label>MR Name<select value={mrId} onChange={(event) => setMrId(event.target.value)}><option value="">All MRs</option>{mrs.map((mr) => <option value={mr.id} key={mr.id}>{mr.fullName}</option>)}</select></label>
      <label>From<input type="date" value={from} max={to || undefined} onChange={(event) => setFrom(event.target.value)} /></label>
      <label>To<input type="date" value={to} min={from || undefined} onChange={(event) => setTo(event.target.value)} /></label>
      <label>Search MR<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search representative" /></label>
      <button className="company-secondary-button company-clear-filters" type="button" onClick={clearFilters}>Clear Filters</button>
    </section>
    <div className="company-report-kpis"><article className="company-kpi"><strong>{loading ? "—" : totalOrders}</strong><span>Total Orders in period</span></article><article className="company-kpi"><strong>{loading ? "—" : money(orderValue)}</strong><span>Order Value</span></article><article className="company-kpi"><strong>{loading ? "—" : reports.reduce((sum, row) => sum + row.awaitingApproval, 0)}</strong><span>Awaiting Approval</span></article><article className="company-kpi"><strong>{loading ? "—" : reports.reduce((sum, row) => sum + row.pendingBilling, 0)}</strong><span>Pending Billing</span></article></div>
    <section className="company-panel company-report-panel"><div className="company-panel-heading"><div><h2>MR-Wise Performance</h2><p>Order Value excludes rejected or cancelled orders. Order count includes all lifecycle statuses.</p></div></div>
      <div className="company-table-scroll"><table className="company-table company-report-table"><thead><tr><th>{sortHeading("MR Name", "mrName")}</th><th>{sortHeading("Total Orders", "totalOrders")}</th><th>{sortHeading("Order Value", "orderValue")}</th><th>{sortHeading("Awaiting Approval", "awaitingApproval")}</th><th>{sortHeading("Pending Billing", "pendingBilling")}</th><th>{sortHeading("Completed", "completed")}</th></tr></thead><tbody>{loading ? <tr><td colSpan={6}><div className="company-empty">Loading reports…</div></td></tr> : visible.length === 0 ? <tr><td colSpan={6}><div className="company-empty">No report data is available for the selected filters.</div></td></tr> : visible.map((report) => <tr key={report.mrId}><td><strong>{report.mrName}</strong>{report.contactNumber !== "—" && <small>{report.contactNumber}</small>}</td><td>{report.totalOrders}</td><td>{money(report.orderValue)}</td><td>{report.awaitingApproval}</td><td>{report.pendingBilling}</td><td>{report.completed}</td></tr>)}</tbody></table></div>
    </section>
    <p className="company-report-policy">{policy || "Order metrics are calculated from authorized Company order records."}</p>
  </div>;
}
