"use client";
import { useState } from "react";

export function RegistrationDocumentPreview({ url, type, name }: { url: string; type: string; name: string }) {
  const [state, setState] = useState<"closed" | "loading" | "ready" | "error">("closed");
  const [source, setSource] = useState("");
  async function load() {
    setState("loading"); setSource("");
    try {
      if (url.startsWith("/api/documents/")) {
        const response = await fetch(`${url}${url.includes("?") ? "&" : "?"}metadata=1`, { cache: "no-store" });
        if (!response.ok) throw new Error("Document authorization or storage unavailable");
        const result = await response.json();
        if (typeof result.url !== "string" || !result.url.startsWith("https://")) throw new Error("Invalid preview URL");
        setSource(result.url);
      } else setSource(url);
    } catch { setState("error"); }
  }
  return <div className="mt-3 text-left">
    <button type="button" disabled={state === "loading"} onClick={() => void load()} className="text-xs font-semibold text-brand underline disabled:opacity-50">{state === "closed" ? "Show inline preview" : "Reload preview"}</button>
    {state === "loading" ? <p className="mt-2 text-xs text-muted" role="status">Loading document…</p> : null}
    {state === "error" ? <p className="mt-2 text-xs text-danger" role="alert">Preview unavailable. Reload or use the download link.</p> : null}
    {source && state !== "error" ? type === "application/pdf"
      ? <iframe key={source} src={source} title={`PDF preview: ${name}`} onLoad={() => setState("ready")} onError={() => setState("error")} referrerPolicy="no-referrer" className="mt-2 h-72 w-full rounded border border-line" />
      // Authenticated, expiring document URLs cannot use the public Next image optimizer.
      // eslint-disable-next-line @next/next/no-img-element
      : <img key={source} src={source} alt={name} onLoad={() => setState("ready")} onError={() => setState("error")} referrerPolicy="no-referrer" className="mt-2 max-h-72 w-full rounded object-contain" /> : null}
  </div>;
}
