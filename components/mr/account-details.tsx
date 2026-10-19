"use client";

import Link from "next/link";
import { ArrowLeft, AtSign, BadgeCheck, Building2, CalendarDays, Clock3, IdCard, Mail, MapPin, Phone, UserRound } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { mockProducts } from "@/lib/mr/mock-data";
import { mrInitials } from "@/lib/mr/profile";
import { formatDateTime } from "@/lib/utils";
import { useMrWorkspace } from "./workspace-provider";

function Detail({ icon: Icon, label, value }: { icon: typeof UserRound; label: string; value: string }) {
  return <div className="flex min-w-0 items-start gap-3 rounded-xl border border-line bg-white p-4">
    <span className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-panel text-brand"><Icon aria-hidden="true" className="size-4" /></span>
    <div className="min-w-0"><dt className="text-xs font-medium uppercase tracking-wide text-muted">{label}</dt><dd className="mt-1 break-words text-sm font-semibold text-foreground">{value.trim() || "Not available"}</dd></div>
  </div>;
}

export function MrAccountDetails() {
  const { profile } = useMrWorkspace();
  const role = "Medical Representative";
  const name = profile.name.trim() || "Not available";
  const email = profile.email?.trim() || "Not available";
  const status = profile.status?.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) || "Not available";
  const companies = [...new Set(profile.companyIds)].map((id) => ({ id, name: mockProducts.find((product) => product.companyId === id)?.companyName || id }));

  return <section className="mx-auto max-w-5xl space-y-6 sm:space-y-8" aria-labelledby="mr-account-title">
    <Link className="inline-flex items-center gap-2 text-sm font-semibold text-brand" href="/mr/dashboard"><ArrowLeft size={16} aria-hidden="true" />Back to Dashboard</Link>
    <header>
      <p className="text-sm font-semibold text-brand">{role}</p>
      <h1 id="mr-account-title" className="mt-1 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Account Information</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">Review your profile, account details, and company assignments.</p>
    </header>

    <article className="relative overflow-hidden rounded-2xl border border-line bg-white p-5 shadow-sm sm:p-7">
      <div aria-hidden="true" className="absolute inset-y-0 right-0 hidden w-1/3 bg-gradient-to-l from-panel to-transparent sm:block" />
      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
        <div aria-hidden="true" className="flex size-20 shrink-0 items-center justify-center rounded-full bg-brand text-2xl font-bold tracking-wide text-white ring-4 ring-pale-blue">{mrInitials(profile.name)}</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-semibold text-foreground sm:text-2xl">{name}</h2><span className="rounded-full bg-panel px-3 py-1 text-xs font-semibold text-brand">{role}</span></div>
          <p className="mt-2 flex min-w-0 items-center gap-2 break-all text-sm text-muted"><Mail aria-hidden="true" className="size-4 shrink-0" />{email}</p>
        </div>
        <div className="w-fit"><StatusBadge value={profile.status ?? "not_available"} /></div>
      </div>
    </article>

    <div className="grid gap-5 lg:grid-cols-2">
      <article className="rounded-2xl border border-line bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-5 flex items-center gap-3"><span className="inline-flex size-10 items-center justify-center rounded-xl bg-panel text-brand"><UserRound aria-hidden="true" className="size-5" /></span><div><h2 className="font-semibold text-foreground">Profile Information</h2><p className="mt-0.5 text-xs text-muted">Identity associated with this account</p></div></div>
        <dl className="grid gap-3">
          <Detail icon={UserRound} label="Full Name" value={name} />
          <Detail icon={AtSign} label="Username" value={profile.username ?? ""} />
          <Detail icon={Mail} label="Email Address" value={email} />
          <Detail icon={Phone} label="Phone Number" value={profile.phone ?? ""} />
        </dl>
      </article>

      <article className="rounded-2xl border border-line bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-5 flex items-center gap-3"><span className="inline-flex size-10 items-center justify-center rounded-xl bg-panel text-brand"><IdCard aria-hidden="true" className="size-5" /></span><div><h2 className="font-semibold text-foreground">Account Details</h2><p className="mt-0.5 text-xs text-muted">Account identity and assigned territory</p></div></div>
        <dl className="grid gap-3">
          <Detail icon={IdCard} label="MR ID" value={profile.employeeCode} />
          <Detail icon={UserRound} label="User Role" value={role} />
          <Detail icon={BadgeCheck} label="Account Status" value={status} />
          <Detail icon={MapPin} label="Territory" value={profile.territory} />
          {profile.createdAt && <Detail icon={CalendarDays} label="Account created" value={formatDateTime(profile.createdAt)} />}
          {profile.lastLoginAt && <Detail icon={Clock3} label="Last successful login" value={formatDateTime(profile.lastLoginAt)} />}
        </dl>
      </article>
    </div>

    <article className="rounded-2xl border border-line bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-5 flex items-center gap-3"><span className="inline-flex size-10 items-center justify-center rounded-xl bg-panel text-brand"><Building2 aria-hidden="true" className="size-5" /></span><div><h2 className="font-semibold text-foreground">Company Assignment</h2><p className="mt-0.5 text-xs text-muted">Companies assigned to your MR workspace</p></div></div>
      {companies.length ? <dl className="grid gap-3 sm:grid-cols-2">{companies.map((company) => <Detail key={company.id} icon={Building2} label="Assigned company" value={company.name} />)}</dl> : <p className="text-sm text-muted">No company assignments available.</p>}
    </article>
  </section>;
}
