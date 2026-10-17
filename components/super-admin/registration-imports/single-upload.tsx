"use client";

import { useState } from "react";
import { CustomerRegistrationForm } from "@/components/forms/customer-registration-form";
import { CompanyRegistrationForm } from "@/components/forms/company-registration-form";
import { PatientRegistrationForm } from "@/components/forms/patient-registration-form";
import { RegistrationImportNavigation } from "@/components/super-admin/registration-imports/navigation";

export function SingleRegistrationUpload() {
  const [kind, setKind] = useState<"customer" | "company" | "patient">("customer");
  return <div className="mx-auto max-w-7xl">
    <h1 className="text-2xl font-semibold">Registration Imports</h1><p className="mt-1 text-sm text-muted">Create a single registration using the same fields and rules as the public registration flow.</p>
    <RegistrationImportNavigation current="/super-admin/registration-imports/single" />
    <section className="mt-6 rounded-2xl border border-line bg-white p-5 shadow-sm sm:p-7">
      <h2 className="text-xl font-semibold">Single Upload</h2>
      <label className="mt-4 grid max-w-sm gap-1 text-sm font-medium">Registration category<select value={kind} onChange={(event) => setKind(event.target.value as typeof kind)} className="h-11 rounded-lg border border-line bg-white px-3"><option value="customer">Customer</option><option value="company">Company</option><option value="patient">Patient</option></select></label>
      <div className="mt-6">{kind === "customer" ? <CustomerRegistrationForm adminMode /> : kind === "company" ? <CompanyRegistrationForm adminMode /> : <PatientRegistrationForm adminMode />}</div>
    </section>
  </div>;
}
