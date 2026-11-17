import { cn } from "@/lib/cn";

/** The spark you collect in the game: an eight-point star, like the one in the world. */
export function SparkIcon({ className }: { className?: string }) {
  const points = Array.from({ length: 8 }, (_, i) => {
    const a = (i * Math.PI) / 4 - Math.PI / 2;
    const r = i % 2 === 0 ? 11 : 3.6;
    return `${(12 + Math.cos(a) * r).toFixed(2)},${(12 + Math.sin(a) * r).toFixed(2)}`;
  }).join(" ");
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cn("size-4 shrink-0", className)}>
      <polygon points={points} fill="currentColor" />
    </svg>
  );
}

/** Five lives as small balls: filled while you have them, an outline once lost. */
export function Lives({ lives, total, className }: { lives: number; total: number; className?: string }) {
  return (
    <span role="img" aria-label={`${lives} of ${total} lives left`} className={cn("flex items-center gap-1", className)}>
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          aria-hidden
          className={cn(
            "size-3 rounded-full transition-[background-color,box-shadow] duration-200 ease-out",
            i < lives ? "bg-game" : "bg-transparent shadow-[inset_0_0_0_1.5px_var(--color-fg-faint)]",
          )}
        />
      ))}
    </span>
  );
}
