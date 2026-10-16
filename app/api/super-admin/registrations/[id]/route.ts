import { NextResponse } from "next/server";
import { getStore } from "@/lib/server/store";
import { isSuperAdminReady } from "@/lib/server/super-admin";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  if (!(await isSuperAdminReady())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const store = await getStore();
  const registration = store.registrations.find((item) => item.id === id && item.status === "approved");
  if (!registration) return NextResponse.json({ error: "Approved registration not found." }, { status: 404 });

  const master = store.masters.find((item) => item.registrationId === registration.id);
  if (!master) return NextResponse.json({ error: "The approved registration has no master record." }, { status: 404 });

  const account = store.accounts.find((item) => item.registrationId === registration.id);
  const emailEvent = store.audit.find((event) => event.registrationId === registration.id && event.action === "activation_email_sent");
  const activationEmail = emailEvent
    ? store.emails.find((email) => email.to === emailEvent.detail && email.subject === "Zenex International account activated" && Boolean(emailEvent.masterCode && email.body.includes(emailEvent.masterCode)))
    : undefined;

  const safeRegistration: Record<string, unknown> = { ...registration };
  delete safeRegistration.passwordHash;
  delete safeRegistration.passwordSalt;

  return NextResponse.json({
    registration: safeRegistration,
    master,
    account: account ? {
      username: account.username,
      displayName: account.displayName,
      email: account.email,
      userType: account.userType,
      status: account.status,
      createdAt: account.createdAt,
      lastLoginAt: account.lastLoginAt,
    } : null,
    activationEmail: activationEmail ? {
      recipient: activationEmail.to,
      status: activationEmail.status,
      sentAt: activationEmail.at,
      subject: activationEmail.subject,
    } : null,
  });
}
