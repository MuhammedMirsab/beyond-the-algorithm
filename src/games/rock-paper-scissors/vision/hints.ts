/**
 * Framing and lighting problems in plain words. The camera code reports
 * issues every frame; a hint only shows once an issue has been there for most
 * of the last few frames, so it doesn't flicker.
 */
import type { FrameQualityIssue } from "../engine/types";

export const HINT_COPY: Record<FrameQualityIssue, string> = {
  low_light: "Move to brighter light",
  multiple_hands: "Show only one hand",
  too_close: "Move your hand back a little",
  too_far: "Bring your hand closer to the camera",
  edge_clipped: "Keep your whole hand in the picture",
  low_confidence: "Make the shape clearly: a fist, a flat hand or two fingers",
  motion_blur: "Hold your hand still for a moment",
  no_hand: "Hold one hand up to the camera",
};

/** Most useful first: light and framing problems block everything else. */
const PRIORITY: FrameQualityIssue[] = [
  "low_light",
  "multiple_hands",
  "too_close",
  "too_far",
  "edge_clipped",
  "low_confidence",
  "motion_blur",
  "no_hand",
];

/** Only worth saying while a throw is expected; between rounds a lowered hand is normal. */
const ONLY_WHILE_THROWING: ReadonlySet<FrameQualityIssue> = new Set(["no_hand", "low_confidence", "motion_blur"]);

export const HINT_WINDOW = 10;
export const HINT_MIN_FRAMES = 6;

/** The hint to show for the last few frames, or null. Pure, for testing. */
export function pickHint(recent: readonly (readonly FrameQualityIssue[])[], throwing: boolean): FrameQualityIssue | null {
  const window = recent.slice(-HINT_WINDOW);
  if (window.length < HINT_MIN_FRAMES) return null;
  for (const issue of PRIORITY) {
    if (!throwing && ONLY_WHILE_THROWING.has(issue)) continue;
    const seen = window.reduce((n, issues) => n + (issues.includes(issue) ? 1 : 0), 0);
    if (seen >= HINT_MIN_FRAMES) return issue;
  }
  return null;
}

/** Keeps the last few frames' issues. */
export class HintWindow {
  private frames: FrameQualityIssue[][] = [];

  push(issues: readonly FrameQualityIssue[]): void {
    this.frames.push([...issues]);
    if (this.frames.length > HINT_WINDOW) this.frames.shift();
  }

  pick(throwing: boolean): FrameQualityIssue | null {
    return pickHint(this.frames, throwing);
  }

  clear(): void {
    this.frames = [];
  }
}
