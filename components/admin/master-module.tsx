"use client";

import { useEffect, useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Field, SelectInput, TextInput } from "@/components/ui/field";
import { StatusBadge } from "@/components/ui/status-badge";
import { PAYMENT_MODES } from "@/lib/constants";
import type { MasterRecord } from "@/lib/types";

export function MasterModule({
  kind,
  title,
}: {
  kind: "customer" | "mr" | "patient";
  title: string;
}) {
  const [items, setItems] = useState<MasterRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<MasterRecord | null>(null);
  const [confirm, setConfirm] = useState<"inactive" | null>(null);
  const [error, setError] = useState("");

  async function load() {
    const response = await fetch(`/api/admin/masters?kind=${kind}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Unable to load master records.");
    const nextItems: MasterRecord[] = data.items ?? [];
    setItems(nextItems);
    return nextItems;
  }

  useEffect(() => {
    let active = true;
    fetch(`/api/admin/masters?kind=${kind}`)
      .then((response) => {
        if (!response.ok) throw new Error("Unable to load master records.");
        return response.json();
      })
      .then((data) => {
        if (active) {
          setError("");
          setItems(data.items ?? []);
          setLoading(false);
        }
      })
      .catch((item: unknown) => {
        if (active) {
          setError(item instanceof Error ? item.message : "Unable to load master records.");
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [kind]);

  async function save() {
    if (!selected) return;
    setError("");
    try {
      const response = await fetch("/api/admin/masters", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(selected),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to save master record.");
      await load();
    } catch (item) {
      setError(item instanceof Error ? item.message : "Unable to save master record.");
    }
  }

  async function setStatus(status: "active" | "inactive") {
    if (!selected) return;
    setError("");
    try {
      const response = await fetch("/api/admin/masters", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: selected.code, status }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to update master status.");
      setConfirm(null);
      const nextItems = await load();
      setSelected(nextItems.find((item) => item.code === selected.code) ?? null);
    } catch (item) {
      setError(item instanceof Error ? item.message : "Unable to update master status.");
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[320px_1fr]">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
        {error ? <p className="mt-3 text-sm text-danger" role="alert">{error}</p> : null}
        <div className="mt-4 divide-y divide-line rounded-2xl border border-line bg-white">
          {items.map((item) => (
            <button
              key={item.code}
              type="button"
              onClick={() => setSelected(item)}
              className="block w-full px-4 py-3 text-left hover:bg-background"
            >
              <span className="block font-medium">{item.code}</span>
              <span className="text-sm text-muted">
                {item.kind === "customer"
                  ? item.customerName
                  : item.kind === "mr"
                    ? item.mrName
                    : item.patientName}
              </span>
            </button>
          ))}
          {loading ? <p className="px-4 py-6 text-sm text-muted">Loading master records…</p> : null}
          {!loading && !error && items.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted">No master records yet.</p>
          ) : null}
        </div>
      </div>

      {selected ? (
        <div className="space-y-4 rounded-2xl border border-line bg-white p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold text-foreground">{selected.code}</h2>
            <StatusBadge value={selected.status} />
          </div>
          <p className="text-sm text-muted">
            Auto-populated from registration {selected.registrationId}. Backend staff should edit ERP fields only.
          </p>
          <dl className="grid gap-3 sm:grid-cols-2">
            {Object.entries(selected)
              .filter(([key]) => !["files", "kind"].includes(key))
              .map(([key, value]) => (
                <div key={key}>
                  <dt className="text-xs uppercase tracking-wide text-muted">{key}</dt>
                  <dd className="text-sm">{String(value ?? "—")}</dd>
                </div>
              ))}
          </dl>

          {selected.kind === "customer" ? (
            <div className="grid gap-4 border-t border-line pt-4 md:grid-cols-2">
              <h3 className="md:col-span-2 font-semibold text-foreground">ERP fields</h3>
              <Field label="Sales Representative / MR Name">
                <TextInput
                  value={selected.salesRepresentative ?? ""}
                  onChange={(event) =>
                    setSelected({ ...selected, salesRepresentative: event.target.value })
                  }
                />
              </Field>
              <Field label="Discount %">
                <TextInput
                  type="number"
                  value={selected.discountPercent ?? ""}
                  onChange={(event) =>
                    setSelected({
                      ...selected,
                      discountPercent: event.target.value === "" ? null : Number(event.target.value),
                    })
                  }
                />
              </Field>
              <Field label="Credit Period">
                <TextInput
                  value={selected.creditPeriod ?? ""}
                  onChange={(event) => setSelected({ ...selected, creditPeriod: event.target.value })}
                />
              </Field>
              <Field label="Credit Amount / Credit Limit">
                <TextInput
                  type="number"
                  value={selected.creditLimit ?? ""}
                  onChange={(event) =>
                    setSelected({
                      ...selected,
                      creditLimit: event.target.value === "" ? null : Number(event.target.value),
                    })
                  }
                />
              </Field>
              <Field label="Payment Mode">
                <SelectInput
                  value={selected.paymentMode ?? ""}
                  onChange={(event) => setSelected({ ...selected, paymentMode: event.target.value })}
                >
                  <option value="">Select</option>
                  {PAYMENT_MODES.map((mode) => (
                    <option key={mode} value={mode}>
                      {mode}
                    </option>
                  ))}
                </SelectInput>
              </Field>
            </div>
          ) : null}

          {selected.kind === "mr" ? (
            <div className="grid gap-4 border-t border-line pt-4 md:grid-cols-2">
              <h3 className="md:col-span-2 font-semibold text-foreground">ERP fields</h3>
              <Field label="Assigned Manager">
                <TextInput
                  value={selected.assignedManager ?? ""}
                  onChange={(event) =>
                    setSelected({ ...selected, assignedManager: event.target.value })
                  }
                />
              </Field>
              <Field label="Territory / Area">
                <TextInput
                  value={selected.territory ?? ""}
                  onChange={(event) => setSelected({ ...selected, territory: event.target.value })}
                />
              </Field>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <Button onClick={save}>Save</Button>
            <Button variant="secondary" onClick={() => setStatus("active")}>
              Active
            </Button>
            <Button variant="danger" onClick={() => setConfirm("inactive")}>
              Deactivate
            </Button>
          </div>
          <ConfirmDialog
            open={confirm === "inactive"}
            title="Deactivate master"
            description="The related account should also be reviewed under Users & Accounts."
            confirmLabel="Deactivate"
            danger
            error={error}
            onClose={() => setConfirm(null)}
            onConfirm={() => setStatus("inactive")}
          />
        </div>
      ) : (
        <p className="text-sm text-muted">Select a master record to view auto-populated and ERP fields.</p>
      )}
    </div>
  );
}
