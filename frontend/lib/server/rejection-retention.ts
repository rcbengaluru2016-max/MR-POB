import { transactStore } from "./store";
import { cleanupRejectionsState } from "./workflow-state";
const state = globalThis as typeof globalThis & { rejectionRetentionStarted?: boolean };
export function startRejectionRetention() {
  if (state.rejectionRetentionStarted) return;
  state.rejectionRetentionStarted = true;
  async function tick() {
    try { await transactStore(store => cleanupRejectionsState(store)); }
    catch { console.error("Rejection retention cleanup failed; will retry"); }
    setTimeout(tick, 60_000).unref();
  }
  setTimeout(tick, 0).unref();
}
