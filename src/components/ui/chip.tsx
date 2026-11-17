import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

type Tone = "neutral" | "game" | "on-game" | "success" | "danger" | "warning";

const tones: Record<Tone, string> = {
  neutral: "bg-fg/[0.07] text-fg-muted",
  game: "bg-game-soft text-game",
  "on-game": "bg-game-ink/[0.12] text-game-ink",
  success: "bg-success/15 text-success",
  danger: "bg-danger/15 text-danger",
  warning: "bg-warning/15 text-warning",
};

/**
 * Static information: requirements, durations, statuses. A chip never looks
 * like a button: no border, no hover, no pointer.
 */
export function Chip({
  icon,
  tone = "neutral",
  className,
  children,
  ...props
}: ComponentProps<"span"> & { icon?: ReactNode; tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[0.8125rem] font-medium [&_svg]:size-3.5 [&_svg]:shrink-0",
        tones[tone],
        className,
      )}
      {...props}
    >
      {icon}
      {children}
    </span>
  );
}

/** A filter or option that can be switched on. Looks pressable, unlike Chip. */
export function ToggleChip({
  pressed,
  icon,
  className,
  children,
  type = "button",
  ...props
}: ComponentProps<"button"> & { pressed: boolean; icon?: ReactNode }) {
  return (
    <button
      type={type}
      aria-pressed={pressed}
      className={cn(
        "inline-flex h-10 select-none items-center gap-2 whitespace-nowrap rounded-full px-4 text-[0.9375rem] font-semibold",
        "transition-[background-color,color,box-shadow,scale] duration-150 ease-out active:scale-[0.97]",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg [&_svg]:size-4",
        pressed ? "bg-fg text-canvas" : "bg-surface text-fg-muted shadow-ring hover:bg-raised hover:text-fg",
        className,
      )}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}
