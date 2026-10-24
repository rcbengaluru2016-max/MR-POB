"use client";

import Image from "next/image";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

type Employee = {
  id: string; fullName: string; designation: string;
  reportingManagerId?: string; contactNumber: string; status?: "active" | "inactive";
  photo?: { name: string; type: string; size: number; dataUrl: string }; createdAt: string;
};

function initials(name: string) { return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "E"; }
const managerGroups = [
  { label: "Regional Manager", matches: (value: string) => /regional manager/i.test(value) },
  { label: "Sales Manager", matches: (value: string) => /sales manager/i.test(value) },
  { label: "Medical Representative (MR)", matches: (value: string) => /medical representative|\bmr\b/i.test(value) },
];

function EmployeeNode({ employee, childMap, onSelect, path = new Set<string>(), managerName }: { employee: Employee; childMap: Map<string, Employee[]>; onSelect: (employee: Employee) => void; path?: Set<string>; managerName?: string }) {
  if (path.has(employee.id)) return null;
  const nextPath = new Set(path).add(employee.id);
  const children = (childMap.get(employee.id) ?? []).filter((child) => child.status !== "inactive");
  return <div className="company-org-node">
    <button type="button" className="company-employee-card" onClick={() => onSelect(employee)}>
      {employee.photo ? <Image className="company-employee-photo" src={employee.photo.dataUrl} alt="" width={48} height={48} unoptimized /> : <span className="company-employee-photo company-employee-initials">{initials(employee.fullName)}</span>}
      <strong>{employee.fullName}</strong><span>{employee.designation}</span><small>{employee.contactNumber}</small><small>Reports to: {managerName ?? "None (top level)"}</small>
    </button>
    {children.length > 0 && <div className="company-org-children">{children.map((child) => <EmployeeNode key={child.id} employee={child} onSelect={onSelect} childMap={childMap} path={nextPath} managerName={employee.fullName} />)}</div>}
  </div>;
}

