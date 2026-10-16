"use client";

import { useEffect, useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import type { AccountRecord } from "@/lib/types";

type SafeAccount = Omit<AccountRecord, "passwordHash" | "passwordSalt"> & {
  isCurrentUser: boolean;
};

export default function AccountsPage() {
  const [items, setItems] = useState<SafeAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<{ username: string; status: SafeAccount["status"] } | null>(
    null,
  );
  const [error, setError] = useState("");

  async function load() {
    const response = await fetch("/api/admin/accounts");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Unable to load accounts.");
    setItems(data.items ?? []);
  }

  useEffect(() => {
    let active = true;
    fetch("/api/admin/accounts")
      .then((response) => {
        if (!response.ok) throw new Error("Unable to load accounts.");
        return response.json();
      })
      .then((data) => {
        if (active) setItems(data.items ?? []);
      })
      .catch(() => {
        if (active) setError("Unable to load accounts. Refresh the page and try again.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function apply() {
    if (!pending) return;
    setError("");
    try {
      const response = await fetch("/api/admin/accounts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pending),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to update account.");
      setPending(null);
      await load();
    } catch (item) {
      setError(item instanceof Error ? item.message : "Unable to update account.");
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-foreground">Users & Accounts</h1>
      <p className="mt-1 text-sm text-muted">
        Master Code is the username. Passwords are never displayed. Only Active and Unlocked accounts can log in.
      </p>
      {error ? <p className="mt-3 text-sm text-danger" role="alert">{error}</p> : null}
      <div className="mt-6 overflow-x-auto rounded-2xl border border-line bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-background text-foreground">
            <tr>
              <th className="px-4 py-3">Username</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {!loading && !error && items.length === 0 ? (
              <tr><td className="px-4 py-8 text-muted" colSpan={5}>No accounts yet.</td></tr>
            ) : null}
            {loading ? (
              <tr><td className="px-4 py-8 text-muted" colSpan={5}>Loading accounts…</td></tr>
            ) : null}
            {items.map((item) => (
              <tr key={item.username} className="border-t border-line">
                <td className="px-4 py-3 font-medium">{item.username}</td>
                <td className="px-4 py-3">{item.userType}</td>
                <td className="px-4 py-3">{item.displayName}</td>
                <td className="px-4 py-3">
                  <StatusBadge value={item.status} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    <Button disabled={item.isCurrentUser} variant="secondary" onClick={() => setPending({ username: item.username, status: "locked" })}>
                      Lock
                    </Button>
                    <Button disabled={item.isCurrentUser} variant="secondary" onClick={() => setPending({ username: item.username, status: "unlocked" })}>
                      Unlock
                    </Button>
                    <Button disabled={item.isCurrentUser} variant="danger" onClick={() => setPending({ username: item.username, status: "inactive" })}>
                      Deactivate
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ConfirmDialog
        open={Boolean(pending)}
        title="Confirm account change"
        description={`Set ${pending?.username ?? "this account"} to ${pending?.status ?? ""}.`}
        confirmLabel="Confirm"
        danger={pending?.status !== "active"}
        onClose={() => setPending(null)}
        onConfirm={apply}
      />
    </div>
  );
}
