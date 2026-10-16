"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Field, TextInput } from "@/components/ui/field";
import { forgotPasswordSchema } from "@/lib/validation";
import type { z } from "zod";

type Values = z.infer<typeof forgotPasswordSchema>;

export function ForgotPasswordForm() {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const form = useForm<Values>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  async function onSubmit(values: Values) {
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Unable to send recovery instructions.");
        return;
      }
      setMessage(data.message);
    } catch {
      setError("Unable to send recovery instructions. Check your connection and try again.");
    }
  }

  return (
    <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
      <Field label="Email ID" error={form.formState.errors.email?.message}>
        <TextInput type="email" {...form.register("email")} />
      </Field>
      {message ? <p className="text-sm text-success" role="status">{message}</p> : null}
      {error ? <p className="text-sm text-danger" role="alert">{error}</p> : null}
      <Button className="w-full" disabled={form.formState.isSubmitting}>
        Send recovery instructions
      </Button>
      <Link className="block text-center text-sm font-medium text-brand hover:underline" href="/login">
        Back to login
      </Link>
    </form>
  );
}
