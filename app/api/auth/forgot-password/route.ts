import { NextResponse } from "next/server";
import { getStore, persistStore } from "@/lib/server/store";
import { forgotPasswordSchema } from "@/lib/validation";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = forgotPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid email" },
      { status: 400 },
    );
  }

  const store = await getStore();
  const account = store.accounts.find(
    (item) => item.email?.toLowerCase() === parsed.data.email.toLowerCase(),
  );
  if (account?.email) {
    store.emails.unshift({
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      to: account.email,
      subject: "Zenex International password recovery",
      body: "A password reset was requested. In production this email contains a time-limited reset link. Your password is never sent in email.",
      status: "sent",
    });
    await persistStore(store);
  }

  return NextResponse.json({
    message:
      "If an account exists for this email, password recovery instructions have been sent.",
  });
}
