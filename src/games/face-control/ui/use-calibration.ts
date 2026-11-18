"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { audio } from "../engine/audio/audio";
import { formatDegrees, formatRatio } from "../engine/format";
import { Calibrator, type CalibHint } from "../engine/vision/calibration";
import type { Guidance } from "../engine/vision/face-controller";
import type { FaceControlSession } from "../play/session";

/** Seconds before "Start anyway" appears, for a face that won't sit still (or isn't there). */
export const SKIP_AFTER = 6;
/** Pause on "Got you" before the world opens. */
const DONE_MS = 800;
/** Live readouts change at most this often, so they can be read. */
const READOUT_MS = 120;

/** Positioning help, in plain words. */
export const GUIDANCE: Record<Guidance, string> = {
  ok: "Good. Hold that position",
  "no-face": "Can’t see your face. Look at the screen",
  "too-far": "Come a little closer",
  "too-close": "Move back a little",
  "move-left": "Move a little to your left",
  "move-right": "Move a little to your right",
  "move-up": "Raise your head a little",
  "move-down": "Lower your head a little",
  dark: "Find more light if you can",
};

export const HINTS: Record<Exclude<CalibHint, null>, string> = {
  "no-face": "Can’t see your face",
  "hold-still": "Hold still for a moment",
  "close-mouth": "Close your mouth for this",
  "other-way": "Other way: tilt toward your other shoulder",
  "a-bit-more": "A little more",
  hold: "Good, hold it",
};

export interface FaceCheckView {
  done: boolean;
  /** 0..1 in 5% steps (keeps re-renders low). */
  progress: number;
  hint: { text: string; ok: boolean } | null;
  /** The face is inside the guide. */
  faceOk: boolean;
  canSkip: boolean;
}

export interface FaceCheckReadouts {
  points: RefObject<HTMLElement | null>;
  eyeLine: RefObject<HTMLElement | null>;
  mouth: RefObject<HTMLElement | null>;
}

const INITIAL: FaceCheckView = { done: false, progress: 0, hint: null, faceOk: false, canSkip: false };

const same = (a: FaceCheckView, b: FaceCheckView) =>
  a.done === b.done && a.progress === b.progress && a.canSkip === b.canSkip && a.faceOk === b.faceOk && a.hint?.text === b.hint?.text && a.hint?.ok === b.hint?.ok;

const setText = (ref: RefObject<HTMLElement | null>, text: string) => {
  if (ref.current && ref.current.textContent !== text) ref.current.textContent = text;
};

/**
 * The face check: about a second of looking straight at the screen. It runs
 * the calibrator's neutral step (where your head and mouth rest), which is the
 * one measurement play can't do without. How far you tilt is learnt in
 * practice instead, and the jump line starts from the default, so the old
 * four-pose calibration is gone from the way in.
 */
export function useFaceCheck(session: FaceControlSession, readouts: FaceCheckReadouts) {
  const [view, setView] = useState<FaceCheckView>(INITIAL);
  const skipRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const calibrator = new Calibrator();
    const startedAt = performance.now();
    let lastT = startedAt;
    let lastReadout = 0;
    let finished = false;
    let points: { x: number; y: number }[] | null = null;
    let doneTimer = 0;
    let last = INITIAL;

    const publish = (next: FaceCheckView) => {
      if (same(next, last)) return;
      last = next;
      setView(next);
    };

    const finish = () => {
      if (finished) return;
      finished = true;
      audio.play("calibrated");
      publish({ done: true, progress: 1, hint: { text: "Got you", ok: true }, faceOk: true, canSkip: false });
      const profile = calibrator.result();
      const measured = { ...calibrator.measured };
      doneTimer = window.setTimeout(() => session.finishCalibration({ profile, measured, points }), DONE_MS);
    };

    // Start anyway: keep whatever neutral pose was collected (or the defaults).
    skipRef.current = () => {
      if (finished) return;
      if (calibrator.step === "neutral") calibrator.skip();
      finish();
    };
    // The way out appears on time even if tracking frames stall.
    const skipTimer = window.setTimeout(() => {
      if (!finished) publish({ ...last, canSkip: true });
    }, SKIP_AFTER * 1000);

    const off = session.onFrame((s) => {
      if (finished) return;
      const dt = Math.min(0.1, Math.max(0, (s.t - lastT) / 1000));
      lastT = s.t;
      // Wall-clock seconds on this screen: slow tracking must not delay the way out.
      const elapsed = (s.t - startedAt) / 1000;

      if (s.t - lastReadout >= READOUT_MS) {
        lastReadout = s.t;
        setText(readouts.points, s.landmarks ? String(s.landmarks.length) : "None yet");
        // The eye line against the camera's horizontal, and the lip gap over the eye distance.
        setText(readouts.eyeLine, s.hasFace ? formatDegrees(s.roll) : "None yet");
        setText(readouts.mouth, s.hasFace ? formatRatio(s.mouth) : "None yet");
      }

      const inGuide = s.hasFace && (s.guidance === "ok" || s.guidance === "dark");
      const completed = calibrator.feed(inGuide ? { roll: s.roll, yaw: s.yaw, mouth: s.mouth } : null, dt);
      if (completed === "neutral") {
        // Keep this visitor's 478 points at their neutral pose for the reveal (memory only).
        if (s.landmarks) points = s.landmarks.map((p) => ({ x: p.x, y: p.y }));
        finish();
        return;
      }

      let hint: FaceCheckView["hint"];
      if (!s.hasFace) hint = { text: GUIDANCE["no-face"], ok: false };
      else if (!inGuide) hint = { text: GUIDANCE[s.guidance], ok: false };
      else if (calibrator.hint === "hold") hint = { text: s.guidance === "dark" ? GUIDANCE.dark : HINTS.hold, ok: true };
      else hint = calibrator.hint ? { text: HINTS[calibrator.hint], ok: false } : null;

      publish({
        done: false,
        progress: Math.round(calibrator.progress * 20) / 20,
        hint,
        faceOk: inGuide,
        canSkip: elapsed > SKIP_AFTER,
      });
    });

    return () => {
      off();
      window.clearTimeout(doneTimer);
      window.clearTimeout(skipTimer);
      skipRef.current = null;
    };
  }, [session, readouts.points, readouts.eyeLine, readouts.mouth]);

  const skip = useCallback(() => skipRef.current?.(), []);
  return { view, skip };
}
