"use client";

import NumberFlow, { type Format } from "@number-flow/react";
import { cn } from "@/lib/cn";

/**
 * Scoreboard numerals in the dot-matrix face. Values animate only when they
 * change because the game state changed (never a count-up on mount).
 */
export function Score({
  value,
  label,
  format,
  suffix,
  className,
  tone = "fg",
}: {
  value: number;
  /** Shown under the number in the machine voice, and used as the accessible name. */
  label?: string;
  format?: Format;
  suffix?: string;
  className?: string;
  tone?: "fg" | "game" | "on-game";
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <NumberFlow
        value={value}
        format={format}
        suffix={suffix}
        willChange
        animated
        className={cn(
          "type-score",
          tone === "fg" && "text-fg",
          tone === "game" && "text-game",
          tone === "on-game" && "text-game-ink",
        )}
        aria-label={label ? `${label}: ${value}${suffix ?? ""}` : undefined}
      />
      {label ? (
        <span aria-hidden className={cn("type-label", tone === "on-game" ? "text-game-ink/70" : "text-fg-subtle")}>
          {label}
        </span>
      ) : null}
    </div>
  );
}

/** A compact stat for result screens and HUDs: value over label. */
export function Stat({ value, label, className }: { value: string | number; label: string; className?: string }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      <span className="type-title-2 tabular-nums text-fg">{value}</span>
      <span className="type-caption text-fg-subtle">{label}</span>
    </div>
  );
}
