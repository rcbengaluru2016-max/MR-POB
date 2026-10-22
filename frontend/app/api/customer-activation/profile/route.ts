import { createHmac } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createSalt, hashPassword } from "@/lib/crypto";
import { optionalUpload, requiredUpload } from "@/lib/server/files";
import { getSessionSecret } from "@/lib/server/session-token";
import { refreshStore, transactStore } from "@/lib/server/store";
import type { StoredCustomerRegistration } from "@/lib/types";
import { customerActivationProfileSchema } from "@/lib/validation";

const COOKIE = "zenex_customer_activation";
const digest = (value: string) => createHmac("sha256", getSessionSecret()).update(value).digest("hex");
async function getActivation() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const store = await refreshStore();
  const challenge = store.customerActivationChallenges.find((item) => item.activationTokenHash === digest(token) && item.verifiedAt && item.activationTokenExpiresAt && Date.parse(item.activationTokenExpiresAt) > Date.now());
  if (!challenge?.registrationId || !challenge.accountUsername) return null;
  const registration = store.registrations.find((item) => item.kind === "customer" && item.id === challenge.registrationId && item.status === "approved");
  const master = store.masters.find((item) => item.kind === "customer" && item.registrationId === challenge.registrationId);
  const account = store.accounts.find((item) => item.username === challenge.accountUsername && item.userType === "customer" && item.status !== "locked" && item.status !== "inactive");
  if (!registration || !master || !account) return null;
  return { store, challenge, registration, master, account };
}
function publicProfile(record: StoredCustomerRegistration, code: string) {
  return { customerCode: code, customerName: record.customerName, mobile: record.mobile, email: record.email, businessName: record.businessName, customerType: record.customerType, addressLine1: record.addressLine1 ?? record.address, addressLine2: record.addressLine2 ?? "", addressLine3: record.addressLine3 ?? "", addressLine4: record.addressLine4 ?? "", pinCode: record.pinCode ?? "", dlNumber1: record.dlNumber1, dlNumber2: record.dlNumber2 ?? "", dlNumber3: record.dlNumber3 ?? "", fssaiNumber: record.fssaiNumber ?? "", gstNumber: record.gstNumber, creditDays: record.creditDays, paymentMethod: record.paymentMethod };
}

export async function GET() {
  const activation = await getActivation();
  if (!activation || activation.registration.kind !== "customer" || activation.master.kind !== "customer") return NextResponse.json({ error: "Verification session expired. Please start again." }, { status: 401 });
  return NextResponse.json({ profile: publicProfile(activation.registration, activation.master.code) });
}

export async function PATCH(request: Request) {
  const activation = await getActivation();
  if (!activation) return NextResponse.json({ error: "Verification session expired. Please start again." }, { status: 401 });
  try {
    const form = await request.formData();
    const value = (key: string) => String(form.get(key) ?? "");
    const parsed = customerActivationProfileSchema.safeParse({
      customerName: value("customerName"), mobile: value("mobile"), email: value("email"), password: value("password"), confirmPassword: value("confirmPassword"),
      businessName: value("businessName"), customerType: value("customerType"), addressLine1: value("addressLine1"), addressLine2: value("addressLine2"), addressLine3: value("addressLine3"), addressLine4: value("addressLine4"),
      pinCode: value("pinCode"), dlNumber1: value("dlNumber1"), dlNumber2: value("dlNumber2"), dlNumber3: value("dlNumber3"), fssaiNumber: value("fssaiNumber"), gstNumber: value("gstNumber"), creditDays: value("creditDays"), paymentMethod: value("paymentMethod"), termsAccepted: true,
    });
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Please check the customer details." }, { status: 400 });
    const data = parsed.data;
    const salt = createSalt(); const passwordHash = await hashPassword(data.password, salt);
    const fileUpdates = {
      dl1: await optionalUpload(form.get("dl1") as File | null ?? undefined, "DL 1"),
      dl2: await optionalUpload(form.get("dl2") as File | null ?? undefined, "DL 2"),
      dl3: await optionalUpload(form.get("dl3") as File | null ?? undefined, "DL 3"),
      gstCertificate: await requiredUpload(form.get("gstCertificate"), "GST certificate"),
      shopOutside: await optionalUpload(form.get("shopOutside") as File | null ?? undefined, "Shop photo — outside"),
      shopInside: await optionalUpload(form.get("shopInside") as File | null ?? undefined, "Shop photo — inside"),
    };
    await transactStore((store) => {
      const registration = store.registrations.find((item) => item.kind === "customer" && item.id === activation.registration.id);
      const master = store.masters.find((item) => item.kind === "customer" && item.registrationId === activation.registration.id);
      const account = store.accounts.find((item) => item.username === activation.account.username && item.userType === "customer");
      if (!registration || registration.kind !== "customer" || registration.status !== "approved" || !master || master.kind !== "customer" || !account || account.status === "locked" || account.status === "inactive") throw new Error("This account is no longer eligible for activation.");
      const duplicate = store.registrations.some((item) => item.id !== registration.id && item.status !== "rejected" && (item.mobile === data.mobile || (!!data.email && "email" in item && item.email?.toLowerCase() === data.email.toLowerCase())));
      if (duplicate) throw new Error("This mobile number or email is already associated with another account.");
      Object.assign(registration, { customerName: data.customerName, mobile: data.mobile, email: data.email || "", businessName: data.businessName, customerType: data.customerType, addressLine1: data.addressLine1, addressLine2: data.addressLine2 || undefined, addressLine3: data.addressLine3 || undefined, addressLine4: data.addressLine4 || undefined, pinCode: data.pinCode, address: [data.addressLine1, data.addressLine2, data.addressLine3, data.addressLine4, data.pinCode].filter(Boolean).join(", "), dlNumber1: data.dlNumber1, dlNumber2: data.dlNumber2, dlNumber3: data.dlNumber3 || undefined, fssaiNumber: data.fssaiNumber || undefined, gstNumber: data.gstNumber, creditDays: data.creditDays, paymentMethod: data.paymentMethod, passwordHash, passwordSalt: salt });
      Object.assign(master, { customerName: data.customerName, mobile: data.mobile, email: data.email || "", businessName: data.businessName, customerType: data.customerType, addressLine1: data.addressLine1, addressLine2: data.addressLine2 || undefined, addressLine3: data.addressLine3 || undefined, addressLine4: data.addressLine4 || undefined, pinCode: data.pinCode, address: [data.addressLine1, data.addressLine2, data.addressLine3, data.addressLine4, data.pinCode].filter(Boolean).join(", "), dlNumber1: data.dlNumber1, dlNumber2: data.dlNumber2, dlNumber3: data.dlNumber3 || undefined, fssaiNumber: data.fssaiNumber || undefined, gstNumber: data.gstNumber, creditDays: data.creditDays, paymentMethod: data.paymentMethod });
      for (const name of ["dl1", "dl2", "dl3", "gstCertificate", "shopOutside", "shopInside"] as const) {
        const file = fileUpdates[name];
        if (file) { registration.files[name] = file; master.files[name] = file; }
      }
      account.email = data.email || ""; account.passwordHash = passwordHash; account.passwordSalt = salt; account.displayName = data.customerName; account.passwordChangeRequired = false;
      store.audit.unshift({ id: crypto.randomUUID(), at: new Date().toISOString(), actor: account.username, action: "customer_account_activated_profile_updated", registrationId: registration.id, masterCode: master.code });
    });
    const response = NextResponse.json({ success: true });
    response.cookies.delete(COOKIE);
    return response;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update customer details." }, { status: 400 });
  }
}
