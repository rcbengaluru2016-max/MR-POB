import { NextResponse } from "next/server";
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

  return NextResponse.json({
    message: "If an account matches this email, recovery instructions can be delivered through WhatsApp once messaging is configured.",
  });
}