export function OrganisationalFlow() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [selected, setSelected] = useState<Employee | null>(null);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const response = await fetch("/api/company/employees", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load employees.");
      setEmployees(data.employees);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to load employees."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/company/employees", { cache: "no-store" }).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load employees.");
      if (active) setEmployees(data.employees);
    }).catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Unable to load employees."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const childrenByManager = useMemo(() => {
    const result = new Map<string, Employee[]>();
    employees.filter((employee) => employee.status !== "inactive").forEach((employee) => {
      if (employee.reportingManagerId) result.set(employee.reportingManagerId, [...(result.get(employee.reportingManagerId) ?? []), employee]);
    });
    return result;
  }, [employees]);
  const roots = useMemo(() => employees.filter((employee) => employee.status !== "inactive" && (!employee.reportingManagerId || !employees.some((manager) => manager.id === employee.reportingManagerId && manager.status !== "inactive"))), [employees]);
  const activeEmployees = useMemo(() => employees.filter((employee) => employee.status !== "inactive"), [employees]);
  const reportingManagerRequired = activeEmployees.length > 0 && (editing ? Boolean(editing.reportingManagerId) : true);
  const eligibleManagerGroups = useMemo(() => managerGroups.map((group) => ({
    ...group,
    employees: activeEmployees.filter((employee) => employee.id !== editing?.id && group.matches(employee.designation)),
  })), [activeEmployees, editing]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setNotice(""); setSaving(true);
    const form = new FormData(event.currentTarget);
    const photoFile = form.get("photo");
    let photo: { name: string; dataUrl: string } | undefined;
    if (photoFile instanceof File && photoFile.size) {
      if (photoFile.size > 2 * 1024 * 1024) { setError("Employee photos must be 2 MB or smaller."); setSaving(false); return; }
      if (!["image/jpeg", "image/png", "image/webp"].includes(photoFile.type)) { setError("Upload a JPEG, PNG, or WebP photo."); setSaving(false); return; }
      try { photo = { name: photoFile.name, dataUrl: await new Promise((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error("Could not read photo.")); reader.readAsDataURL(photoFile);
      }) }; } catch { setError("Could not read the selected photo."); setSaving(false); return; }
    }
    try {
      const response = await fetch("/api/company/employees", { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        id: editing?.id, fullName: form.get("fullName"), designation: form.get("designation"),
        reportingManagerId: form.get("reportingManagerId"), contactNumber: form.get("contactNumber"), photo,
      }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to add employee.");
      setShowForm(false); setEditing(null); setNotice(editing ? "Employee details updated." : "Employee added to the organisational flow."); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to add employee."); }
    finally { setSaving(false); }
  }

  const selectedIsMr = Boolean(selected && /medical\s+representative|\bmr\b/i.test(selected.designation));
  const directReports = selected ? activeEmployees.filter((employee) => employee.reportingManagerId === selected.id) : [];
  const inactiveEmployees = employees.filter((employee) => employee.status === "inactive");

  async function deactivateEmployee() {
    if (!selected || saving || directReports.length) return;
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/company/employees", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: selected.id, action: "deactivate" }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to deactivate employee.");
      if (data.employee?.id !== selected.id || data.employee?.status !== "inactive") throw new Error("Deactivation was not confirmed by the server. No local changes were made. Please refresh and check the employee status.");
      setEmployees((current) => current.map((employee) => employee.id === data.employee.id ? data.employee : employee));
      setConfirmDeactivate(false); setSelected(null); setNotice("Employee deactivated. Historical records have been retained.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to deactivate employee."); }
    finally { setSaving(false); }
  }

  return <div className="company-content">
    <div className="company-page-heading"><div><h1>Organisational Flow</h1><p>Manage your company team and reporting relationships.</p></div><button className="company-primary-button" type="button" onClick={() => { setError(""); setEditing(null); setShowForm(true); }}>＋ Add Employee</button></div>
    {notice && <div className="company-success" role="status">{notice}</div>}
    {error && !showForm && <div className="company-error-banner" role="alert">{error}<button type="button" onClick={() => void load()}>Retry</button></div>}
    <section className="company-panel company-org-panel"><div className="company-panel-heading"><div><h2>Company hierarchy</h2><p>{employees.filter((employee) => employee.status !== "inactive").length} active employees · Select a profile to view its details</p></div></div>
      {loading ? <div className="company-empty">Loading organisational data…</div> : employees.filter((employee) => employee.status !== "inactive").length === 0 ? <div className="company-empty">No employees have been added yet. Add the first employee to start your company hierarchy.</div> : <div className="company-org-scroll"><div className="company-org-chart">
        {roots.filter((employee) => employee.status !== "inactive").map((employee) => <EmployeeNode key={employee.id} employee={employee} onSelect={setSelected} childMap={childrenByManager} />)}
      </div></div>}
    </section>

    {showForm && <div className="company-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowForm(false); }}>
      <section className="company-modal" role="dialog" aria-modal="true" aria-labelledby="company-employee-form-title">
        <div className="company-modal-heading"><div><h2 id="company-employee-form-title">{editing ? "Edit Employee" : "Add Employee"}</h2><p>Enter the employee details and reporting relationship.</p></div><button type="button" className="company-modal-close" aria-label="Close" onClick={() => { setShowForm(false); setEditing(null); }}>×</button></div>
        <form key={editing?.id ?? "new"} onSubmit={submit} className="company-employee-form">
          <label>Employee Name*<input name="fullName" autoComplete="name" required minLength={2} maxLength={100} defaultValue={editing?.fullName ?? ""} /></label>
          <label>Position / Designation*<input name="designation" required minLength={2} maxLength={80} placeholder="e.g. Medical Representative (MR)" defaultValue={editing?.designation ?? ""} /></label>
          <label>Reporting Manager*{reportingManagerRequired && <em>*</em>}<select name="reportingManagerId" defaultValue={editing?.reportingManagerId ?? ""} required={reportingManagerRequired} aria-required={reportingManagerRequired}>
            <option value="">{reportingManagerRequired ? "Select a reporting manager" : "None (top level)"}</option>
            {eligibleManagerGroups.map((group) => group.employees.length ? <optgroup key={group.label} label={group.label}>{group.employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.fullName}</option>)}</optgroup> : null)}
            {eligibleManagerGroups.every((group) => group.employees.length === 0) && activeEmployees.length > 0 && <option value="__unavailable" disabled>No eligible manager employees yet</option>}
          </select><span className="company-field-hint">{activeEmployees.length === 0 ? "The first employee can be set as top level." : "Choose an active employee; names are grouped by designation."}</span></label>
          <label>Contact Number*<input name="contactNumber" type="tel" required inputMode="tel" pattern="\+?[0-9]{10,15}" defaultValue={editing?.contactNumber ?? ""} /></label>
          <label className="company-file-label">Employee Photo* <span>JPEG, PNG or WebP · up to 2 MB</span><input name="photo" type="file" accept="image/jpeg,image/png,image/webp" /></label>
          {error && <p className="company-error" role="alert">{error}</p>}
          <div className="company-modal-actions"><button className="company-secondary-button" type="button" onClick={() => { setShowForm(false); setEditing(null); }}>Cancel</button><button className="company-primary-button" type="submit" disabled={saving}>{saving ? "Saving…" : editing ? "Save Changes" : "Save"}</button></div>
        </form>
      </section>
    </div>}

    {inactiveEmployees.length > 0 && <section className="company-panel"><div className="company-panel-heading"><div><h2>Inactive employees</h2><p>Retained for historical reference; excluded from the active hierarchy.</p></div></div><ul className="space-y-2">{inactiveEmployees.map((employee) => <li key={employee.id}><button type="button" className="company-table-action" onClick={() => { setError(""); setSelected(employee); }}>{employee.fullName} · {employee.designation} · Inactive</button></li>)}</ul></section>}

    {selected && !confirmDeactivate && <div className="company-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}><section className="company-modal company-employee-detail" role="dialog" aria-modal="true" aria-labelledby="company-employee-name">
      <button type="button" className="company-modal-close company-detail-close" aria-label="Close" onClick={() => setSelected(null)}>×</button>
      {selected.photo ? <Image className="company-detail-photo" src={selected.photo.dataUrl} alt={`${selected.fullName}`} width={96} height={96} unoptimized /> : <div className="company-detail-photo company-employee-initials">{initials(selected.fullName)}</div>}
      <h2 id="company-employee-name">{selected.fullName}</h2><p>{selected.designation}</p><dl><div><dt>Contact Number</dt><dd>{selected.contactNumber}</dd></div><div><dt>Reporting Manager</dt><dd>{employees.find((employee) => employee.id === selected.reportingManagerId)?.fullName ?? "Top level"}</dd></div><div><dt>Account Status</dt><dd>{selected.status === "inactive" ? "Inactive" : "Active"}</dd></div></dl>
      <div className="company-modal-actions"><button className="company-secondary-button" type="button" disabled={selected.status === "inactive"} onClick={() => { setEditing(selected); setError(""); setShowForm(true); setSelected(null); }}>Edit</button>{selected.status !== "inactive" && <button className="company-danger-button" type="button" onClick={() => { setError(""); setConfirmDeactivate(true); }}>{selectedIsMr ? "Deactivate MR" : "Deactivate"}</button>}</div>
    </section></div>}
    <ConfirmDialog open={confirmDeactivate && Boolean(selected)} title={selectedIsMr ? "Deactivate MR?" : "Deactivate employee?"} description={`${selected?.fullName ?? "This employee"} will no longer appear in the active hierarchy after the server confirms deactivation. Historical employee and order records will be retained.`} confirmLabel={selectedIsMr ? "Deactivate MR" : "Confirm Deactivation"} danger busy={saving} confirmDisabled={directReports.length > 0} error={error} onClose={() => { setConfirmDeactivate(false); setError(""); }} onConfirm={() => void deactivateEmployee()}>
      {directReports.length > 0 && <p className="mt-4 text-sm text-danger" role="alert">Reassign the active direct reports before deactivating this employee: {directReports.map((employee) => employee.fullName).join(", ")}. Existing reporting relationships will not be changed automatically.</p>}
    </ConfirmDialog>
  </div>;
}
