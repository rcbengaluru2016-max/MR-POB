export const terminalImportStatuses = new Set([
  "COMPLETED", "PARTIALLY_COMPLETED", "FAILED", "CANCELLED", "VALIDATION_FAILED",
]);

// Schedule after each response so slow requests never overlap. Respect throttling
// without letting a transient failure change the job's server-owned state.
export function pollImport<T>(
  url: string,
  receive: (result: T) => boolean,
  failed: (message: string) => void = () => {},
) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  async function refresh() {
    let delay = 5000;
    try {
      const response = await fetch(url, { cache: "no-store", signal: controller.signal });
      if (controller.signal.aborted) return;
      if (response.status === 429) {
        const retry = response.headers.get("Retry-After");
        const seconds = retry ? Number(retry) : NaN;
        const retryMs = Number.isFinite(seconds) ? seconds * 1000 : retry ? Date.parse(retry) - Date.now() : 0;
        delay = Math.max(30000, Number.isFinite(retryMs) ? retryMs : 0);
      } else {
        const result = await response.json();
        if (controller.signal.aborted) return;
        if (!response.ok) {
          failed(result.error ?? "Unable to refresh import status.");
          if ([401, 403, 404].includes(response.status)) return;
          delay = 15000;
        } else if (!receive(result)) return;
      }
    } catch {
      delay = 15000;
    }
    if (!controller.signal.aborted) timer = setTimeout(() => void refresh(), delay);
  }
  void refresh();
  return () => { controller.abort(); clearTimeout(timer); };
}
