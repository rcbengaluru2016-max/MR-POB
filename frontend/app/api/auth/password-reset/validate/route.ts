import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({ error: "Connected authentication is required" }, { status: 503 });
}
