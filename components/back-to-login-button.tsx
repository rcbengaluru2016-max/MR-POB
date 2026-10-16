"use client";

import { useState } from "react";

export function BackToLoginButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function logoutAndReturn() {
    setBusy(true);
    setError("");

    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("Logout failed.");
      window.location.replace("/login");
    } catch {
      setError("Unable to clear your session. Please try again.");
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={logoutAndReturn}
        disabled={busy}
        className="mt-5 inline-flex min-h-11 items-center rounded-lg bg-brand px-5 text-sm font-semibold text-white hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? "Returning to Login…" : "Back to Login"}
      </button>
      {error ? <p className="mt-3 text-sm text-danger" role="alert">{error}</p> : null}
    </>
  );
}
