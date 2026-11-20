import type { CameraIssue } from "@/components/game/camera-notice";
import type { MusicTheme, Sfx } from "../engine/audio/audio";
import type { LevelResult } from "../engine/game/bridge";
import { LEVELS } from "../engine/game/levels";
import type { ThemeId } from "../engine/game/themes";

/**
 * The Face Control flow as a pure reducer: (state, event, now) → state plus
 * the side effects to run. Re-implements the original experience.ts state
 * machine; its guards are the spec:
 *
 * - CONTINUE_GUARD_MS: an open mouth can't continue a screen right after it
 *   appears, so the jump that ended a level never skips the next one.
 * - FACE_BACK_MS: after the face is lost, play resumes only once the face has
 *   been back this long.
 * - resumeTarget: where to return after an interruption (camera started,
 *   recalibration, face lost), so nobody loses their level.
 * - rearm: after every overlay the mouth must close before it can act again.
 * - Next player resets everything.
 */

export type Phase =
  | "intro"
  | "permission"
  | "loading"
  | "error"
  | "calibrate"
  | "practice"
  | "level-intro"
  | "countdown"
  | "playing"
  | "paused"
  | "face-lost"
  | "level-complete"
  | "game-over"
  | "victory";

export type Mode = "face" | "keyboard";
export type ResumeTarget = "practice" | "level";
/** Shared camera issues, plus two that only happen once tracking is running. */
export type Issue = CameraIssue | "ended" | "tracking";
export type PracticeTask = "left" | "right" | "jump";

/** Face must be visible this long before play resumes after it was lost. */
export const FACE_BACK_MS = 600;
/** Overlays ignore mouth-"continue" for a moment so the jump that ended a level can't skip a screen. */
export const CONTINUE_GUARD_MS = 900;
/** Results screens: Space and Enter wait this long before they act (the mouth never acts there). */
export const RESULT_GUARD_MS = 2500;
/** Booth: no face for this long during play turns "face lost" into a real pause. */
export const ABSENT_PAUSE_MS = 60_000;
/** Booth: no face for this long anywhere in the game resets it for the next visitor. */
export const ABSENT_RESET_MS = 90_000;
/** Countdowns: from 3 when a level starts, from 2 when play resumes. */
export const COUNT_BEGIN = 3;
export const COUNT_RESUME = 2;
/**
 * A loaded level shows its title card this long, then starts by itself: one
 * less thing to press between practice (or the last level) and play. An open
 * mouth, Space or the button still starts it sooner.
 */
export const LEVEL_CARD_MS = 1300;

export const LEVEL_COUNT = LEVELS.length;

export interface LevelOutcome {
  result: LevelResult;
  /** Best time for this level before this finish; null on the first finish. */
  previousBest: number | null;
  newBestTime: boolean;
}

export interface RunSummary {
  outcome: "game-over" | "victory";
  /** How far through the last level played the ball got, 0 to 1 (1 for a win). */
  furthest: number;
  score: number;
  /** Best score before this run (0 when there is none) and whether this run beat it. */
  previousBest: number;
  isBest: boolean;
  levelIndex: number;
  runTime: number;
  deaths: number;
  lives: number;
  sparks: number;
  sparksTotal: number;
}

export interface MachineState {
  phase: Phase;
  mode: Mode | null;
  /** Camera stream on and the face controller running. */
  camera: boolean;
  /** This player has a calibration. */
  calibrated: boolean;
  practiceDone: boolean;
  practice: Record<PracticeTask, boolean>;
  /** All practice tasks done; the game moves on by itself shortly. */
  practiceComplete: boolean;
  levelIndex: number;
  /** The current level (or practice) is built and on screen. */
  levelReady: boolean;
  /** The ball crossed the finish line; results follow. Face loss is ignored meanwhile. */
  levelFinishing: boolean;
  resumeTarget: ResumeTarget | null;
  /** performance.now() after which an open mouth may continue the current screen. */
  continueAt: number;
  faceVisible: boolean;
  /** When the face came back during "face-lost" (0 = not back). */
  faceBackSince: number;
  /** When the face was last lost (0 = visible). */
  absentSince: number;
  countdown: { from: number; then: "begin" | "resume" } | null;
  issue: Issue | null;
  outcome: LevelOutcome | null;
  summary: RunSummary | null;
}

