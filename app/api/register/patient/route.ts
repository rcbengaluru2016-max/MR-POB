import { NextResponse } from "next/server";
import { createSalt, hashPassword } from "@/lib/crypto";
import { toUploadedFile } from "@/lib/server/files";
import { nextRegistrationId, submitRegistration } from "@/lib/server/workflow";
import { patientRegistrationFieldsSchema } from "@/lib/validation";
import { SUPER_ADMIN_EMAIL } from "@/lib/server/super-admin-config";

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const value = (key: string) => String(form.get(key) ?? "");
    const parsed = patientRegistrationFieldsSchema.safeParse({
      patientName: value("patientName"),
      mobile: value("mobile"),
      email: value("email"),
      password: value("password"),
      confirmPassword: value("confirmPassword"),
      gender: value("gender"),
      address: value("address"),
      termsAccepted: value("termsAccepted") === "true",
      paymentMethod: value("paymentMethod"),
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid patient registration." },
        { status: 400 },
      );
    }

    const idProof = form.get("idProof");
    const values = parsed.data;
    if (values.email?.toLowerCase() === SUPER_ADMIN_EMAIL) {
      return NextResponse.json({ error: "This email is reserved for administrator access." }, { status: 400 });
    }
    const salt = createSalt();
    const id = await nextRegistrationId("patient");
    const record = await submitRegistration({
      kind: "patient",
      id,
      status: "pending_verification",
      submittedAt: new Date().toISOString(),
      patientName: values.patientName,
      mobile: values.mobile,
      email: values.email || undefined,
      passwordHash: await hashPassword(values.password, salt),
      passwordSalt: salt,
      gender: values.gender || "",
      address: values.address,
      files: idProof instanceof File && idProof.size > 0
        ? { idProof: await toUploadedFile(idProof, "ID proof") }
        : undefined,
      paymentMethod: values.paymentMethod,
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
