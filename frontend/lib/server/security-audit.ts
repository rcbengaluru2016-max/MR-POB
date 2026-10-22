import { refreshStore, persistStore } from "@/lib/server/store";

export async function recordSecurityEvent(actor: string, action: string, detail?: string) {
  const store = await refreshStore();
  store.audit.unshift({
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    actor,
    action,
    detail,
  });
  await persistStore(store);
}
