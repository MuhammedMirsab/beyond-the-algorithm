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
  // A wave with a fingertip riding its crest: pitch follows the hand.
  synth: (
    <>
      <path d="M2 12.5c1.5-5 3.5-5 5 0s3.5 5 5 0 3.5-5 5 0 3.5 5 5 0" />
      <circle cx="14.5" cy="8.75" r="2.2" fill="currentColor" stroke="none" />
    </>
  ),
};
