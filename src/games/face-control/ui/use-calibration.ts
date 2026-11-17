"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { audio } from "../engine/audio/audio";
import { formatDegrees, formatRatio } from "../engine/format";
import { Calibrator, type CalibHint, type CalibStep } from "../engine/vision/calibration";
import type { ControlSnapshot, Guidance } from "../engine/vision/face-controller";
import type { FaceControlSession } from "../play/session";

export type CalibPhase = "position" | CalibStep;

/** Seconds in one step before "Skip this step" appears. */
export const SKIP_AFTER = 10;
/** Seconds the face must sit well inside the guide before step 1 starts. */
const POSITION_HOLD = 1;
/** Pause on "All set" before the game moves on. */
const DONE_MS = 900;

/** Positioning help, in plain words. */
export const GUIDANCE: Record<Guidance, string> = {
  ok: "Good. Hold that position",
  "no-face": "Can't see your face. Look at the screen",
  "too-far": "Move a little closer",
  "too-close": "Move back a little",
  "move-left": "Move a little to your left",
  "move-right": "Move a little to your right",
  "move-up": "Raise your head a little",
  "move-down": "Lower your head a little",
  dark: "Find more light",
};

export const HINTS: Record<Exclude<CalibHint, null>, string> = {
  "no-face": "Can't see your face",
  "hold-still": "Hold still",
  "close-mouth": "Close your mouth for this step",
  "other-way": "Other way: tilt toward your other shoulder",
  "a-bit-more": "A little more",
  hold: "Good, hold it",
};

export interface CalibrationView {
  phase: CalibPhase;
  /** Progress through the current step, 0..1, in 5% steps (keeps re-renders low). */
  progress: number;
  hint: { text: string; ok: boolean } | null;
  canSkip: boolean;
  /** The face is inside the guide (positioning) or tracked (steps). */
  faceOk: boolean;
}

const INITIAL: CalibrationView = { phase: "position", progress: 0, hint: null, canSkip: false, faceOk: false };

const same = (a: CalibrationView, b: CalibrationView) =>
  a.phase === b.phase &&
  a.progress === b.progress &&
  a.canSkip === b.canSkip &&
  a.faceOk === b.faceOk &&
  a.hint?.text === b.hint?.text &&
  a.hint?.ok === b.hint?.ok;

/** A live number for the readout, in the machine voice: what the camera measures right now. */
function readout(phase: CalibPhase, s: ControlSnapshot, calibrator: Calibrator) {
  if (!s.hasFace) return "No face";
  if (phase === "left" || phase === "right") {
    const tilt = calibrator.liveTilt;
    const side = tilt > 0.5 ? "right" : tilt < -0.5 ? "left" : "";
    return `Tilt ${formatDegrees(tilt)} ${side}`.trim();
  }
  if (phase === "mouth") return `Mouth ${formatRatio(s.mouth)}`;
  return `Eye line ${formatDegrees(s.roll)} · Mouth ${formatRatio(s.mouth)}`;
}

/**
 * Runs one calibration (the original CalibrationView): positioning, then four
 * steps that advance by themselves as the visitor does each movement.
 * Hands the result to the session when done.
 */
export function useCalibration(session: FaceControlSession, readoutRef: RefObject<HTMLElement | null>) {
  const [view, setView] = useState<CalibrationView>(INITIAL);
  const skipRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const calibrator = new Calibrator();
    let phase: CalibPhase = "position";
    let positionHold = 0;
    let lastT = performance.now();
    let finished = false;
    let points: { x: number; y: number }[] | null = null;
    let doneTimer = 0;
    let last = INITIAL;
    let lastReadout = "";

    const publish = (next: CalibrationView) => {
      if (same(next, last)) return;
      last = next;
      setView(next);
    };

    const advanceTo = (next: CalibStep) => {
      phase = next;
      if (next === "done") {
        finished = true;
        audio.play("calibrated");
        publish({ phase: "done", progress: 1, hint: { text: "Calibration complete", ok: true }, canSkip: false, faceOk: true });
        const profile = calibrator.result();
        const measured = { ...calibrator.measured };
        doneTimer = window.setTimeout(() => session.finishCalibration({ profile, measured, points }), DONE_MS);
        return;
      }
      audio.play("step");
      publish({ phase: next, progress: 0, hint: null, canSkip: false, faceOk: last.faceOk });
    };

    skipRef.current = () => {
      if (finished || phase === "position") return;
      const skipped = calibrator.skip();
      if (skipped) advanceTo(calibrator.step);
    };

    const off = session.onFrame((s) => {
      if (finished) return;
      const dt = Math.min(0.1, Math.max(0, (s.t - lastT) / 1000));
      lastT = s.t;

      const text = readout(phase, s, calibrator);
      if (text !== lastReadout && readoutRef.current) {
        readoutRef.current.textContent = text;
        lastReadout = text;
      }

      if (phase === "position") {
        const ok = s.hasFace && (s.guidance === "ok" || s.guidance === "dark");
        positionHold = ok ? positionHold + dt : Math.max(0, positionHold - dt * 2);
        if (positionHold >= POSITION_HOLD) {
          advanceTo("neutral");
          return;
        }
        publish({
          phase,
          progress: Math.round((positionHold / POSITION_HOLD) * 20) / 20,
          hint: { text: GUIDANCE[s.hasFace ? s.guidance : "no-face"], ok },
          canSkip: false,
          faceOk: ok,
        });
        return;
      }

      const sample = s.hasFace ? { roll: s.roll, yaw: s.yaw, mouth: s.mouth } : null;
      const completed = calibrator.feed(sample, dt);
      // Keep this visitor's 478 points at their neutral pose for the reveal (memory only).
      if (completed === "neutral" && s.landmarks) points = s.landmarks.map((p) => ({ x: p.x, y: p.y }));

      const hint = calibrator.hint;
      let shown: CalibrationView["hint"];
      if (s.hasFace && s.guidance !== "ok" && hint !== "hold") shown = { text: GUIDANCE[s.guidance], ok: false };
      else shown = hint ? { text: HINTS[hint], ok: hint === "hold" } : null;

      if (completed) {
        advanceTo(calibrator.step);
        return;
      }
      publish({
        phase,
        progress: Math.round(calibrator.progress * 20) / 20,
        hint: shown,
        canSkip: calibrator.stepTime > SKIP_AFTER,
        faceOk: s.hasFace,
      });
    });

    return () => {
      off();
      window.clearTimeout(doneTimer);
      skipRef.current = null;
    };
  }, [session, readoutRef]);

  const skip = useCallback(() => skipRef.current?.(), []);
  return { view, skip };
}