export type MachineEvent =
  | { type: "choose-camera" }
  | { type: "choose-keyboard" }
  | { type: "cancel-permission" }
  | { type: "camera-granted" }
  | { type: "camera-ready" }
  | { type: "camera-failed"; issue: Issue }
  | { type: "camera-lost"; issue: Issue }
  | { type: "calibrated" }
  | { type: "recalibrate" }
  | { type: "practice-loaded" }
  | { type: "practice-task"; task: PracticeTask }
  | { type: "practice-finished" }
  | { type: "skip-practice" }
  | { type: "level-loaded"; index: number }
  | { type: "start-level" }
  | { type: "countdown-done" }
  | { type: "mouth" }
  | { type: "frame"; hasFace: boolean; lost: boolean }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "hidden" }
  | { type: "restart-level" }
  | { type: "level-finished" }
  | { type: "level-complete"; result: LevelResult }
  | { type: "level-recorded"; previousBest: number | null; newBestTime: boolean }
  | { type: "next" }
  | { type: "game-over" }
  | { type: "summary"; summary: RunSummary }
  | { type: "retry-level" }
  | { type: "start-over" }
  | { type: "play-again" }
  | { type: "next-player" }
  | { type: "reset" };

export type Effect =
  | { type: "camera-start" }
  | { type: "camera-stop" }
  | { type: "load-practice" }
  | { type: "load-level"; index: number }
  | { type: "host"; op: "pause" | "resume" | "begin" | "unload" }
  | { type: "theme"; theme: ThemeId }
  | { type: "music"; theme: MusicTheme | null }
  | { type: "sfx"; name: Sfx }
  | { type: "run"; op: "new" | "level-start" | "restart-level" | "retry-level"; index?: number }
  | { type: "rearm" }
  | { type: "clear-input" }
  | { type: "countdown"; from: number }
  | { type: "cancel-countdown" }
  | { type: "auto-start"; ms: number }
  | { type: "practice-finish-soon" }
  | { type: "record-level"; result: LevelResult }
  | { type: "finish-run"; outcome: RunSummary["outcome"] }
  | { type: "reset-visitor" }
  | { type: "toast"; text: string };

export interface Step {
  state: MachineState;
  effects: Effect[];
}

export const NO_PRACTICE: Record<PracticeTask, boolean> = { left: false, right: false, jump: false };

export function initialState(): MachineState {
  return {
    phase: "intro",
    mode: null,
    camera: false,
    calibrated: false,
    practiceDone: false,
    practice: { ...NO_PRACTICE },
    practiceComplete: false,
    levelIndex: 0,
    levelReady: false,
    levelFinishing: false,
    resumeTarget: null,
    continueAt: 0,
    faceVisible: false,
    faceBackSince: 0,
    absentSince: 0,
    countdown: null,
    issue: null,
    outcome: null,
    summary: null,
  };
}

/** Phases that show the game world (Phaser), HUD and camera dock. */
export const WORLD_PHASES: readonly Phase[] = [
  "practice",
  "level-intro",
  "countdown",
  "playing",
  "paused",
  "face-lost",
  "level-complete",
];

/** Phases with a level on screen (HUD visible). */
export const LEVEL_PHASES: readonly Phase[] = ["level-intro", "countdown", "playing", "paused", "face-lost", "level-complete"];

/** Phases where a face player is expected in front of the camera (face absence resets these). */
const FACE_PHASES: readonly Phase[] = ["calibrate", ...WORLD_PHASES, "game-over", "victory"];

