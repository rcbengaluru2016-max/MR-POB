import { Suspense, type ReactNode } from "react";
import { MrWorkspaceProvider } from "@/components/mr/workspace-provider";
import { MrWorkspaceShell } from "@/components/mr/workspace-shell";
import "@/components/mr/mr.css";

export const metadata = { title: "MR Workspace" };

export default function MrLayout({ children }: { children: ReactNode }) {
  return <Suspense fallback={<div className="company-workspace-loading" role="status">Loading your MR workspace…</div>}><MrWorkspaceProvider><MrWorkspaceShell>{children}</MrWorkspaceShell></MrWorkspaceProvider></Suspense>;
}
