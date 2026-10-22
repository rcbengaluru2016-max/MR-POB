"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { FileInput } from "@/components/forms/file-input";
import { TermsDialog } from "@/components/forms/terms-dialog";
import { Button } from "@/components/ui/button";
import { Field, SelectInput, TextInput } from "@/components/ui/field";
import { CREDIT_DAY_OPTIONS, CUSTOMER_PAYMENT_METHODS, CUSTOMER_TYPES } from "@/lib/constants";
import { customerRegistrationSchema } from "@/lib/validation";
import type { z } from "zod";

type Values = z.infer<typeof customerRegistrationSchema>;

export function CustomerRegistrationForm({ adminMode = false, onCreated }: { adminMode?: boolean; onCreated?: () => void }) {
  const router = useRouter();
  const [serverError, setServerError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [termsOpen, setTermsOpen] = useState(false);
  const form = useForm<Values>({
    resolver: zodResolver(customerRegistrationSchema),
    defaultValues: {
      customerName: "",
      mobile: "",
      email: "",
      businessName: "",
      addressLine1: "",
      addressLine2: "",
      addressLine3: "",
      addressLine4: "",
      pinCode: "",
      dlNumber1: "",
      dlNumber2: "",
      dlNumber3: "",
      fssaiNumber: "",
      gstNumber: "",
      termsAccepted: undefined,
    },
  });

  const termsAccepted = useWatch({ control: form.control, name: "termsAccepted" });

  async function onSubmit(values: Values) {
    setServerError("");
    setSuccessMessage("");
    const formData = new FormData();
    Object.entries(values).forEach(([key, value]) => {
      if (value instanceof FileList) {
        if (value[0]) formData.append(key, value[0]);
      } else if (typeof value === "boolean") {
        formData.append(key, String(value));
      } else if (value) {
        formData.append(key, String(value));
      }
    });
    try {
      if (adminMode) formData.set("kind", "customer");
      const response = await fetch(adminMode ? "/api/super-admin/registrations/single" : "/api/register/customer", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) {
        setServerError(data.error ?? "Registration failed");
        return;
      }
      if (adminMode) { form.reset(); setSuccessMessage(`Customer registration ${data.registrationId} saved as Pending Verification.`); onCreated?.(); }
      else router.push("/register/success?type=customer");
    } catch {
      setServerError("Unable to submit registration. Check your connection and try again.");
    }
  }

  return (
    <form className="space-y-8" onSubmit={form.handleSubmit(onSubmit)}>
      <section className="grid gap-4 md:grid-cols-2">
        <h2 className="md:col-span-2 text-lg font-semibold text-foreground">Business Information</h2>
        <Field label="Name *" error={form.formState.errors.businessName?.message}>
          <TextInput {...form.register("businessName")} />
        </Field>
        <Field label="Customer Category *" error={form.formState.errors.customerType?.message}>
          <SelectInput {...form.register("customerType")} defaultValue="">
            <option value="" disabled>
              Select type
            </option>
            {CUSTOMER_TYPES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Address Line 1 *" error={form.formState.errors.addressLine1?.message}><TextInput {...form.register("addressLine1")} /></Field>
        <Field label="Address Line 2" error={form.formState.errors.addressLine2?.message}><TextInput {...form.register("addressLine2")} /></Field>
        <Field label="Address Line 3" error={form.formState.errors.addressLine3?.message}><TextInput {...form.register("addressLine3")} /></Field>
        <Field label="Address Line 4" error={form.formState.errors.addressLine4?.message}><TextInput {...form.register("addressLine4")} /></Field>
        <Field label="PIN Code *" error={form.formState.errors.pinCode?.message}><TextInput inputMode="numeric" maxLength={6} {...form.register("pinCode")} /></Field>
        <Field label="DL Number 1 *" error={form.formState.errors.dlNumber1?.message}>
          <TextInput {...form.register("dlNumber1")} />
        </Field>
        <Field label="DL Number 2 *" error={form.formState.errors.dlNumber2?.message}>
          <TextInput {...form.register("dlNumber2")} />
        </Field>
        <Field label="DL Number 3" error={form.formState.errors.dlNumber3?.message}><TextInput {...form.register("dlNumber3")} /></Field>
        <Field label="FSSAI Number" error={form.formState.errors.fssaiNumber?.message}><TextInput {...form.register("fssaiNumber")} /></Field>
        <Field label="GST Number *" error={form.formState.errors.gstNumber?.message}>
          <TextInput {...form.register("gstNumber")} />
        </Field>
        <Field label="Number of credit days *" error={form.formState.errors.creditDays?.message}>
          <SelectInput {...form.register("creditDays")} defaultValue="">
            <option value="" disabled>
              Select credit terms
            </option>
            {CREDIT_DAY_OPTIONS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Preferred Payment Method *" error={form.formState.errors.paymentMethod?.message}>
          <SelectInput {...form.register("paymentMethod")} defaultValue="">
            <option value="" disabled>Select payment method</option>
            {CUSTOMER_PAYMENT_METHODS.map((method) => <option key={method} value={method}>{method}</option>)}
          </SelectInput>
        </Field>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <h2 className="md:col-span-2 text-lg font-semibold text-foreground">Basic Information</h2>
        <Field label="Owner *" error={form.formState.errors.customerName?.message}><TextInput {...form.register("customerName")} /></Field>
        <Field label="Mobile Number *" error={form.formState.errors.mobile?.message}><TextInput inputMode="numeric" {...form.register("mobile")} /></Field>
        <Field label="Email ID" error={form.formState.errors.email?.message}><TextInput type="email" {...form.register("email")} /></Field>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <h2 className="md:col-span-2 text-lg font-semibold text-foreground">Documents / photos</h2>
        <FileInput label="DL 1 *" error={form.formState.errors.dl1?.message} registration={form.register("dl1")} />
        <FileInput label="DL 2 *" error={form.formState.errors.dl2?.message} registration={form.register("dl2")} />
        <FileInput label="DL 3" error={form.formState.errors.dl3?.message} registration={form.register("dl3")} />
        <FileInput label="GST Certificate Upload *" required error={form.formState.errors.gstCertificate?.message} registration={form.register("gstCertificate")} />
        <FileInput label="Shop Photo — Outside *" error={form.formState.errors.shopOutside?.message} registration={form.register("shopOutside")} />
        <FileInput label="Shop Photo — Inside *" error={form.formState.errors.shopInside?.message} registration={form.register("shopInside")} />
      </section>

      <section className="rounded-xl border border-line bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-2 text-sm font-medium">
          <a
            href="#terms-and-conditions"
            onClick={(event) => {
              event.preventDefault();
              setTermsOpen(true);
            }}
            className="font-semibold text-brand underline underline-offset-2 hover:text-brand-dark"
          >
            Terms &amp; Conditions *
          </a>
        </div>
      </section>
      <TermsDialog
        open={termsOpen}
        title="Terms & Conditions"
        checked={termsAccepted === true}
        onCheckedChange={(checked) => form.setValue("termsAccepted", checked, {
          shouldDirty: true,
          shouldTouch: true,
          shouldValidate: true,
        })}
        onClose={() => setTermsOpen(false)}
      >
        <ol id="terms-and-conditions" className="list-decimal space-y-2 pl-5 text-sm leading-6 text-foreground">
          <li>Maximum credit period for our supplies is 30 days.</li>
          <li>A 3% discount will be offered for pay on delivery (cash, current-dated cheques, or online).</li>
          <li>Please specify the mode of payment: Cash / Cheque / Online / NEFT / UPI / Bank Transfer.</li>
          <li>Seal and signature on the acknowledgement copy are mandatory upon acceptance of goods.</li>
          <li>Please collect an acknowledgement for returned saleable, breakage, and expiry products.</li>
          <li>Goods returns will not be accepted for credit note without a purchase reference.</li>
          <li>Sales Return / Breakage / Expiry: Credit notes will be issued within 6 working days.</li>
          <li>Vaccines, cold chain products, and special items are non-returnable. Please confirm before purchase.</li>
          <li>Payments cannot be withheld due to any commitments made by medical representatives. They are not authorized to handle stock or collect payments.</li>
        </ol>
      </TermsDialog>
      {form.formState.errors.termsAccepted ? (
        <p className="text-sm text-danger">{form.formState.errors.termsAccepted.message}</p>
      ) : null}
      {serverError ? <p className="text-sm text-danger" role="alert">{serverError}</p> : null}
      {successMessage ? <p className="text-sm text-green-700" role="status">{successMessage}</p> : null}
      <Button disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting ? "Submitting..." : "Submit"}
      </Button>
    </form>
  );
}
