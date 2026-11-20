import type { GameSlug } from "@/content/games";

/**
 * One small pictogram per game, drawn on a 24px grid with a 2px stroke so it
 * sits next to 15-16px semibold text (same weight as lucide at stroke 2).
 */
export function GameGlyph({ slug, className }: { slug: GameSlug; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      {GLYPHS[slug]}
    </svg>
  );
}

const GLYPHS: Record<GameSlug, React.ReactNode> = {
  // Binary search: a range cut in half, one half kept.
  "mind-reader": (
    <>
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="M12 5v14" />
      <rect x="3" y="5" width="9" height="14" rx="3" fill="currentColor" stroke="none" opacity="0.9" />
    </>
  ),
  // Scissors.
  "rock-paper-scissors": (
    <>
      <circle cx="6.5" cy="6.5" r="2.5" />
      <circle cx="6.5" cy="17.5" r="2.5" />
      <path d="M8.6 8.1 20 19" />
      <path d="M8.6 15.9 20 5" />
    </>
  ),
  // A face, tilted, mouth open.
  "face-control": (
    <g transform="rotate(-12 12 12)">
      <rect x="4" y="3" width="16" height="18" rx="8" />
      <circle cx="9.2" cy="10" r="1" fill="currentColor" stroke="none" />
      <circle cx="14.8" cy="10" r="1" fill="currentColor" stroke="none" />
      <ellipse cx="12" cy="15.4" rx="2.2" ry="1.9" />
    </g>
  ),
  // A written stroke ending at a fingertip point.
  airwrite: (
    <>
      <path d="M3 17c2.2-6 3.6-9 5-9s.8 7 2.4 7 2.2-5 3.8-5 1.2 4 2.8 4" />
      <circle cx="19.5" cy="14.5" r="2" fill="currentColor" stroke="none" />
    </>
  ),
  // A crosshair with a dot: where the finger points.
  "sky-shot": (
    <>
      <circle cx="12" cy="12" r="7" />
      <path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4" />
      <circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none" />
    </>
  ),
  // Four corners of a hand-made frame.
  viewfinder: (
    <>
      <path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9" />
      <path d="M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9" />
      <path d="M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15" />
      <path d="M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15" />
      <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
    </>
  ),
  // A body skeleton, one arm raised.
  "train-the-machine": (
    <>
      <circle cx="12" cy="4.5" r="2" />
      <path d="M12 7v7" />
      <path d="M12 9.5 7 7" />
      <path d="M12 9.5 17 4.5" />
      <path d="M12 14 8.5 20" />
      <path d="M12 14l3.5 6" />
    </>
  ),
  // A photo with a label tag.
  "how-ai-learns": (
    <>
      <rect x="3" y="4" width="14" height="12" rx="2.5" />
      <path d="m3.5 13 4-3.5 3 2.5 2-1.5 4 3.5" />
      <path d="M13 17.5h6.5a1.5 1.5 0 0 0 1.5-1.5v-2.5L18.5 11H13a1.5 1.5 0 0 0-1.5 1.5V16a1.5 1.5 0 0 0 1.5 1.5Z" fill="currentColor" stroke="none" />
    </>
  ),
  // One frame real, one frame made of dots.
  "real-or-ai": (
    <>
      <rect x="3" y="5" width="8" height="14" rx="2" />
      <rect x="13" y="5" width="8" height="14" rx="2" strokeDasharray="0.1 3.2" />
    </>
  ),
  // A phone with a sensor dot.
  phone: (
    <>
      <rect x="6" y="2.5" width="12" height="19" rx="3" />
      <path d="M10.5 5.5h3" />
      <circle cx="12" cy="13" r="2.5" fill="currentColor" stroke="none" />
    </>
  ),
};
