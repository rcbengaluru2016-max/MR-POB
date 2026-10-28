"use client";

export default function AccountError({ reset }: { reset: () => void }) {
  return <section className="mx-auto max-w-5xl rounded-2xl border border-line bg-white p-6 shadow-sm">
    <h1 className="text-2xl font-semibold">Account Information</h1>
    <p role="alert" className="mt-3 text-sm text-danger">Account information is temporarily unavailable. Please retry.</p>
    <button onClick={reset} className="mt-4 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white">Retry</button>
  </section>;
}
