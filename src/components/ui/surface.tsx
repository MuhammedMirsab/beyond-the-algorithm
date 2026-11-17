import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

/** The standard raised container. Radius 20, hairline ring, no border. */
export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("rounded-lg bg-surface shadow-ring", className)} {...props} />;
}

/** A keyboard key, for shortcut hints on the booth laptop. */
export function Kbd({ className, tone = "neutral", ...props }: ComponentProps<"kbd"> & { tone?: "neutral" | "on-game" }) {
  return (
    <kbd
      className={cn(
        "inline-grid h-6 min-w-6 place-items-center rounded-xs px-1.5 font-mono text-[0.6875rem] font-medium",
        tone === "neutral" && "bg-fg/10 text-fg-muted shadow-[inset_0_-1px_0_oklch(1_0_0/0.12)]",
        tone === "on-game" && "bg-game-ink/[0.14] text-game-ink",
        className,
      )}
      {...props}
    />
  );
}

/** The machine's voice: a mono label for readouts and model facts. */
export function MachineLabel({ className, ...props }: ComponentProps<"span">) {
  return <span className={cn("type-label text-fg-subtle", className)} {...props} />;
}

/** A pulsing dot is banned; this is a still status dot with an accessible label. */
export function StatusDot({ tone = "success", label, className }: { tone?: "success" | "warning" | "danger" | "neutral"; label: string; className?: string }) {
  const color = {
    success: "bg-success",
    warning: "bg-warning",
    danger: "bg-danger",
    neutral: "bg-fg-faint",
  }[tone];
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span aria-hidden className={cn("size-2 rounded-full", color)} />
      <span className="type-small text-fg-muted">{label}</span>
    </span>
  );
}
