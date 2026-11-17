/**
 * Is this a good example? Plain-language checks before an example is kept.
 * Extracted from the original's handleCaptureFrame, which repeated its own
 * keyword checks; it now uses classTraits().
 */
import { movementAmount } from "./features";
import type { ClassTraits } from "./traits";
import { KP, type PerceptionResult } from "./types";

export type CaptureIssue = "no_person" | "shoulders" | "body" | "hand" | "left_view" | "no_movement";

/** Shoulders must be at least this visible: every number is measured from them. */
const SHOULDER_VISIBLE = 0.5;
/** A moving example must have a person in at least this share of its samples. */
const MIN_PRESENT = 0.6;
/** A moving example must move wrists or hips at least this far (torso lengths). */
const MIN_MOVEMENT = 0.15;

/** Both shoulders are in view: without them nothing can be measured. */
export function shouldersInView(frame: PerceptionResult | null): boolean {
  if (!frame || !frame.hasPerson || frame.poseLandmarks.length < 17) return false;
  const pts = frame.poseLandmarks;
  return pts[KP.leftShoulder].score >= SHOULDER_VISIBLE && pts[KP.rightShoulder].score >= SHOULDER_VISIBLE;
}

export function validateCapture({
  frame,
  sequence,
  traits,
}: {
  /** The moment the example was taken (for a moving example, its last sample). */
  frame: PerceptionResult | null;
  /** The 25 samples of a moving example. */
  sequence?: readonly PerceptionResult[];
  traits: ClassTraits;
}): CaptureIssue | null {
  if (sequence) {
    const present = sequence.filter((f) => f.hasPerson).length;
    if (present === 0) return "no_person";
    if (present < sequence.length * MIN_PRESENT) return "left_view";
  }
  if (!frame || !frame.hasPerson || frame.poseLandmarks.length < 17) return "no_person";

  if (!shouldersInView(frame)) return "shoulders";
  if (traits.needsBody && frame.isFaceOnly) return "body";

  const handSeen = sequence ? sequence.some((f) => f.hasHands) : frame.hasHands;
  if (traits.needsHands && !handSeen) return "hand";

  if (sequence && traits.moving && movementAmount(sequence) < MIN_MOVEMENT) return "no_movement";
  return null;
}

/** What to tell the visitor, next to the camera. */
export function captureIssueText(issue: CaptureIssue): string {
  switch (issue) {
    case "no_person":
      return "Step in front of the camera so it can see you.";
    case "shoulders":
      return "Step back so your shoulders are in view.";
    case "body":
      return "Step back so your body is in view, down to your hips.";
    case "hand":
      return "Show your hand to the camera.";
    case "left_view":
      return "Stay in view the whole time it records.";
    case "no_movement":
      return "Keep moving the whole time it records.";
  }
}
