import type { RegistrationRecord } from "@/lib/types";
import { transactStore } from "./store";
import { approveRegistrationState, nextRegistrationIdState, rejectRegistrationState, submitRegistrationState } from "./workflow-state";

// These functions run only in server handlers. The file-backed development store
// serializes its durable mutations; production uses the PostgreSQL backend.
export async function submitRegistration(record: RegistrationRecord) {
  return transactStore((store) => submitRegistrationState(store, record));
}
export async function nextRegistrationId(kind: RegistrationRecord["kind"]) {
  return transactStore((store) => nextRegistrationIdState(store, kind));
}
export async function rejectRegistration(id: string, actor: string, input: { reasonCode?: unknown; reason?: unknown; reasonReviewed?: unknown }) {
  return transactStore((store) => {
    const record = rejectRegistrationState(store, id, actor, input);
    const notification = store.registrationNotifications?.find(item => item.registrationId === id && item.event === "REJECTED");
    return { ...record, notificationStatus: notification?.status ?? "NOT_CONFIGURED" };
  });
}
export async function approveRegistration(id: string, actor: string) {
  return transactStore((store) => approveRegistrationState(store, id, actor));
}