export const inWorld = (phase: Phase) => WORLD_PHASES.includes(phase);

/** Where to come back to if the game is interrupted in this phase. */
export function resumeTargetFor(phase: Phase): ResumeTarget | null {
  if (phase === "practice") return "practice";
  if (phase === "level-intro" || phase === "countdown" || phase === "playing" || phase === "paused" || phase === "face-lost") {
    return "level";
  }
  return null;
}

const step = (state: MachineState, effects: Effect[] = []): Step => ({ state, effects });

/** The camera is on, or a request for it is still pending. */
const cameraBusy = (state: MachineState) => state.camera || state.phase === "permission" || state.phase === "loading";

function toIntro(state: MachineState): Step {
  return step({ ...state, phase: "intro", countdown: null, issue: null, resumeTarget: null, camera: false, mode: null }, [
    { type: "cancel-countdown" },
    { type: "camera-stop" },
    { type: "host", op: "unload" },
    { type: "theme", theme: "dawn" },
    { type: "music", theme: null },
  ]);
}

/** Next player and booth resets: forget the visitor completely. */
function resetAll(state: MachineState): Step {
  return step(initialState(), [
    { type: "cancel-countdown" },
    ...(cameraBusy(state) ? [{ type: "camera-stop" } as const] : []),
    { type: "host", op: "unload" },
    { type: "theme", theme: "dawn" },
    { type: "music", theme: null },
    { type: "reset-visitor" },
  ]);
}

function toCalibrate(state: MachineState, target: ResumeTarget | null): Step {
  return step({ ...state, phase: "calibrate", countdown: null, resumeTarget: target, faceBackSince: 0 }, [
    { type: "cancel-countdown" },
    { type: "host", op: "pause" },
    { type: "music", theme: "menu" },
  ]);
}

function toPractice(state: MachineState): Step {
  return step(
    {
      ...state,
      phase: "practice",
      countdown: null,
      practice: { ...NO_PRACTICE },
      practiceComplete: false,
      levelReady: false,
      levelFinishing: false,
    },
    [{ type: "cancel-countdown" }, { type: "load-practice" }, { type: "music", theme: "menu" }],
  );
}

function toLevelIntro(state: MachineState, index: number): Step {
  return step(
    {
      ...state,
      phase: "level-intro",
      levelIndex: index,
      levelReady: false,
      levelFinishing: false,
      countdown: null,
      outcome: null,
      summary: null,
    },
    [{ type: "cancel-countdown" }, { type: "run", op: "level-start", index }, { type: "load-level", index }],
  );
}

function toCountdown(state: MachineState, from: number, then: "begin" | "resume", extra: Effect[] = []): Step {
  return step({ ...state, phase: "countdown", countdown: { from, then } }, [{ type: "countdown", from }, ...extra]);
}

/** The original resumeAfterInterruption(): back to wherever the player was. */
function resumeAfterInterruption(state: MachineState): Step {
  const target = state.resumeTarget ?? (state.phase === "face-lost" ? "level" : null);
  const base = { ...state, resumeTarget: null, faceBackSince: 0 };
  if (target === "practice") {
    return step({ ...base, phase: "practice", countdown: null }, [{ type: "host", op: "resume" }, { type: "music", theme: "menu" }]);
  }
  if (target === "level") return toCountdown(base, COUNT_RESUME, "resume");
  return toPractice(base);
}

function finishPractice(state: MachineState): Step {
  const next = toLevelIntro({ ...state, practiceDone: true, practiceComplete: false }, 0);
  return step(next.state, [{ type: "run", op: "new" }, ...next.effects]);
}

function toPaused(state: MachineState, withSound: boolean): Step {
  return step({ ...state, phase: "paused", countdown: null, faceBackSince: 0 }, [
    { type: "cancel-countdown" },
    { type: "host", op: "pause" },
    ...(withSound ? [{ type: "sfx", name: "pause" } as const] : []),
  ]);
}

