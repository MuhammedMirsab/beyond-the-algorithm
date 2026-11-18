import { Hand, handViewBox } from "@/components/art/games/hand-shapes";
import { cn } from "@/lib/cn";
import type { Gesture } from "../engine/types";

export const GESTURE_LABEL: Record<Gesture, string> = {
  rock: "Rock",
  paper: "Paper",
  scissors: "Scissors",
};

/** The keyboard key for each move. */
export const GESTURE_KEY: Record<Gesture, string> = {
  rock: "R",
  paper: "P",
  scissors: "S",
};

/** Why the winning move wins, the way people say it. Keyed by the winning move. */
export const WINS_LINE: Record<Gesture, string> = {
  rock: "Rock crushes scissors",
  paper: "Paper covers rock",
  scissors: "Scissors cut paper",
};

/**
 * One of the three hands as an inline picture. The same drawing as the cards
 * and the hub tile, so a move always looks the same. `ink` should match what
 * sits behind it: the outline then reads as a clean gap around the hand.
 */
export function HandGlyph({
  gesture,
  paper = "currentColor",
  ink = "var(--color-canvas)",
  cuff = false,
  weight,
  flip,
  className,
}: {
  gesture: Gesture;
  paper?: string;
  ink?: string;
  cuff?: boolean;
  weight?: number;
  flip?: boolean;
  className?: string;
}) {
  const w = weight ?? (cuff ? 4 : 7);
  return (
    <svg viewBox={handViewBox({ cuff, weight: w })} aria-hidden className={cn("shrink-0 overflow-visible", className)}>
      <Hand shape={gesture} ink={ink} paper={paper} weight={w} cuff={cuff} flip={flip} />
    </svg>
  );
}
