import { NextResponse } from "next/server";
import { createSalt, hashPassword } from "@/lib/crypto";
import { toUploadedFile } from "@/lib/server/files";
import { nextRegistrationId, submitRegistration } from "@/lib/server/workflow";
import { companyRegistrationFieldsSchema } from "@/lib/validation";
import { SUPER_ADMIN_EMAIL } from "@/lib/server/super-admin-config";

const imageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxImageBytes = 5 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const value = (key: string) => String(form.get(key) ?? "");
    const parsed = companyRegistrationFieldsSchema.safeParse({
      companyName: value("companyName"), division: value("division"), headquarter: value("headquarter"),
      adminFullName: value("adminFullName"), adminEmail: value("adminEmail"), adminMobile: value("adminMobile"),
      password: value("password"), confirmPassword: value("confirmPassword"), termsAccepted: value("termsAccepted") === "true",
    });
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid company registration." }, { status: 400 });
    const logo = form.get("companyLogo");
    const photo = form.get("adminPhoto");
    for (const [file, label] of [[logo, "Company logo"], [photo, "Admin photo"]] as const) {
      if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: `${label} is required.` }, { status: 400 });
      if (file.size > maxImageBytes || !imageTypes.has(file.type)) return NextResponse.json({ error: `${label} must be a JPG, PNG, or WEBP image up to 5 MB.` }, { status: 400 });
    }
    const data = parsed.data;
    if (data.adminEmail.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase()) return NextResponse.json({ error: "This email is reserved for administrator access." }, { status: 400 });
    const salt = createSalt();
    const record = await submitRegistration({
      kind: "company", id: await nextRegistrationId("company"), status: "pending_verification", submittedAt: new Date().toISOString(),
      companyName: data.companyName, division: data.division, headquarter: data.headquarter, adminFullName: data.adminFullName,
      mobile: data.adminMobile, email: data.adminEmail, passwordHash: await hashPassword(data.password, salt), passwordSalt: salt,
      files: { companyLogo: await toUploadedFile(logo as File, "Company logo"), adminPhoto: await toUploadedFile(photo as File, "Admin photo") },
    });
    return NextResponse.json({ registrationId: record.id, status: record.status });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Registration failed." }, { status: 400 });
  }
}
