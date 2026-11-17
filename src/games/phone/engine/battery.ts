import { clockLabel, mean, type Guess } from "./math";
import type { ChargeDay } from "../data/battery";

/**
 * Battery maths. `drain` is the original BatteryExperiment rule (never below
 * 5%, so the phone stays on for the demo); the routine guess reads a week of
 * charging the way a phone's own battery log could.
 */

export const DRAIN_FLOOR = 5;
export const FULL = 100;
export const LOW_AT = 20;

export function drain(level: number, amount: number, floor = DRAIN_FLOOR): number {
  return Math.max(floor, Math.round(level - amount));
}

/** "2 h 05 min" from seconds, or null when the browser doesn't know (Infinity). */
export function formatDuration(seconds: number): string | null {
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const minutes = Math.round(seconds / 60);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return `${h} h ${String(m).padStart(2, "0")} min`;
}

export function batteryGuess(levelPercent: number, charging: boolean): Guess {
  if (charging) {
    return {
      label: "Plugged in, probably at home",
      because: "People charge in the same places every day, often beside the bed or a desk.",
    };
  }
  if (levelPercent <= LOW_AT) {
    return { label: "Out for a long time", because: `Down to ${Math.round(levelPercent)}% and not charging: it hasn't been home for hours.` };
  }
  return { label: "Out and about", because: `Unplugged at ${Math.round(levelPercent)}%. Logged over a week, this shows when you leave home.` };
}

export interface SleepWindow {
  /** Minutes after midnight, can be above 1440 when bedtime is after midnight. */
  bedtime: number;
  wake: number;
}

/**
 * Overnight charging sessions (starting after 8 PM or before 3 AM and ending
 * in the morning) give away when someone sleeps. Averages their start and
 * end times. Returns null if there are no overnight sessions.
 */
export function sleepWindow(week: readonly ChargeDay[]): SleepWindow | null {
  const starts: number[] = [];
  const ends: number[] = [];
  for (const day of week) {
    for (const s of day.sessions) {
      const startsAtNight = s.start >= 20 * 60 || s.start < 3 * 60;
      const endsInMorning = s.end >= 4 * 60 && s.end <= 12 * 60;
      if (!startsAtNight || !endsInMorning) continue;
      // Put bedtimes after midnight on the same scale as the ones before it.
      starts.push(s.start < 12 * 60 ? s.start + 24 * 60 : s.start);
      ends.push(s.end);
    }
  }
  if (starts.length === 0) return null;
  return { bedtime: Math.round(mean(starts)), wake: Math.round(mean(ends)) };
}

/**
 * The charging bars to draw on one day's row: its own sessions, cut at
 * midnight, plus the morning end of the previous night's session.
 */
export function daySegments(week: readonly ChargeDay[], index: number): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = [];
  const previous = week[(index + week.length - 1) % week.length];
  for (const s of previous.sessions) if (s.end < s.start) out.push({ from: 0, to: s.end });
  for (const s of week[index].sessions) out.push(s.end < s.start ? { from: s.start, to: 24 * 60 } : { from: s.start, to: s.end });
  return out;
}

/** Rounds to the nearest quarter hour so the guess sounds like a guess. */
export function roughClock(minutes: number): string {
  return clockLabel(Math.round(minutes / 15) * 15);
}
