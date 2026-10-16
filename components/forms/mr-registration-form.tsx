"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { FileInput } from "@/components/forms/file-input";
import { TermsDialog } from "@/components/forms/terms-dialog";
import { Button } from "@/components/ui/button";
import { Field, SelectInput, TextInput } from "@/components/ui/field";
import { MR_POSITIONS } from "@/lib/constants";
import { mrRegistrationSchema } from "@/lib/validation";
import type { z } from "zod";

type Values = z.infer<typeof mrRegistrationSchema>;

export function MrRegistrationForm({ adminMode = false, onCreated }: { adminMode?: boolean; onCreated?: () => void }) {
  const router = useRouter();
  const [serverError, setServerError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [termsOpen, setTermsOpen] = useState(false);
  const form = useForm<Values>({
    resolver: zodResolver(mrRegistrationSchema),
    defaultValues: {
      mrName: "",
      mobile: "",
      email: "",
      password: "",
      confirmPassword: "",
      companyName: "",
      division: "",
    },
  });

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
      if (adminMode) formData.set("kind", "mr");
      const response = await fetch(adminMode ? "/api/super-admin/registrations/single" : "/api/register/mr", { method: "POST", body: formData });
      const data = await response.json();
      if (!response.ok) {
        setServerError(data.error ?? "Registration failed");
        return;
      }
      if (adminMode) { form.reset(); setSuccessMessage(`MR registration ${data.registrationId} saved as Pending Verification.`); onCreated?.(); }
      else router.push("/register/success?type=mr");
    } catch {
      setServerError("Unable to submit registration. Check your connection and try again.");
    }
  }

  return (
    <form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="MR Name *" error={form.formState.errors.mrName?.message}>
          <TextInput {...form.register("mrName")} />
        </Field>
        <Field label="Mobile Number *" error={form.formState.errors.mobile?.message}>
          <TextInput inputMode="numeric" {...form.register("mobile")} />
        </Field>
        <Field label="Email ID *" error={form.formState.errors.email?.message}>
          <TextInput type="email" {...form.register("email")} />
        </Field>
        <Field label="Company Name *" error={form.formState.errors.companyName?.message}>
          <TextInput {...form.register("companyName")} />
        </Field>
        <Field label="Division *" error={form.formState.errors.division?.message}>
          <TextInput {...form.register("division")} />
        </Field>
        <Field label="Position *" error={form.formState.errors.position?.message}>
          <SelectInput {...form.register("position")} defaultValue="">
            <option value="" disabled>
              Select position
            </option>
            {MR_POSITIONS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Password *" error={form.formState.errors.password?.message}>
          <TextInput type="password" {...form.register("password")} />
        </Field>
        <Field label="Confirm Password *" error={form.formState.errors.confirmPassword?.message}>
          <TextInput type="password" {...form.register("confirmPassword")} />
        </Field>
        <FileInput label="MR Photo *" error={form.formState.errors.mrPhoto?.message} registration={form.register("mrPhoto")} />
        <FileInput
          label="Visiting Card Upload *"
          error={form.formState.errors.visitingCard?.message}
          registration={form.register("visitingCard")}
          hint="Printed and handwritten visiting cards are accepted. Upload a photo, scan, or PDF."
        />
      </div>
      <div>
        <a
          href="#mr-terms-and-conditions"
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
        checked={form.watch("termsAccepted") === true}
        onCheckedChange={(checked) => form.setValue("termsAccepted", checked, {
          shouldDirty: true,
          shouldTouch: true,
          shouldValidate: true,
        })}
        onClose={() => setTermsOpen(false)}
      >
        <ol id="mr-terms-and-conditions" className="list-decimal space-y-3 pl-5 text-sm leading-6 text-foreground">
          <li>I will use this application exclusively for booking orders for my company and Zenex International.</li>
          <li>I will not share any company, customer, pricing, or business information with other companies or competitors.</li>
          <li>This application is provided as a facility for order booking and does not constitute proof of any claims or commitments.</li>
          <li>I will not collect payments from customers or handle stock on behalf of Zenex International.</li>
          <li>I am responsible for ensuring that customers fulfil their payment obligations, as per the company&apos;s policies.</li>
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
