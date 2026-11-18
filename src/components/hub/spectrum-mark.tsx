import type { GameSlug } from "@/content/games";

/** The nine game colours in hue order, so the mark reads as one spectrum from top left to bottom right. */
export const BY_HUE: GameSlug[] = [
  "mind-reader",
  "viewfinder",
  "real-or-ai",
  "rock-paper-scissors",
  "face-control",
  "train-the-machine",
  "how-ai-learns",
  "airwrite",
  "phone",
];

/**
 * The brand mark: one dot per game, in its colour, on a 3 x 3 grid. It is
 * the arcade itself, not a letter in a square.
 */
export function SpectrumMark({ size = 20 }: { size?: number }) {
  const cell = size / 3;
  const r = cell * 0.32;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="shrink-0">
      {BY_HUE.map((slug, i) => (
        <circle
          key={slug}
          cx={round((i % 3) * cell + cell / 2)}
          cy={round(Math.floor(i / 3) * cell + cell / 2)}
          r={round(r)}
          fill={`var(--color-${slug})`}
        />
      ))}
    </svg>
  );
}

/** Same numbers on the server and the client, so hydration never mismatches. */
const round = (n: number) => Math.round(n * 1000) / 1000;
