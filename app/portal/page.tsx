"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type User = { username: string; displayName: string; userType: string };

export default function PortalPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/auth/me")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Unable to load your account.");
        return data;
      })
      .then((data) => {
        if (data.user?.userType === "company") {
          router.replace("/company/dashboard");
          return;
        }
        setUser(data.user);
      })
      .catch((item: unknown) => {
        setError(item instanceof Error ? item.message : "Unable to load your account.");
      });
  }, [router]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  if (error) return <p className="p-8 text-danger" role="alert">{error}</p>;
  if (!user) return <p className="p-8">Loading…</p>;

  return (
    <div className="mx-auto max-w-xl p-8">
      <h1 className="text-2xl font-semibold text-foreground">Account activated</h1>
      <p className="mt-3 text-muted">
        Welcome {user.displayName}. Your username is your Master Code.
      </p>
      <p className="mt-2 font-mono text-lg">{user.username}</p>
      <p className="mt-4 text-sm text-muted">
        Role: {user.userType}. Operational dashboards for ordering and visits can be added here
        after this onboarding module.
      </p>
      <Button className="mt-6" onClick={logout}>
        Logout
      </Button>
    </div>
  );
}
