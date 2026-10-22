import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OrganisationalFlow } from "@/components/company/organisational-flow";
import { ProductUploading } from "@/components/company/product-uploading";
import { SpecialRates } from "@/components/company/special-rates";
import { OrderStatus } from "@/components/company/order-status";
import { CompanyReports } from "@/components/company/reports";

const sections: Record<string, { title: string; description: string; empty: string; columns: string[] }> = {
  "organisational-flow": { title: "Organisational Flow", description: "Review your company’s reporting structure and team.", empty: "No employees have been added to this company yet.", columns: ["Name", "Role", "Mobile", "Reports to", "Status"] },
  "product-uploading": { title: "Product Uploading", description: "Manage the products available to your company.", empty: "No products have been uploaded yet.", columns: ["Product Code", "Brand Name", "Composition", "MRP", "Product Status"] },
  "special-rates": { title: "Special Rates", description: "Review company-specific product rate offers.", empty: "No special rates are available yet.", columns: ["Product", "MRP", "Special Rate", "Start Date", "End Date", "Status"] },
  "order-status": { title: "Order Status", description: "Track company orders and their approval and billing status.", empty: "There are no orders to display yet.", columns: ["Order ID", "Order Date", "Customer", "Product Details", "Amount", "Customer Approval", "Billing", "Overall"] },
  reports: { title: "Reports", description: "Review order activity and performance for your company.", empty: "Reports will appear when company order activity is available.", columns: ["Medical Representative", "Orders", "Order Value", "Awaiting Approval", "Pending Billing", "Completed"] },
};

export default function CompanySectionPage({ params }: { params: Promise<{ section: string }> }) {
  return <Suspense fallback={<div className="company-content"><div className="company-empty">Loading company workspace…</div></div>}><CompanySectionContent params={params} /></Suspense>;
}

async function CompanySectionContent({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (section === "organisational-flow") return <OrganisationalFlow />;
  if (section === "product-uploading") return <ProductUploading />;
  if (section === "special-rates") return <SpecialRates />;
  if (section === "order-status") return <OrderStatus />;
  if (section === "reports") return <CompanyReports />;
  const page = sections[section];
  if (!page) notFound();
  return <div className="company-content">
    <div className="company-page-heading"><div><h1>{page.title}</h1><p>{page.description}</p></div></div>
    <section className="company-panel company-table-panel"><div className="company-panel-heading"><div><h2>{page.title}</h2><p>Company data is restricted to your approved account.</p></div></div>
      <div className="company-table-scroll"><table className="company-table"><thead><tr>{page.columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody><tr><td colSpan={page.columns.length}><div className="company-empty">{page.empty}</div></td></tr></tbody></table></div>
    </section>
    <Link href="/company/dashboard" className="company-back-link">← Back to dashboard</Link>
  </div>;
}
