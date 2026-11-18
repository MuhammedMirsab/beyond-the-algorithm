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
            "size-3 rounded-full transition-[background-color,box-shadow,scale] duration-300 ease-out",
            i < lives ? "bg-game" : "scale-75 bg-transparent shadow-[inset_0_0_0_1.5px_var(--color-fg-faint)]",
          )}
        />
      ))}
    </span>
  );
}

export type Move = "left" | "right" | "jump";

/**
 * The three moves as pictures: a head tilting toward a shoulder, or a mouth
 * opening with the ball's jump above it. Recognition over recall: nobody has
 * to remember which way "left" means for a head.
 */
export function MovePictogram({ move, className }: { move: Move; className?: string }) {
  const tilt = move === "left" ? -16 : move === "right" ? 16 : 0;
  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("size-8 shrink-0", className)}
    >
      <g transform={`rotate(${tilt} 16 27)`}>
        <rect x="9" y="7" width="14" height="17" rx="7" />
        <circle cx="13.5" cy="13.5" r="0.9" fill="currentColor" stroke="none" />
        <circle cx="18.5" cy="13.5" r="0.9" fill="currentColor" stroke="none" />
        {move === "jump" ? <ellipse cx="16" cy="19" rx="2" ry="2.3" /> : <path d="M14 19.2h4" />}
      </g>
      {move === "jump" ? (
        <path d="M16 4.5V1.5M13.8 3.4 16 1.2l2.2 2.2" />
      ) : move === "left" ? (
        <path d="M6.5 6.5a12 12 0 0 0-3 7.5M3.2 11.2l.3 2.9 2.7-1.1" />
      ) : (
        <path d="M25.5 6.5a12 12 0 0 1 3 7.5M28.8 11.2l-.3 2.9-2.7-1.1" />
      )}
    </svg>
  );
}

/** The finish gate, as on the level track. */
export function FlagIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className={cn("size-4 shrink-0", className)}>
      <rect x="2" y="1" width="1.6" height="14" rx="0.8" fill="currentColor" />
      <path d="M3.6 2h10v6h-10z" fill="currentColor" fillOpacity={0.25} />
      <path d="M3.6 2h3.3v3H3.6zM10.3 2h3.3v3h-3.3zM6.9 5h3.4v3H6.9z" fill="currentColor" />
    </svg>
  );
}
