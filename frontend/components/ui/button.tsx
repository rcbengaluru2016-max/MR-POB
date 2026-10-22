import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
};

export function Button({ className, variant = "primary", ...props }: Props) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60",
        variant === "primary" && "bg-brand text-white hover:bg-brand-dark",
        variant === "secondary" && "border border-line bg-white text-brand hover:bg-background",
        variant === "danger" && "bg-danger text-white hover:bg-red-800",
        variant === "ghost" && "text-brand hover:bg-background",
        className,
      )}
      {...props}
    />
  );
}
