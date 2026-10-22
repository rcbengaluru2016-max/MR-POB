import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { createSalt, hashPassword } from "@/lib/crypto";
import { optionalUpload, requiredUpload, toUploadedFile } from "@/lib/server/files";
import { nextRegistrationId, submitRegistration } from "@/lib/server/workflow";
import { customerRegistrationFieldsSchema } from "@/lib/validation";
import { SUPER_ADMIN_EMAIL } from "@/lib/server/super-admin-config";

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const value = (key: string) => String(form.get(key) ?? "");
    const parsed = customerRegistrationFieldsSchema.safeParse({
      customerName: value("customerName"),
      mobile: value("mobile"),
      email: value("email"),
      businessName: value("businessName"),
      customerType: value("customerType"),
      addressLine1: value("addressLine1"),
      addressLine2: value("addressLine2"),
      addressLine3: value("addressLine3"),
      addressLine4: value("addressLine4"),
      pinCode: value("pinCode"),
      dlNumber1: value("dlNumber1"),
      dlNumber2: value("dlNumber2"),
      dlNumber3: value("dlNumber3"),
      fssaiNumber: value("fssaiNumber"),
      gstNumber: value("gstNumber"),
      creditDays: value("creditDays"),
      paymentMethod: value("paymentMethod"),
      termsAccepted: value("termsAccepted") === "true",
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid customer registration." },
        { status: 400 },
      );
    }

    const values = parsed.data;
    if (values.email?.toLowerCase() === SUPER_ADMIN_EMAIL) {
      return NextResponse.json({ error: "This email is reserved for administrator access." }, { status: 400 });
    }
    const salt = createSalt();
    const id = await nextRegistrationId("customer");
    const record = await submitRegistration({
      kind: "customer",
      id,
      status: "pending_verification",
      submittedAt: new Date().toISOString(),
      customerName: values.customerName,
      mobile: values.mobile,
      email: values.email || "",
      passwordHash: await hashPassword(randomBytes(32).toString("base64url"), salt),
      passwordSalt: salt,
      businessName: values.businessName,
      customerType: values.customerType,
      address: [values.addressLine1, values.addressLine2, values.addressLine3, values.addressLine4, values.pinCode].filter(Boolean).join(", "),
      addressLine1: values.addressLine1,
      addressLine2: values.addressLine2 || undefined,
      addressLine3: values.addressLine3 || undefined,
      addressLine4: values.addressLine4 || undefined,
      pinCode: values.pinCode,
      dlNumber1: values.dlNumber1,
      dlNumber2: values.dlNumber2,
      dlNumber3: values.dlNumber3 || undefined,
      fssaiNumber: values.fssaiNumber || undefined,
      gstNumber: values.gstNumber,
      creditDays: values.creditDays,
      paymentMethod: values.paymentMethod,
      files: {
        dl1: await toUploadedFile(form.get("dl1") as File, "DL 1"),
        dl2: await toUploadedFile(form.get("dl2") as File, "DL 2"),
        dl3: await optionalUpload(form.get("dl3") as File | null ?? undefined, "DL 3"),
        gstCertificate: await requiredUpload(form.get("gstCertificate"), "GST certificate"),
        shopOutside: await toUploadedFile(form.get("shopOutside") as File, "Shop photo — outside"),
        shopInside: await toUploadedFile(form.get("shopInside") as File, "Shop photo — inside"),
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
