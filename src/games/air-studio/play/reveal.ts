/**
 * Progressive disclosure: the studio shows itself one step at a time, as the
 * visitor plays. A visitor who walks up sees only the instrument; each part
 * of the dock arrives when it is the natural next thing to try.
 *
 *   0  the instrument alone (percussion, ready to hit)
 *   1  the instrument switcher and settings
 *   2  play along and record
 *   3  practice
 *
 * A step arrives after enough notes, or after enough seconds of live play
 * for someone who is still finding their way, and never two at once, so
 * each one is noticed. A recorded take brings practice at once.
 */

export type Reveal = 0 | 1 | 2 | 3;

export const REVEAL_STEPS: readonly { events: number; seconds: number }[] = [
  { events: 3, seconds: 12 },
  { events: 12, seconds: 40 },
  { events: 30, seconds: 80 },
];

/** Seconds between two steps arriving. */
export const REVEAL_GAP_S = 4;

export function nextReveal(current: Reveal, s: { events: number; seconds: number; hasTake: boolean; sinceLast: number }): Reveal {
  if (current >= 3) return 3;
  if (current > 0 && s.sinceLast < REVEAL_GAP_S) return current;
  const step = REVEAL_STEPS[current];
  const due = s.events >= step.events || s.seconds >= step.seconds || (current === 2 && s.hasTake);
  return due ? ((current + 1) as Reveal) : current;
}
