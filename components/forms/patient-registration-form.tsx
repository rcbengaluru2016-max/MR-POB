"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { FileInput } from "@/components/forms/file-input";
import { TermsDialog } from "@/components/forms/terms-dialog";
import { Button } from "@/components/ui/button";
import { Field, SelectInput, TextArea, TextInput } from "@/components/ui/field";
import { PATIENT_PAYMENT_METHODS } from "@/lib/constants";
import { patientRegistrationSchema } from "@/lib/validation";
import type { z } from "zod";

type Values = z.infer<typeof patientRegistrationSchema>;

export function PatientRegistrationForm({ adminMode = false, onCreated }: { adminMode?: boolean; onCreated?: () => void }) {
  const router = useRouter();
  const [serverError, setServerError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [termsOpen, setTermsOpen] = useState(false);
  const form = useForm<Values>({
    resolver: zodResolver(patientRegistrationSchema),
    defaultValues: {
      patientName: "",
      mobile: "",
      email: "",
      address: "",
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
      } else if (typeof value === "boolean") formData.append(key, String(value));
      else if (value) formData.append(key, String(value));
    });
    try {
      if (adminMode) formData.set("kind", "patient");
      const response = await fetch(adminMode ? "/api/super-admin/registrations/single" : "/api/register/patient", { method: "POST", body: formData });
      const data = await response.json();
      if (!response.ok) {
        setServerError(data.error ?? "Registration failed");
        return;
      }
      if (adminMode) { form.reset(); setSuccessMessage(`Patient registration ${data.registrationId} saved as Pending Verification.`); onCreated?.(); }
      else router.push("/register/success?type=patient");
    } catch {
      setServerError("Unable to submit registration. Check your connection and try again.");
    }
  }

  return (
    <form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Patient Name *" error={form.formState.errors.patientName?.message}>
          <TextInput {...form.register("patientName")} />
        </Field>
        <Field label="Mobile Number *" error={form.formState.errors.mobile?.message}>
          <TextInput inputMode="numeric" {...form.register("mobile")} />
        </Field>
        <Field label="Email ID" error={form.formState.errors.email?.message}>
          <TextInput type="email" {...form.register("email")} />
        </Field>
        <FileInput label="ID Proof Upload" error={form.formState.errors.idProof?.message} registration={form.register("idProof")} />
        <Field label="Gender" error={form.formState.errors.gender?.message}>
          <SelectInput {...form.register("gender")} defaultValue="">
            <option value="" disabled>Select gender</option>
            {["Female", "Male", "Other", "Prefer not to say"].map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Preferred Payment Method *" error={form.formState.errors.paymentMethod?.message}>
          <SelectInput {...form.register("paymentMethod")} defaultValue="">
            <option value="" disabled>Select payment method</option>
            {PATIENT_PAYMENT_METHODS.map((method) => <option key={method} value={method}>{method}</option>)}
          </SelectInput>
        </Field>
        <div className="md:col-span-2">
          <Field label="Address *" error={form.formState.errors.address?.message}>
            <TextArea {...form.register("address")} />
          </Field>
        </div>
      </div>
      <div>
        <a
          href="#patient-terms-and-conditions"
          onClick={(event) => {
            event.preventDefault();
            setTermsOpen(true);
          }}
          className="text-sm font-semibold text-brand underline underline-offset-2 hover:text-brand-dark"
        >
          Terms &amp; Conditions *
        </a>
      </div>
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
        <ul id="patient-terms-and-conditions" className="list-disc space-y-3 pl-5 text-sm leading-6 text-foreground">
          <li>Payment must be completed before delivery.</li>
          <li>Payments must be made using the official payment QR code printed on the bill.</li>
          <li>Cold-chain products cannot be returned or replaced.</li>
          <li>Eligible products may be returned within 7 days, subject to the company&apos;s return policy.</li>
          <li>Used medicine strips and opened or used medicines cannot be returned.</li>
          <li>The first delivery attempt is free. If the first attempt fails, an additional charge may apply for the second delivery attempt.</li>
        </ul>
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
