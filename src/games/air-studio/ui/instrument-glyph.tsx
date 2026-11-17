import type { InstrumentId } from "../engine/settings";
import { cn } from "@/lib/cn";

/**
 * One pictogram per instrument, drawn on the arcade's 24px glyph grid with
 * round caps. Strokes don't scale with the icon (vector-effect), so the same
 * drawing reads at 20px in the dock and at 72px on a picker card.
 */
export function InstrumentGlyph({ id, strokeWidth = 2, className }: { id: InstrumentId; strokeWidth?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={cn("[&_*]:[vector-effect:non-scaling-stroke]", className)}
    >
      {GLYPHS[id]}
    </svg>
  );
}

const GLYPHS: Record<InstrumentId, React.ReactNode> = {
  // Three white keys and two black ones.
  piano: (
    <>
      <rect x="3" y="5.5" width="18" height="13" rx="2" />
      <path d="M9 12.5v6M15 12.5v6" />
      <rect x="7.6" y="5.5" width="2.8" height="7" rx="0.6" fill="currentColor" />
      <rect x="13.6" y="5.5" width="2.8" height="7" rx="0.6" fill="currentColor" />
    </>
  ),
  // A snare drum and two sticks coming down on it.
  drums: (
    <>
      <ellipse cx="12" cy="12" rx="8" ry="2.8" />
      <path d="M4 12v5c0 1.55 3.6 2.8 8 2.8s8-1.25 8-2.8v-5" />
      <path d="M5.5 3.5 10.5 9.6M18.5 3.5 13.5 9.6" />
    </>
  ),
  // A guitar, neck up and to the right: two bouts, sound hole, bridge.
  guitar: (
    <g transform="translate(12 12.4) scale(1.14) rotate(42) translate(-12 -12)">
      <path d="M9.52 12.13A4.6 4.6 0 1 0 14.48 12.13A3.4 3.4 0 1 0 9.52 12.13Z" />
      <circle cx="12" cy="14.5" r="1.3" fill="currentColor" stroke="none" />
      <path d="M12 6.4V1.6" />
      <path d="M10.6 18.1h2.8" />
    </g>
  ),
  // A wave with a fingertip riding its crest: pitch follows the hand.
  synth: (
    <>
      <path d="M2 12.5c1.5-5 3.5-5 5 0s3.5 5 5 0 3.5-5 5 0 3.5 5 5 0" />
      <circle cx="14.5" cy="8.75" r="2.2" fill="currentColor" stroke="none" />
    </>
  ),
  // A pair of bongos, one bigger than the other.
  percussion: (
    <>
      <ellipse cx="8" cy="9" rx="5" ry="2" />
      <path d="M3 9v6.2c0 1.1 2.2 2 5 2s5-.9 5-2V9" />
      <ellipse cx="17.6" cy="11.4" rx="3.6" ry="1.5" />
      <path d="M14 11.4v4.4c0 .85 1.6 1.5 3.6 1.5s3.6-.65 3.6-1.5v-4.4" />
    </>
  ),
};
