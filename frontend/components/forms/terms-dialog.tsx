"use client";

import { useEffect, useEffectEvent, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

export function TermsDialog({
  open,
  title,
  checked,
  onCheckedChange,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  onClose: () => void;
  children: ReactNode;
}) {
  const titleId = useId();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const closeDialog = useEffectEvent(onClose);

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    closeButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDialog();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[calc(100svh-2rem)] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-xl"
      >
        <header className="flex items-center justify-between gap-4 border-b border-line px-5 py-4">
          <h2 id={titleId} className="text-lg font-semibold text-foreground">{title}</h2>
          <button
            ref={closeButtonRef}
            type="button"
            aria-label="Close Terms & Conditions"
            onClick={onClose}
            className="rounded-lg p-2 text-muted hover:bg-background hover:text-foreground focus-visible:outline-2 focus-visible:outline-brand"
          >
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </header>
        <div className="min-h-0 overflow-y-auto p-5">{children}</div>
        <footer className="border-t border-line px-5 py-4">
          <label className="flex cursor-pointer items-start gap-3 text-sm font-medium text-foreground">
            <input
              type="checkbox"
              checked={checked}
              onChange={(event) => {
                const isAccepted = event.target.checked;
                onCheckedChange(isAccepted);
                if (isAccepted) onClose();
              }}
              className="mt-1"
            />
            <span>I Agree *</span>
          </label>
        </footer>
      </section>
    </div>
  );
}
