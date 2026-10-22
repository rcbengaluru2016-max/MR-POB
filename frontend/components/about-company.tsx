"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

type Photo = { name: string; type: string; size: number; dataUrl: string };
type CompanySummary = {
  code: string; companyName: string; division: string; headquarter: string;
  adminFullName: string; status: "created" | "active" | "inactive";
};
type CompanyDetails = CompanySummary & { mobile: string; photo?: Photo };
type Employee = {
  id: string; fullName: string; designation: string; division?: string;
  reportingManagerId?: string; contactNumber: string; photo?: Photo; status: "active" | "inactive";
};

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "?";
}

function ProfilePhoto({ photo, name, className = "" }: { photo?: Photo; name: string; className?: string }) {
  return photo?.dataUrl
    ? <Image className={className} src={photo.dataUrl} alt={`${name} profile`} width={64} height={64} unoptimized />
    : <span className={`${className} about-company-initials`} aria-label={`${name} initials`}>{initials(name)}</span>;
}

function EmployeeNode({ employee, childrenByManager, managerName, onSelect, path = new Set<string>() }: {
  employee: Employee; childrenByManager: Map<string, Employee[]>; managerName: string;
  onSelect: (employee: Employee) => void; path?: Set<string>;
}) {
  if (path.has(employee.id)) return null;
  const nextPath = new Set(path).add(employee.id);
  return <div className="company-org-node">
    <button type="button" className="company-employee-card" onClick={() => onSelect(employee)} aria-label={`View ${employee.fullName}, ${employee.designation}`}>
      <ProfilePhoto photo={employee.photo} name={employee.fullName} className="company-employee-photo" />
      <strong>{employee.fullName}</strong>
      <span>{employee.designation}</span>
      <small>{employee.contactNumber}</small>
      <small>Reports to: {managerName}</small>
    </button>
    {(childrenByManager.get(employee.id) ?? []).length > 0 && <div className="company-org-children">
      {(childrenByManager.get(employee.id) ?? []).map((child) => <EmployeeNode key={child.id} employee={child} childrenByManager={childrenByManager} managerName={employee.fullName} onSelect={onSelect} path={nextPath} />)}
    </div>}
  </div>;
}

