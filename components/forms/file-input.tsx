"use client";

import { Field } from "@/components/ui/field";
import type { UseFormRegisterReturn } from "react-hook-form";

export function FileInput({
  label,
  error,
  registration,
  hint,
  required = false,
}: {
  label: string;
  error?: string;
  registration: UseFormRegisterReturn;
  hint?: string;
  required?: boolean;
}) {
  return (
    <Field label={label} error={error}>
      <input
        type="file"
        required={required}
        accept="image/jpeg,image/png,image/webp,application/pdf"
        className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-brand file:px-3 file:py-1.5 file:text-white"
        {...registration}
      />
      {hint ? <p className="mt-1.5 text-xs text-muted">{hint}</p> : null}
    </Field>
  );
}