function toFaceLost(state: MachineState): Step {
  return step({ ...state, phase: "face-lost", countdown: null, faceBackSince: 0 }, [
    { type: "cancel-countdown" },
    { type: "host", op: "pause" },
  ]);
}

function toVictory(state: MachineState, now: number): Step {
  return step({ ...state, phase: "victory", countdown: null, continueAt: now + RESULT_GUARD_MS, summary: null }, [
    { type: "cancel-countdown" },
    { type: "host", op: "unload" },
    { type: "music", theme: null },
    { type: "sfx", name: "victory" },
    { type: "rearm" },
    { type: "finish-run", outcome: "victory" },
  ]);
}

function toKeyboard(state: MachineState): Step {
  const target = state.phase === "face-lost" ? "level" : state.resumeTarget;
  const base: MachineState = {
    ...state,
    mode: "keyboard",
    camera: false,
    faceVisible: false,
    absentSince: 0,
    issue: null,
    resumeTarget: target,
  };
  const stop: Effect[] = cameraBusy(state) ? [{ type: "camera-stop" }] : [];
  let next: Step;
  if (target) next = resumeAfterInterruption(base);
  else if (state.practiceDone) next = toLevelIntro(base, state.levelIndex);
  else next = toPractice(base);
  return step(next.state, [...stop, ...next.effects]);
}

function startCamera(state: MachineState): Step {
  if (cameraBusy(state)) return step(state);
  const fromWorld = resumeTargetFor(state.phase);
  const target = fromWorld ?? (state.phase === "error" ? state.resumeTarget : null);
  return step({ ...state, phase: "permission", countdown: null, issue: null, resumeTarget: target }, [
    { type: "cancel-countdown" },
    ...(fromWorld ? [{ type: "host", op: "pause" } as const] : []),
    { type: "camera-start" },
  ]);
}

/** The screen's main action, for Space and Enter when no button has focus. */
export function primaryEvent(state: MachineState): MachineEvent | null {
  switch (state.phase) {
    case "intro":
    case "error":
      return { type: "choose-camera" };
    case "level-intro":
      return state.levelReady ? { type: "start-level" } : null;
    case "level-complete":
      return { type: "next" };
    case "paused":
      return { type: "resume" };
    case "game-over":
      return state.summary ? { type: "retry-level" } : null;
    case "victory":
      return state.summary ? { type: "play-again" } : null;
    default:
      return null;
  }
}

/** Absence bookkeeping and the booth timeouts, from one tracking frame. */
function onFrame(state: MachineState, hasFace: boolean, lost: boolean, now: number): Step {
  if (!state.camera) return step(state);
  let s = state;
  if (hasFace) {
    if (!s.faceVisible || s.absentSince) s = { ...s, faceVisible: true, absentSince: 0 };
  } else if (s.faceVisible || !s.absentSince) {
    s = { ...s, faceVisible: false, absentSince: s.absentSince || now };
  }

  if (!hasFace && s.absentSince) {
    const gone = now - s.absentSince;
    if (gone >= ABSENT_RESET_MS && FACE_PHASES.includes(s.phase)) return resetAll(s);
    if (gone >= ABSENT_PAUSE_MS && (s.phase === "playing" || s.phase === "countdown" || s.phase === "face-lost")) {
      return toPaused(s, false);
    }
  }

  if (s.phase === "playing" && lost && !s.levelFinishing) return toFaceLost(s);

  if (s.phase === "face-lost") {
    if (hasFace) {
      const since = s.faceBackSince || now;
      if (now - since > FACE_BACK_MS) return resumeAfterInterruption(s);
      if (since !== s.faceBackSince) s = { ...s, faceBackSince: since };
    } else if (s.faceBackSince) {
      s = { ...s, faceBackSince: 0 };
    }
  }
  return step(s);
}

