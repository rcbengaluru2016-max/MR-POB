import { Suspense } from "react";
import { CompanyDashboard } from "@/components/company/company-dashboard";

export default function CompanyDashboardPage() {
  return <Suspense fallback={<div className="company-content"><div className="company-empty">Loading company dashboard…</div></div>}><CompanyDashboard /></Suspense>;
}
