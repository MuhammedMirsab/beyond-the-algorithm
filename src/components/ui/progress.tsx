import { cn } from "@/lib/cn";

/**
 * A determinate progress bar. Animates transform only (scaleX), so it stays
 * smooth while models load on the main thread.
 */
export function Progress({
  value,
  label,
  tone = "fg",
  className,
}: {
  /** 0 to 1. */
  value: number;
  /** Accessible name, e.g. "Loading hand model". */
  label: string;
  tone?: "fg" | "game" | "on-game";
  className?: string;
}) {
  const clamped = Math.min(1, Math.max(0, value));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped * 100)}
      className={cn(
        "relative h-1.5 w-full overflow-hidden rounded-full",
        tone === "on-game" ? "bg-game-ink/15" : "bg-fg/10",
        className,
      )}
    >
      <div
        className={cn(
          "absolute inset-0 origin-left rounded-full transition-transform duration-300 ease-out",
          tone === "fg" && "bg-fg",
          tone === "game" && "bg-game",
          tone === "on-game" && "bg-game-ink",
        )}
        style={{ transform: `scaleX(${clamped})` }}
      />
    </div>
  );
}

/** Where you are in a short sequence (rounds, steps). Current step is a wide pill. */
export function StepDots({
  total,
  current,
  label,
  className,
}: {
  total: number;
  /** 0-based index of the current step. Steps before it read as done. */
  current: number;
  label: string;
  className?: string;
}) {
  return (
    <div
      role="img"
      aria-label={`${label}: ${Math.min(current + 1, total)} of ${total}`}
      className={cn("flex items-center gap-1.5", className)}
    >
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={cn(
            "h-1.5 rounded-full transition-[width,background-color] duration-250 ease-out",
            i === current ? "w-6 bg-game" : "w-1.5",
            i < current && "bg-fg-muted",
            i > current && "bg-fg/15",
          )}
        />
      ))}
    </div>
  );
}
