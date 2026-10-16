import { cn } from "@/lib/utils";

const styles: Record<string, string> = {
  pending_verification: "bg-amber-100 text-warning",
  submitted: "bg-sky-100 text-sky-800",
  approved: "bg-emerald-100 text-success",
  rejected: "bg-red-100 text-danger",
  created: "bg-slate-100 text-slate-700",
  active: "bg-emerald-100 text-success",
  inactive: "bg-red-100 text-red-700",
  locked: "bg-red-100 text-red-700",
  unlocked: "bg-emerald-50 text-success",
  sent: "bg-emerald-100 text-success",
};

export function StatusBadge({ value }: { value: string }) {
  const accountIsActive = value === "active" || value === "unlocked";
  const accountIsInactive = value === "inactive" || value === "locked";
  const label = accountIsActive ? "Active" : accountIsInactive ? "Inactive" : value.replaceAll("_", " ");
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize",
        styles[value] ?? "bg-slate-100 text-slate-700",
      )}
    >
      {label}
    </span>
  );
}
