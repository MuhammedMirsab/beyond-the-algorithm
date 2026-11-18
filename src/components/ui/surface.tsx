import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

/** The standard raised container. Radius 20, hairline ring, no border. */
export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("rounded-lg bg-surface shadow-ring", className)} {...props} />;
}

/**
 * A keyboard key, drawn like a real key cap: a lighter top, a darker lip at
 * the bottom. For shortcut hints on the booth laptop; `KeyHints` lays out several.
 */
export function Kbd({
  className,
  tone = "neutral",
  size = "sm",
  ...props
}: ComponentProps<"kbd"> & { tone?: "neutral" | "on-game"; size?: "sm" | "md" }) {
  return (
    <kbd
      className={cn(
        "inline-grid place-items-center font-mono font-medium leading-none",
        size === "sm" ? "h-6 min-w-6 rounded-[6px] px-1.5 pb-px text-[0.6875rem]" : "h-8 min-w-8 rounded-[8px] px-2.5 pb-0.5 text-[0.8125rem]",
        tone === "neutral" &&
          "bg-raised text-fg shadow-[inset_0_1px_0_oklch(1_0_0/0.10),inset_0_-2px_0_oklch(0_0_0/0.45),0_0_0_1px_oklch(1_0_0/0.10)]",
        tone === "on-game" && "bg-game-ink/[0.14] text-game-ink shadow-[inset_0_-2px_0_oklch(0_0_0/0.22)]",
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
