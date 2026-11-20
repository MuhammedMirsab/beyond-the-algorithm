import type { GameSlug } from "@/content/games";

/** The ten game colours in hue order, so the mark reads as one spectrum from top to bottom. */
export const BY_HUE: GameSlug[] = [
  "mind-reader",
  "viewfinder",
  "real-or-ai",
  "sky-shot",
  "rock-paper-scissors",
  "face-control",
  "train-the-machine",
  "how-ai-learns",
  "airwrite",
  "phone",
];

/**
 * The brand mark: one dot per game, in its colour. Ten is a triangular
 * number, so they stack 1, 2, 3, 4 like a rack of pins: the arcade itself,
 * not a letter in a square.
 */
export function SpectrumMark({ size = 20 }: { size?: number }) {
  const gap = size / 4.1;
  const rise = gap * 0.866;
  const r = gap * 0.36;
  const dots: { cx: number; cy: number; slug: GameSlug }[] = [];
  let i = 0;
  for (let row = 0; row < 4; row++) {
    for (let k = 0; k <= row; k++) {
      dots.push({
        cx: size / 2 + (k - row / 2) * gap,
        cy: size / 2 + (row - 1.5) * rise,
        slug: BY_HUE[i++],
      });
    }
  }
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="shrink-0">
      {dots.map((d) => (
        <circle key={d.slug} cx={round(d.cx)} cy={round(d.cy)} r={round(r)} fill={`var(--color-${d.slug})`} />
      ))}
    </svg>
  );
}

/** Same numbers on the server and the client, so hydration never mismatches. */
const round = (n: number) => Math.round(n * 1000) / 1000;
