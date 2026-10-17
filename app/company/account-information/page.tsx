import { Suspense } from "react";
import { getCompanyAdminContext } from "@/lib/server/company-admin";
import { CompanyChangePassword } from "@/components/company/change-password";

function date(value?: string) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default function CompanyAccountInformationPage() {
  return <Suspense fallback={<div className="company-content"><div className="company-empty">Loading account information…</div></div>}><CompanyAccountInformationContent /></Suspense>;
}

async function CompanyAccountInformationContent() {
  const { account, master } = await getCompanyAdminContext();
  const initials = account.displayName.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "CA";
  return <div className="company-content">
    <div className="company-page-heading"><div><h1>Account Information</h1><p>Account profile and access details.</p></div></div>
    <section className="company-panel company-profile-card">
      <div className="company-profile-heading"><div className="company-profile-avatar">{initials}</div><div><h2>{account.displayName}</h2><span>Company Admin</span></div><span className="company-status"><i /> Active</span></div>
      <div className="company-profile-grid">
        <div><small>Username / Master Code</small><strong>{account.username}</strong></div>
        <div><small>Registered email</small><strong>{account.email || master.email}</strong></div>
        <div><small>Company</small><strong>{master.companyName}</strong></div>
        <div><small>Account status</small><strong className="company-active-text">Active</strong></div>
        <div><small>Account created</small><strong>{date(account.createdAt)}</strong></div>
        <div><small>Last login</small><strong>{date(account.lastLoginAt)}</strong></div>
      </div>
      <p className="company-security-note">Your password and authentication credentials are never displayed here.</p>
      <CompanyChangePassword mfaRequired={Boolean(account.mfaEnabled)} />
    </section>
  </div>;
}
