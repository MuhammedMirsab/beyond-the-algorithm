import { GAMES } from "@/content/games";

/**
 * The brand mark: one dot per game, in its colour, on a 3 x 3 grid.
 * It is the arcade itself, not a letter in a square.
 */
export function SpectrumMark({ size = 20 }: { size?: number }) {
  const cell = size / 3;
  const r = cell * 0.32;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="shrink-0">
      {GAMES.map((game, i) => (
        <circle
          key={game.slug}
          cx={(i % 3) * cell + cell / 2}
          cy={Math.floor(i / 3) * cell + cell / 2}
          r={r}
          fill={`var(--color-${game.slug})`}
        />
      ))}
    </svg>
  );
}