export function transition(state: MachineState, event: MachineEvent, now: number): Step {
  const { phase } = state;
  switch (event.type) {
    case "choose-camera":
      return startCamera(state);

    case "choose-keyboard":
      if (["intro", "error", "permission", "loading", "calibrate", "face-lost"].includes(phase)) {
        return toKeyboard(state);
      }
      return step(state);

    case "cancel-permission":
      if (phase !== "permission") return step(state);
      return state.resumeTarget ? toKeyboard(state) : toIntro(state);

    case "camera-granted":
      return phase === "permission" ? step({ ...state, phase: "loading" }) : step(state);

    case "camera-ready": {
      // Nobody is waiting for the camera any more (cancelled, or reset): turn it off again.
      if (phase !== "permission" && phase !== "loading") return step(state, [{ type: "camera-stop" }]);
      const base: MachineState = { ...state, camera: true, mode: "face", faceVisible: false, absentSince: 0, issue: null };
      if (state.resumeTarget && state.calibrated) {
        const next = resumeAfterInterruption(base);
        return step(next.state, [{ type: "toast", text: "Face controls on" }, ...next.effects]);
      }
      return toCalibrate(base, state.resumeTarget);
    }

    case "camera-failed":
      if (phase !== "permission" && phase !== "loading") return step(state);
      return step({ ...state, phase: "error", issue: event.issue, camera: false }, [{ type: "camera-stop" }]);

    case "camera-lost": {
      if (!state.camera) return step(state);
      const target = resumeTargetFor(phase) ?? state.resumeTarget;
      return step(
        {
          ...state,
          phase: "error",
          issue: event.issue,
          camera: false,
          mode: "keyboard",
          faceVisible: false,
          absentSince: 0,
          countdown: null,
          resumeTarget: target,
        },
        [{ type: "cancel-countdown" }, { type: "camera-stop" }, ...(inWorld(phase) ? [{ type: "host", op: "pause" } as const] : [])],
      );
    }

    case "calibrated": {
      if (phase !== "calibrate") return step(state);
      const base = { ...state, calibrated: true };
      const next = state.resumeTarget ? resumeAfterInterruption(base) : toPractice(base);
      return step(next.state, [{ type: "rearm" }, ...next.effects]);
    }

    case "recalibrate": {
      if (!state.camera) return startCamera(state);
      if (!["playing", "paused", "practice", "face-lost", "countdown", "level-intro"].includes(phase)) return step(state);
      return toCalibrate(state, resumeTargetFor(phase));
    }

    case "practice-loaded":
      if (phase !== "practice") return step(state);
      return step({ ...state, levelReady: true }, [{ type: "host", op: "begin" }]);

    case "practice-task": {
      if (phase !== "practice" || state.practice[event.task]) return step(state);
      const practice = { ...state.practice, [event.task]: true };
      const complete = practice.left && practice.right && practice.jump;
      const effects: Effect[] = [{ type: "sfx", name: "step" }];
      if (complete && !state.practiceComplete) effects.push({ type: "practice-finish-soon" });
      return step({ ...state, practice, practiceComplete: state.practiceComplete || complete }, effects);
    }

    case "practice-finished":
      return phase === "practice" && state.practiceComplete ? finishPractice(state) : step(state);

    case "skip-practice":
      return phase === "practice" ? finishPractice(state) : step(state);

    case "level-loaded":
      if (phase !== "level-intro" || event.index !== state.levelIndex) return step(state);
      return step({ ...state, levelReady: true, continueAt: now + CONTINUE_GUARD_MS }, [
        { type: "clear-input" },
        { type: "rearm" },
        { type: "auto-start", ms: LEVEL_CARD_MS },
      ]);

    case "start-level":
      if (phase !== "level-intro" || !state.levelReady) return step(state);
      return toCountdown(state, COUNT_BEGIN, "begin", [{ type: "music", theme: LEVELS[state.levelIndex].music }]);

    case "countdown-done": {
      if (phase !== "countdown" || !state.countdown) return step(state);
      const effects: Effect[] =
        state.countdown.then === "begin"
          ? [{ type: "host", op: "begin" }]
          : [
              { type: "host", op: "resume" },
              { type: "host", op: "begin" },
              { type: "music", theme: LEVELS[state.levelIndex].music },
            ];
      return step({ ...state, phase: "playing", countdown: null }, effects);
    }

    case "mouth": {
      if (phase === "practice") return transition(state, { type: "practice-task", task: "jump" }, now);
      if (now < state.continueAt) return step(state);
      if (phase === "level-intro" && state.levelReady) return transition(state, { type: "start-level" }, now);
      if (phase === "level-complete") return transition(state, { type: "next" }, now);
      // Results (game over, victory) never restart on the mouth: an open mouth
      // there kept restarting while a parent scanned the feedback QR. Space or
      // the button only.
      return step(state);
    }

    case "frame":
      return onFrame(state, event.hasFace, event.lost, now);

    case "pause":
      return phase === "playing" || phase === "countdown" ? toPaused(state, true) : step(state);

    case "hidden":
      return phase === "playing" || phase === "countdown" ? toPaused(state, true) : step(state);

    case "resume":
      if (phase !== "paused") return step(state);
      if (state.mode === "face" && state.camera && !state.faceVisible) return toFaceLost(state);
      return toCountdown(state, COUNT_RESUME, "resume");

    case "restart-level": {
      if (phase !== "playing" && phase !== "paused" && phase !== "face-lost") return step(state);
      const next = toLevelIntro(state, state.levelIndex);
      return step(next.state, [{ type: "run", op: "restart-level" }, ...next.effects]);
    }

    case "level-finished":
      return phase === "playing" ? step({ ...state, levelFinishing: true }) : step(state);

    case "level-complete":
      if (phase !== "playing") return step(state);
      return step(
        {
          ...state,
          phase: "level-complete",
          continueAt: now + CONTINUE_GUARD_MS,
          outcome: { result: event.result, previousBest: null, newBestTime: false },
        },
        [{ type: "music", theme: null }, { type: "rearm" }, { type: "record-level", result: event.result }],
      );

    case "level-recorded":
      if (phase !== "level-complete" || !state.outcome) return step(state);
      return step({ ...state, outcome: { ...state.outcome, previousBest: event.previousBest, newBestTime: event.newBestTime } });

    case "next":
      if (phase !== "level-complete") return step(state);
      return state.levelIndex >= LEVEL_COUNT - 1 ? toVictory(state, now) : toLevelIntro(state, state.levelIndex + 1);

    case "game-over":
      if (!["playing", "countdown", "paused", "face-lost"].includes(phase)) return step(state);
      return step({ ...state, phase: "game-over", countdown: null, continueAt: now + RESULT_GUARD_MS, summary: null }, [
        { type: "cancel-countdown" },
        { type: "host", op: "unload" },
        { type: "music", theme: null },
        { type: "sfx", name: "gameOver" },
        { type: "rearm" },
        { type: "finish-run", outcome: "game-over" },
      ]);

    case "summary":
      if (phase !== "game-over" && phase !== "victory") return step(state);
      return step({ ...state, summary: event.summary });

    case "retry-level": {
      if (phase !== "game-over") return step(state);
      const next = toLevelIntro(state, state.levelIndex);
      return step(next.state, [{ type: "run", op: "retry-level" }, ...next.effects]);
    }

    case "start-over":
    case "play-again": {
      if (event.type === "start-over" ? phase !== "game-over" : phase !== "victory") return step(state);
      const next = toLevelIntro(state, 0);
      return step(next.state, [{ type: "run", op: "new" }, ...next.effects]);
    }

    case "next-player":
    case "reset":
      return resetAll(state);
  }
}
