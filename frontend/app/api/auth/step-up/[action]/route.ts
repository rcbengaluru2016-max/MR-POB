import { NextResponse } from "next/server";

// Connected mode is served by proxy.ts; never fall through to prototype auth.
export async function POST() {
  return NextResponse.json({ error: "Connected authentication is required" }, { status: 503 });
}
