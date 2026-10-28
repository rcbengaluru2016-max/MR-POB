export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && !process.env.BACKEND_API_URL?.trim()) {
    const { startRejectionRetention } = await import("./lib/server/rejection-retention");
    startRejectionRetention();
  }
}
