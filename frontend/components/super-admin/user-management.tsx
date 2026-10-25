"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { formatDateTime } from "@/lib/utils";

type Account = { username: string; email: string; name: string; role: "admin" | "super_admin"; status: string; createdAt: string; lastLoginAt: string | null; isCurrentUser: boolean };
type ActionResult = { error?: string; resetUrl?: string; expiresAt?: string; ok?: boolean };
type AccountAction = { account: Account; kind: "lock" | "unlock" | "reset" };
const pageSize = 10;

export function UserManagement({ backendMode = false }: { backendMode?: boolean }) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sortKey, setSortKey] = useState<"name" | "email" | "role" | "status" | "createdAt" | "lastLoginAt">("createdAt");
  const [descending, setDescending] = useState(true);
  const [page, setPage] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [resetUrl, setResetUrl] = useState("");
  const [accountAction, setAccountAction] = useState<AccountAction | null>(null);
  const [reauthCode, setReauthCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [selectedRole, setSelectedRole] = useState<"admin" | "super_admin">("admin");

  async function load() {
    setLoading(true);
    try { const response = await fetch("/api/super-admin/accounts"); const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Unable to load accounts."); setAccounts(data.items as Account[]); setError(""); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to load accounts."); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/super-admin/accounts", { signal: controller.signal }).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to load accounts.");
      return data as { items: Account[] };
    }).then((data) => { setAccounts(data.items); setError(""); }).catch((reason: unknown) => {
      if (reason instanceof DOMException && reason.name === "AbortError") return;
      setError(reason instanceof Error ? reason.message : "Unable to load accounts.");
    }).finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  const filtered = useMemo(() => accounts.filter((account) => {
    const query = search.trim().toLowerCase();
    const accountIsActive = account.status === "active" || account.status === "unlocked";
    const accountStatus = accountIsActive ? "active" : "inactive";
    return (!query || [account.name, account.email, account.username].some((value) => value.toLowerCase().includes(query))) && (!roleFilter || account.role === roleFilter) && (!statusFilter || accountStatus === statusFilter);
  }).sort((a, b) => String(a[sortKey] ?? "").localeCompare(String(b[sortKey] ?? ""), undefined, { numeric: true }) * (descending ? -1 : 1)), [accounts, search, roleFilter, statusFilter, sortKey, descending]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visible = filtered.slice(page * pageSize, (page + 1) * pageSize);
  function sortBy(key: typeof sortKey) { setPage(0); if (sortKey === key) setDescending((value) => !value); else { setSortKey(key); setDescending(key === "createdAt" || key === "lastLoginAt"); } }

  async function runAction(payload: Record<string, string>): Promise<boolean> {
    setBusy(true); setError(""); setNotice(""); setResetUrl("");
    try {
      const response = await fetch("/api/super-admin/accounts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json() as ActionResult;
      if (!response.ok) throw new Error(result.error ?? "Account action failed.");
      if (result.resetUrl) { setResetUrl(result.resetUrl); setNotice(`One-time reset link created. It expires ${formatDateTime(result.expiresAt ?? "")}. Share it securely with the account holder.`); }
      else setNotice(payload.action === "create" ? "Account login credentials created successfully" : payload.action === "status" ? `Account set to ${payload.status === "locked" ? "Inactive" : "Active"}.` : "Account change completed.");
      await load();
      setAccountAction(null);
      setReauthCode("");
      return true;
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Account action failed."); }
    finally { setBusy(false); }
    return false;
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? ""); const email = String(form.get("email") ?? ""); const role = String(form.get("role") ?? "admin"); const initialStatus = String(form.get("initialStatus") ?? "active"); const password = String(form.get("password") ?? ""); const reauthCode = String(form.get("reauthCode") ?? "");
    const target = event.currentTarget;
    const payload = { action: "create", name, email, role, initialStatus, password };
    if (role === "super_admin") Object.assign(payload, { reauthCode });
    if (await runAction(payload)) { target.reset(); setSelectedRole("admin"); }
  }

  async function confirmAccountAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accountAction) return;
    if (accountAction.kind === "reset") {
      if (backendMode) {
        if (await runAction({ action: "reset", username: accountAction.account.username, password: newPassword })) setNewPassword("");
        return;
      }
      if (!/^[0-9]{6}$/.test(reauthCode)) { setError("Enter your 6-digit authenticator code."); return; }
      await runAction({ action: "reset", username: accountAction.account.username, reauthCode });
      return;
    }
    await runAction({ action: "status", username: accountAction.account.username, status: accountAction.kind === "lock" ? "locked" : "unlocked" });
  }

  return <div className="mx-auto max-w-7xl">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-2xl font-semibold text-foreground">User Management</h1><p className="mt-1 text-sm text-muted">{backendMode ? "Manage Admin login credentials and account access." : "Manage Admin and Super Admin accounts. MFA is required when creating Super Admin accounts and resetting passwords."}</p></div><span className="rounded-full bg-brand/10 px-3 py-1 text-sm font-medium text-brand">{accounts.length} accounts</span></div>
    {error ? <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-danger">{error}</p> : null}
    {notice ? <p role="status" className="mt-4 rounded-lg bg-green-50 p-3 text-sm text-green-800">{notice}</p> : null}
    <section className="mt-6 rounded-2xl border border-line bg-white p-4 shadow-sm sm:p-6"><h2 className="text-lg font-semibold">Add New Account</h2><p className="mt-1 text-sm text-muted">{backendMode ? "Create an Admin account with a private initial password. Authenticator setup follows the Cognito pool policy." : "New Super Admins must set a private password and enrol MFA before dashboard access."}</p>
      <form onSubmit={(event) => void create(event)} className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="grid gap-1 text-sm font-medium">Name<input name="name" required minLength={2} maxLength={100} className="h-10 rounded-lg border border-line px-3" /></label>
        <label className="grid gap-1 text-sm font-medium">Email / username<input name="email" required type="email" maxLength={254} className="h-10 rounded-lg border border-line px-3" /></label>
        <label className="grid gap-1 text-sm font-medium">Role<select name="role" required value={selectedRole} onChange={(event) => setSelectedRole(event.target.value as "admin" | "super_admin")} className="h-10 rounded-lg border border-line bg-white px-3"><option value="admin">Admin</option>{!backendMode ? <option value="super_admin">Super Admin</option> : null}</select></label>
        <label className="grid gap-1 text-sm font-medium">Initial account status<select name="initialStatus" className="h-10 rounded-lg border border-line bg-white px-3"><option value="active">Active</option><option value="locked">Inactive</option></select></label>
        <label className="grid gap-1 text-sm font-medium">Initial password<input name="password" required type="password" minLength={12} maxLength={128} autoComplete="new-password" className="h-10 rounded-lg border border-line px-3" /><span className="text-xs font-normal text-muted">12+ characters, uppercase, lowercase, number, and symbol</span></label>
        {selectedRole === "super_admin" ? <label className="grid gap-1 text-sm font-medium">Your authenticator code<input name="reauthCode" required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" className="h-10 rounded-lg border border-line px-3" /></label> : null}
        <div className="flex items-end"><button disabled={busy} className="h-10 rounded-lg bg-brand px-5 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Savingâ€¦" : "Create Account"}</button></div>
      </form>
    </section>
    <section className="mt-6 rounded-2xl border border-line bg-white p-4 shadow-sm sm:p-6"><h2 className="text-lg font-semibold">Accounts</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-3"><input aria-label="Search accounts" value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); }} placeholder="Search name, email, username" className="h-10 rounded-lg border border-line px-3 text-sm" /><select aria-label="Role" value={roleFilter} onChange={(event) => { setRoleFilter(event.target.value); setPage(0); }} className="h-10 rounded-lg border border-line bg-white px-3 text-sm"><option value="" disabled>Role</option><option value="admin">Admin</option>{!backendMode ? <option value="super_admin">Super Admin</option> : null}</select><select aria-label="Status" value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(0); }} className="h-10 rounded-lg border border-line bg-white px-3 text-sm"><option value="" disabled>Status</option><option value="active">Active</option><option value="inactive">Inactive</option></select></div>
      <div className="mt-4 overflow-x-auto rounded-xl border border-line"><table className="min-w-[1000px] w-full text-left text-sm"><thead className="bg-background"><tr><th className="px-3 py-3 font-semibold">S.No.</th>{([["Name","name"],["Email / Username","email"],["Role","role"],["Status","status"],["Created","createdAt"],["Last Login","lastLoginAt"]] as const).map(([heading,key]) => <th key={key} className="px-3 py-3 font-semibold"><button type="button" onClick={() => sortBy(key)}>{heading}{sortKey === key ? (descending ? " â†“" : " â†‘") : ""}</button></th>)}<th className="px-3 py-3 font-semibold">Actions</th></tr></thead><tbody>
        {visible.map((account, index) => { const shouldUnlock = account.status === "locked" || account.status === "inactive"; const isActive = account.status === "active" || account.status === "unlocked"; return <tr key={account.username} className="border-t border-line"><td className="px-3 py-3">{page * pageSize + index + 1}</td><td className="px-3 py-3 font-medium">{account.name}</td><td className="px-3 py-3">{account.email}<span className="block text-xs text-muted">{account.username}</span></td><td className="px-3 py-3">{account.role === "super_admin" ? "Super Admin" : "Admin"}</td><td className="px-3 py-3"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${isActive ? "bg-green-50 text-green-800" : account.status === "locked" || account.status === "inactive" ? "bg-red-50 text-red-700" : "bg-gray-100 text-gray-700"}`}>{isActive ? "Active" : account.status === "locked" || account.status === "inactive" ? "Inactive" : account.status}</span></td><td className="whitespace-nowrap px-3 py-3">{formatDateTime(account.createdAt)}</td><td className="whitespace-nowrap px-3 py-3">{account.lastLoginAt ? formatDateTime(account.lastLoginAt) : "Never"}</td><td className="px-3 py-3"><div className="flex gap-2"><button type="button" disabled={busy || account.isCurrentUser} aria-label={`Account is ${isActive ? "Active" : "Inactive"}. Set to ${shouldUnlock ? "Active" : "Inactive"}`} title={account.isCurrentUser ? "You cannot change your own status" : undefined} onClick={() => { setError(""); setNotice(""); setReauthCode(""); setAccountAction({ account, kind: shouldUnlock ? "unlock" : "lock" }); }} className={`rounded-md border px-2 py-1 text-xs font-semibold disabled:opacity-40 ${isActive ? "border-green-200 bg-green-50 text-green-800" : "border-red-200 bg-red-50 text-red-700"}`}>{isActive ? "Active" : "Inactive"}</button><button type="button" disabled={busy} onClick={() => { setError(""); setNotice(""); setReauthCode(""); setAccountAction({ account, kind: "reset" }); }} className="rounded-md border border-line px-2 py-1 text-xs font-semibold">Reset password</button></div></td></tr>; })}
        {!loading && visible.length === 0 ? <tr><td colSpan={8} className="px-4 py-8 text-center text-muted">No accounts match these filters.</td></tr> : null}{loading ? <tr><td colSpan={8} className="px-4 py-8 text-center text-muted">Loading accountsâ€¦</td></tr> : null}
      </tbody></table></div>
      <div className="mt-4 flex justify-between text-sm text-muted"><span>{filtered.length} accounts</span><div className="flex items-center gap-3"><button disabled={!page} onClick={() => setPage((value) => Math.max(0, value - 1))} className="rounded border border-line px-3 py-1 disabled:opacity-40">Previous</button><span>Page {page + 1} of {pageCount}</span><button disabled={page + 1 >= pageCount} onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))} className="rounded border border-line px-3 py-1 disabled:opacity-40">Next</button></div></div>
    </section>
    {resetUrl ? <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4"><p className="text-sm font-semibold">One-time password reset link</p><p className="mt-1 break-all text-sm">{resetUrl}</p><button type="button" onClick={() => void navigator.clipboard.writeText(resetUrl)} className="mt-2 rounded-md border border-amber-400 px-3 py-1 text-sm">Copy link</button><p className="mt-2 text-xs text-muted">This link is shown once and expires after 30 minutes. Share it securely with the account holder.</p></div> : null}
    {accountAction ? <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/50 p-4" onClick={() => { if (!busy) { setAccountAction(null); setError(""); setReauthCode(""); } }} onKeyDown={(event) => { if (event.key === "Escape" && !busy) { setAccountAction(null); setError(""); setReauthCode(""); } }}><section role="dialog" aria-modal="true" aria-labelledby="account-action-heading" className="my-auto w-full max-w-xl rounded-2xl border border-line bg-white p-5 shadow-2xl sm:p-6" onClick={(event) => event.stopPropagation()}><div className="flex items-start justify-between gap-4"><div><h2 id="account-action-heading" className="text-xl font-semibold text-foreground">{accountAction.kind === "lock" ? "Set Account Inactive" : accountAction.kind === "unlock" ? "Set Account Active" : "Reset Password"}</h2><p className="mt-1 text-sm text-muted">Review the selected account and confirm the requested action.</p></div><button type="button" aria-label="Close dialog" disabled={busy} onClick={() => { setAccountAction(null); setError(""); setReauthCode(""); }} className="rounded-lg border border-line px-3 py-2 text-sm font-medium disabled:opacity-50">Ã—</button></div><dl className="mt-5 grid gap-4 rounded-xl bg-background p-4 sm:grid-cols-2"><div><dt className="text-xs text-muted">Account holder</dt><dd className="mt-1 font-medium">{accountAction.account.name}</dd></div><div><dt className="text-xs text-muted">Email / username</dt><dd className="mt-1 break-all font-medium">{accountAction.account.email}<span className="block text-xs text-muted">{accountAction.account.username}</span></dd></div><div><dt className="text-xs text-muted">Role</dt><dd className="mt-1 font-medium">{accountAction.account.role === "super_admin" ? "Super Admin" : "Admin"}</dd></div><div><dt className="text-xs text-muted">Current status</dt><dd className="mt-1 font-medium">{accountAction.account.status === "locked" || accountAction.account.status === "inactive" ? "Inactive" : "Active"}</dd></div></dl>{error ? <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-danger">{error}</p> : null}<form onSubmit={(event) => void confirmAccountAction(event)} className="mt-5">{accountAction.kind === "reset" && backendMode ? <label className="grid max-w-sm gap-1 text-sm font-medium">New password<input required type="password" minLength={12} maxLength={128} autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className="h-10 rounded-lg border border-line px-3" /><span className="text-xs font-normal text-muted">12+ characters with uppercase, lowercase, number and symbol.</span></label> : accountAction.kind === "reset" ? <label className="grid max-w-sm gap-1 text-sm font-medium">Your authenticator code<input required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" value={reauthCode} onChange={(event) => setReauthCode(event.target.value.replace(/\D/g, "").slice(0, 6))} className="h-10 rounded-lg border border-line px-3" /><span className="text-xs font-normal text-muted">MFA is required to create a one-time password reset link.</span></label> : <p className="text-sm text-muted">{accountAction.kind === "lock" ? "This account will be unable to sign in while Inactive." : "This account will be able to sign in while Active."}</p>}<div className="mt-6 flex justify-end gap-2"><button type="button" disabled={busy} onClick={() => { setAccountAction(null); setError(""); setReauthCode(""); }} className="rounded-lg border border-line px-4 py-2 text-sm font-semibold disabled:opacity-50">Cancel</button><button disabled={busy} className={`rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 ${accountAction.kind === "lock" ? "bg-red-700" : "bg-brand"}`}>{busy ? "Workingâ€¦" : accountAction.kind === "lock" ? "Set Inactive" : accountAction.kind === "unlock" ? "Set Active" : "Submit Reset"}</button></div></form></section></div> : null}
  </div>;
}
