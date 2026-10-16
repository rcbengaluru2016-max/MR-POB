import { NextResponse } from "next/server";
import { createSalt, hashPassword } from "@/lib/crypto";
import { toUploadedFile } from "@/lib/server/files";
import { nextRegistrationId, submitRegistration } from "@/lib/server/workflow";
import { mrRegistrationFieldsSchema } from "@/lib/validation";
import { SUPER_ADMIN_EMAIL } from "@/lib/server/super-admin-config";

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const value = (key: string) => String(form.get(key) ?? "");
    const parsed = mrRegistrationFieldsSchema.safeParse({
      mrName: value("mrName"),
      mobile: value("mobile"),
      email: value("email"),
      password: value("password"),
      confirmPassword: value("confirmPassword"),
      companyName: value("companyName"),
      position: value("position"),
      division: value("division"),
      termsAccepted: value("termsAccepted") === "true",
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid MR registration." },
        { status: 400 },
      );
    }

    const visitingCard = form.get("visitingCard");
    if (!(visitingCard instanceof File) || visitingCard.size === 0) {
      return NextResponse.json({ error: "Visiting card is required." }, { status: 400 });
    }

    const values = parsed.data;
    if (values.email.toLowerCase() === SUPER_ADMIN_EMAIL) {
      return NextResponse.json({ error: "This email is reserved for administrator access." }, { status: 400 });
    }
    const salt = createSalt();
    const id = await nextRegistrationId("mr");
    const record = await submitRegistration({
      kind: "mr",
      id,
      status: "pending_verification",
      submittedAt: new Date().toISOString(),
      mrName: values.mrName,
      mobile: values.mobile,
      email: values.email,
      passwordHash: await hashPassword(values.password, salt),
      passwordSalt: salt,
      companyName: values.companyName,
      position: values.position,
      division: values.division,
      files: {
        mrPhoto: await toUploadedFile(form.get("mrPhoto") as File, "MR photo"),
        visitingCard: await toUploadedFile(visitingCard, "Visiting card"),
      },
    });

    return NextResponse.json({
      registrationId: record.id,
      status: record.status,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Registration failed." },
      { status: 400 },
    );
  }
}
