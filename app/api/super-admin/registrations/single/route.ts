import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { createSalt, hashPassword } from "@/lib/crypto";
import { isAdminSession } from "@/lib/server/super-admin";
import { toUploadedFile, optionalUpload, requiredUpload } from "@/lib/server/files";
import { nextRegistrationId, submitRegistration } from "@/lib/server/workflow";
import { SUPER_ADMIN_EMAIL } from "@/lib/server/super-admin-config";
import { customerRegistrationFieldsSchema, companyRegistrationFieldsSchema, patientRegistrationFieldsSchema } from "@/lib/validation";

export const instant = false;

export async function POST(request: Request) {
  if (!(await isAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const form = await request.formData();
    const kind = String(form.get("kind") ?? "");
    const value = (key: string) => String(form.get(key) ?? "");
    const salt = createSalt();
    if (kind === "customer") {
      const parsed = customerRegistrationFieldsSchema.safeParse({ customerName:value("customerName"), mobile:value("mobile"), email:value("email"), businessName:value("businessName"), customerType:value("customerType"), addressLine1:value("addressLine1"), addressLine2:value("addressLine2"), addressLine3:value("addressLine3"), addressLine4:value("addressLine4"), pinCode:value("pinCode"), dlNumber1:value("dlNumber1"), dlNumber2:value("dlNumber2"), dlNumber3:value("dlNumber3"), fssaiNumber:value("fssaiNumber"), gstNumber:value("gstNumber"), creditDays:value("creditDays"), paymentMethod:value("paymentMethod"), termsAccepted:value("termsAccepted") === "true" });
      if (!parsed.success) return NextResponse.json({ error:parsed.error.issues[0]?.message ?? "Invalid customer registration." }, { status:400 });
      if (parsed.data.email?.toLowerCase() === SUPER_ADMIN_EMAIL) return NextResponse.json({ error:"This email is reserved for administrator access." }, { status:400 });
      const record = await submitRegistration({ kind:"customer", id:await nextRegistrationId("customer"), status:"pending_verification", submittedAt:new Date().toISOString(), customerName:parsed.data.customerName, mobile:parsed.data.mobile, email:parsed.data.email || "", passwordHash:await hashPassword(randomBytes(32).toString("base64url"),salt), passwordSalt:salt, businessName:parsed.data.businessName, customerType:parsed.data.customerType, address:[parsed.data.addressLine1,parsed.data.addressLine2,parsed.data.addressLine3,parsed.data.addressLine4,parsed.data.pinCode].filter(Boolean).join(", "), addressLine1:parsed.data.addressLine1, addressLine2:parsed.data.addressLine2 || undefined, addressLine3:parsed.data.addressLine3 || undefined, addressLine4:parsed.data.addressLine4 || undefined, pinCode:parsed.data.pinCode, dlNumber1:parsed.data.dlNumber1, dlNumber2:parsed.data.dlNumber2, dlNumber3:parsed.data.dlNumber3 || undefined, fssaiNumber:parsed.data.fssaiNumber || undefined, gstNumber:parsed.data.gstNumber, creditDays:parsed.data.creditDays, paymentMethod:parsed.data.paymentMethod, files:{ dl1:await toUploadedFile(form.get("dl1") as File,"DL 1"), dl2:await toUploadedFile(form.get("dl2") as File,"DL 2"), dl3:await optionalUpload(form.get("dl3") as File | null ?? undefined,"DL 3"), gstCertificate:await requiredUpload(form.get("gstCertificate"),"GST certificate"), shopOutside:await toUploadedFile(form.get("shopOutside") as File,"Shop photo — outside"), shopInside:await toUploadedFile(form.get("shopInside") as File,"Shop photo — inside") } });
      return NextResponse.json({ registrationId:record.id,status:record.status });
    }
    if (kind === "company") {
      const parsed = companyRegistrationFieldsSchema.safeParse({ companyName:value("companyName"), division:value("division"), headquarter:value("headquarter"), adminFullName:value("adminFullName"), adminEmail:value("adminEmail"), adminMobile:value("adminMobile"), password:value("password"), confirmPassword:value("confirmPassword"), termsAccepted:value("termsAccepted") === "true" });
      if (!parsed.success) return NextResponse.json({ error:parsed.error.issues[0]?.message ?? "Invalid Company registration." }, { status:400 });
      if (parsed.data.adminEmail.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase()) return NextResponse.json({ error:"This email is reserved for administrator access." }, { status:400 });
      const logo = form.get("companyLogo"); const photo = form.get("adminPhoto");
      for (const [file,label] of [[logo,"Company logo"],[photo,"Admin photo"]] as const) {
        if (!(file instanceof File) || file.size === 0) return NextResponse.json({error:`${label} is required.`},{status:400});
        if (file.size > 5 * 1024 * 1024 || !["image/jpeg","image/png","image/webp"].includes(file.type)) return NextResponse.json({error:`${label} must be a JPG, PNG, or WEBP image up to 5 MB.`},{status:400});
      }
      const record = await submitRegistration({ kind:"company", id:await nextRegistrationId("company"), status:"pending_verification", submittedAt:new Date().toISOString(), adminFullName:parsed.data.adminFullName, mobile:parsed.data.adminMobile, email:parsed.data.adminEmail, passwordHash:await hashPassword(parsed.data.password,salt), passwordSalt:salt, companyName:parsed.data.companyName, headquarter:parsed.data.headquarter, division:parsed.data.division, files:{ companyLogo:await toUploadedFile(logo as File,"Company logo"), adminPhoto:await toUploadedFile(photo as File,"Admin photo") } });
      return NextResponse.json({ registrationId:record.id,status:record.status });
    }
    if (kind === "patient") {
      const parsed = patientRegistrationFieldsSchema.safeParse({ patientName:value("patientName"), mobile:value("mobile"), email:value("email"), gender:value("gender"), address:value("address"), paymentMethod:value("paymentMethod"), termsAccepted:value("termsAccepted") === "true" });
      if (!parsed.success) return NextResponse.json({ error:parsed.error.issues[0]?.message ?? "Invalid patient registration." }, { status:400 });
      if (parsed.data.email?.toLowerCase() === SUPER_ADMIN_EMAIL) return NextResponse.json({ error:"This email is reserved for administrator access." }, { status:400 });
      const idProof = form.get("idProof");
      const record = await submitRegistration({ kind:"patient", id:await nextRegistrationId("patient"), status:"pending_verification", submittedAt:new Date().toISOString(), patientName:parsed.data.patientName, mobile:parsed.data.mobile, email:parsed.data.email || undefined, passwordHash:await hashPassword(randomBytes(32).toString("base64url"),salt), passwordSalt:salt, gender:parsed.data.gender || "", address:parsed.data.address, paymentMethod:parsed.data.paymentMethod, files:idProof instanceof File && idProof.size ? { idProof:await toUploadedFile(idProof,"ID proof") } : undefined });
      return NextResponse.json({ registrationId:record.id,status:record.status });
    }
    return NextResponse.json({ error:"Choose Customer, Company, or Patient." }, { status:400 });
  } catch (error) {
    return NextResponse.json({ error:error instanceof Error ? error.message : "Unable to submit registration." }, { status:400 });
  }
}
