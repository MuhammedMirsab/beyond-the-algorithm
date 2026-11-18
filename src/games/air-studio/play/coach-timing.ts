import { REVEAL_LINES, type CoachLine } from "./coach";
import type { Reveal } from "./reveal";

/**
 * When the coach's line changes. Pure, so the rules can be tested:
 * - a camera problem shows once it has lasted WARN_HOLD_MS, and goes as soon as it is fixed;
 * - any other line stays at least MIN_SHOW_MS, so it can be read from a step away;
 * - when part of the studio is revealed, the coach points to it once, for
 *   ANNOUNCE_MS from the moment it actually shows (dropped if it can't show
 *   within ANNOUNCE_STALE_MS, say behind a long camera problem).
 */

export const MIN_SHOW_MS = 2600;
export const WARN_HOLD_MS = 700;
export const ANNOUNCE_MS = 4200;
export const ANNOUNCE_STALE_MS = 10_000;

export interface CoachTiming {
  shown: CoachLine | null;
  shownAt: number;
  warn: { id: string; since: number } | null;
  announce: { line: CoachLine; since: number; shownAt: number | null } | null;
  reveal: Reveal;
}

export const coachStart = (reveal: Reveal): CoachTiming => ({ shown: null, shownAt: 0, warn: null, announce: null, reveal });

export interface CoachMoment {
  reveal: Reveal;
  /** The coach is on screen at all (playing, not measuring, no lesson). */
  active: boolean;
  /** What the camera needs fixed, if anything (cameraLine). */
  camera: CoachLine | null;
  /** The next move on this instrument (lessonLine). */
  lesson: CoachLine | null;
}

const sameLine = (a: CoachLine | null, b: CoachLine | null) => a?.id === b?.id && a?.text === b?.text;

export function stepCoach(t: CoachTiming, now: number, m: CoachMoment): CoachTiming {
  let announce = t.announce;
  if (m.reveal > t.reveal && m.reveal >= 1) announce = { line: REVEAL_LINES[m.reveal as 1 | 2 | 3], since: now, shownAt: null };
  if (announce && announce.shownAt === null && now - announce.since > ANNOUNCE_STALE_MS) announce = null;
  if (announce && announce.shownAt !== null && now - announce.shownAt >= ANNOUNCE_MS) announce = null;

  if (!m.active) return { ...t, shown: null, warn: null, announce, reveal: m.reveal };

  let warn = t.warn;
  if (m.camera) {
    if (!warn || warn.id !== m.camera.id) warn = { id: m.camera.id, since: now };
  } else warn = null;
  const camera = m.camera && warn && now - warn.since >= WARN_HOLD_MS ? m.camera : null;
  const next = camera ?? announce?.line ?? m.lesson;

  const base: CoachTiming = { ...t, warn, announce, reveal: m.reveal };
  if (sameLine(next, t.shown)) return base;
  // Warnings come and go at once; anything else waits until the last line has been up long enough to read.
  const urgent = next?.tone === "warn" || t.shown?.tone === "warn";
  if (!urgent && t.shown && now - t.shownAt < MIN_SHOW_MS) return base;
  if (announce && next === announce.line && announce.shownAt === null) base.announce = { ...announce, shownAt: now };
  return { ...base, shown: next, shownAt: now };
}
