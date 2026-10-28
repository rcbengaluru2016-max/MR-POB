import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/session";
import { refreshStore } from "@/lib/server/store";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ user: null }, { status: 401 });
  }
  const account = (await refreshStore()).accounts.find((item) => item.username === session.username);
  return NextResponse.json({ user: { ...session, masterCode: account?.masterCode ?? null } });
}