export function AboutCompany() {
  const [companies, setCompanies] = useState<CompanySummary[]>([]);
  const [query, setQuery] = useState("");
  const [selectedCode, setSelectedCode] = useState("");
  const [company, setCompany] = useState<CompanyDetails | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [loadingCompanies, setLoadingCompanies] = useState(true);
  const [companiesAttempt, setCompaniesAttempt] = useState(0);
  const [detailLoadedCode, setDetailLoadedCode] = useState("");
  const [error, setError] = useState("");
  const [detailAttempt, setDetailAttempt] = useState(0);
  const loadingDetails = Boolean(selectedCode && detailLoadedCode !== selectedCode);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/admin/about-company", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to load approved companies.");
        setCompanies(data.companies);
        setError("");
      })
      .catch((reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Unable to load approved companies."); })
      .finally(() => { if (!controller.signal.aborted) setLoadingCompanies(false); });
    return () => controller.abort();
  }, [companiesAttempt]);

  useEffect(() => {
    if (!selectedCode) return;
    const controller = new AbortController();
    fetch(`/api/admin/about-company?code=${encodeURIComponent(selectedCode)}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to load company hierarchy.");
        setCompany(data.company);
        setEmployees(data.employees);
        setError("");
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Unable to load company hierarchy.");
      })
      .finally(() => { if (!controller.signal.aborted) setDetailLoadedCode(selectedCode); });
    return () => controller.abort();
  }, [selectedCode, detailAttempt]);

  const visibleCompanies = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return companies.filter((item) => !needle || [item.companyName, item.code, item.adminFullName, item.headquarter, item.division].some((value) => value.toLowerCase().includes(needle)));
  }, [companies, query]);

  const childrenByManager = useMemo(() => {
    const result = new Map<string, Employee[]>();
    employees.forEach((employee) => {
      if (employee.reportingManagerId && employees.some((manager) => manager.id === employee.reportingManagerId)) {
        result.set(employee.reportingManagerId, [...(result.get(employee.reportingManagerId) ?? []), employee]);
      }
    });
    return result;
  }, [employees]);
  const roots = useMemo(() => employees.filter((employee) => !employee.reportingManagerId || !employees.some((manager) => manager.id === employee.reportingManagerId)), [employees]);

  return <div className="about-company-page">
    <header className="about-company-heading">
      <div><h1>Organisational Flow</h1><p>Browse approved companies and view their organisational structure.</p></div>
      <span className="about-company-count">{companies.length} {companies.length === 1 ? "company" : "companies"}</span>
    </header>

    {error && <div className="about-company-error" role="alert"><span>{error}</span><button type="button" onClick={() => selectedCode ? (setDetailLoadedCode(""), setDetailAttempt((attempt) => attempt + 1)) : (setLoadingCompanies(true), setCompaniesAttempt((attempt) => attempt + 1))}>Retry</button></div>}

    <div className="about-company-layout">
      <aside className="about-company-list-card" aria-label="Approved companies">
        <div className="about-company-list-heading"><div><h2>Approved Companies</h2><p>Select a company to view its team.</p></div></div>
        <label className="about-company-search"><span className="sr-only">Search companies</span><svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, code, location…" /></label>
        <div className="about-company-list" aria-live="polite">
          {loadingCompanies ? <p className="about-company-empty">Loading companies…</p> : visibleCompanies.length ? visibleCompanies.map((item) => <button key={item.code} type="button" className={`about-company-option${selectedCode === item.code ? " is-selected" : ""}`} onClick={() => { setSelectedEmployee(null); setCompany(null); setEmployees([]); setDetailLoadedCode(""); setSelectedCode(item.code); }} aria-pressed={selectedCode === item.code}>
            <span className="about-company-building" aria-hidden="true">⌂</span><span className="about-company-option-copy"><strong>{item.companyName}</strong><small>{item.code} · {item.headquarter}</small></span><span className={`about-company-status is-${item.status}`}>{item.status === "inactive" ? "Inactive" : item.status === "created" ? "Created" : "Active"}</span>
          </button>) : <p className="about-company-empty">{query ? "No companies match your search." : "No approved companies are available."}</p>}
        </div>
      </aside>

      <section className="about-company-detail" aria-live="polite">
        {!selectedCode ? <div className="about-company-placeholder"><span aria-hidden="true">⌂</span><h2>Select a company</h2><p>Choose an approved company from the list to inspect its organisational structure.</p></div> : loadingDetails ? <div className="about-company-placeholder"><span className="about-company-spinner" aria-hidden="true"/><p>Loading company hierarchy…</p></div> : company ? <>
          <header className="about-company-profile">
            <ProfilePhoto photo={company.photo} name={company.adminFullName} className="about-company-admin-photo" />
            <div className="about-company-profile-copy"><p className="about-company-eyebrow">{company.code}</p><h2>{company.companyName}</h2><p>{company.headquarter}{company.division ? ` · ${company.division}` : ""}</p></div>
            <span className={`about-company-status is-${company.status}`}>{company.status === "inactive" ? "Inactive" : company.status === "created" ? "Created" : "Active"}</span>
          </header>
          <section className="about-company-hierarchy">
            <div className="about-company-section-heading"><div><h3>Organisational Structure</h3><p>{employees.length + 1} people · Read-only view</p></div><span className="about-company-readonly">View only</span></div>
            <div className="company-org-scroll about-company-org-scroll"><div className="company-org-chart about-company-org-chart">
              <div className="company-org-node">
                <button type="button" className="company-employee-card about-company-root-card" onClick={() => setSelectedEmployee(null)} aria-label={`Company Admin ${company.adminFullName}`}>
                  <ProfilePhoto photo={company.photo} name={company.adminFullName} className="company-employee-photo" />
                  <strong>{company.adminFullName}</strong><span>Company Admin</span><small>{company.mobile}</small><small>Company account</small>
                </button>
                {roots.length > 0 && <div className="company-org-children">{roots.map((employee) => <EmployeeNode key={employee.id} employee={employee} childrenByManager={childrenByManager} managerName={company.adminFullName} onSelect={setSelectedEmployee} />)}</div>}
              </div>
            </div></div>
            {employees.length === 0 && <p className="about-company-no-employees">No active employees have been added to this company yet.</p>}
          </section>
          {selectedEmployee && <section className="about-company-employee-detail" aria-label="Selected employee details">
            <ProfilePhoto photo={selectedEmployee.photo} name={selectedEmployee.fullName} className="about-company-detail-photo" />
            <div><p className="about-company-eyebrow">EMPLOYEE PROFILE</p><h3>{selectedEmployee.fullName}</h3><p>{selectedEmployee.designation}{selectedEmployee.division ? ` · ${selectedEmployee.division}` : ""}</p></div>
            <dl><div><dt>Contact Number</dt><dd>{selectedEmployee.contactNumber}</dd></div><div><dt>Reporting Manager</dt><dd>{employees.find((item) => item.id === selectedEmployee.reportingManagerId)?.fullName ?? company.adminFullName}</dd></div></dl>
            <button type="button" className="about-company-clear-selection" onClick={() => setSelectedEmployee(null)}>Close details</button>
          </section>}
        </> : <div className="about-company-placeholder"><h2>Company unavailable</h2><p>This company may no longer be approved. Refresh the list and select another company.</p><button type="button" onClick={() => { setLoadingCompanies(true); setCompaniesAttempt((attempt) => attempt + 1); }}>Refresh companies</button></div>}
      </section>
    </div>
  </div>;
}
