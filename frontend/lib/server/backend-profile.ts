import type { AccountRecord, MasterRecord, RegistrationRecord } from "@/lib/types";

// The approved registration is the authoritative profile; this projection does
// not create another master or copy credentials into the development store.
export function approvedBackendProfile(record: Record<string, unknown>) {
  const kind = record.kind as RegistrationRecord["kind"];
  const code = String(record.masterCode ?? "");
  const createdAt = String(record.decidedAt ?? record.submittedAt ?? "");
  const status = record.accountStatus === "active" ? "active" : "inactive";
  const master = {
    ...record, kind, code, registrationId: String(record.id), createdAt,
    approvalDate: createdAt, approvedBy: String(record.decidedById ?? ""), status,
  } as MasterRecord;
  const account: AccountRecord | null = code ? {
    username: String(record.accountUsername ?? code), masterCode: code, registrationId: String(record.id), userType: kind,
    displayName: String(record.customerName ?? record.adminFullName ?? record.patientName ?? ""),
    email: typeof record.email === "string" ? record.email : undefined,
    status, createdAt, passwordHash: "", passwordSalt: "",
  } : null;
  return { master, account };
}
