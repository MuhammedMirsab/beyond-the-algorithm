import { describe, expect, test } from "bun:test";
import type { LevelResult } from "../engine/game/bridge";
import {
  ABSENT_PAUSE_MS,
  ABSENT_RESET_MS,
  CONTINUE_GUARD_MS,
  FACE_BACK_MS,
  initialState,
  LEVEL_CARD_MS,
  LEVEL_COUNT,
  primaryEvent,
  RESULT_GUARD_MS,
  transition,
  type Effect,
  type MachineEvent,
  type MachineState,
  type RunSummary,
  type Step,
} from "./machine";

/** Applies events in order at the given time; returns the last step. */
function play(state: MachineState, events: MachineEvent[], now = 0): Step {
  let step: Step = { state, effects: [] };
  for (const event of events) step = transition(step.state, event, now);
  return step;
}

const has = (effects: Effect[], type: Effect["type"]) => effects.some((e) => e.type === type);
const hostOps = (effects: Effect[]) => effects.flatMap((e) => (e.type === "host" ? [e.op] : []));

/** A face player, calibrated, practice done, at level `index` in the given phase. */
function facePlaying(index = 0): MachineState {
  let s = play(initialState(), [{ type: "choose-camera" }, { type: "camera-ready" }, { type: "calibrated" }, { type: "skip-practice" }]).state;
  s = { ...s, levelIndex: index };
  s = play(s, [{ type: "level-loaded", index }], 0).state;
  s = play(s, [{ type: "start-level" }], CONTINUE_GUARD_MS).state;
  return play(s, [{ type: "countdown-done" }, { type: "frame", hasFace: true, lost: false }], CONTINUE_GUARD_MS).state;
}

function keyboardPlaying(): MachineState {
  const s = play(initialState(), [{ type: "choose-keyboard" }, { type: "skip-practice" }, { type: "level-loaded", index: 0 }]).state;
  return play(s, [{ type: "start-level" }, { type: "countdown-done" }]).state;
}

const RESULT: LevelResult = {
  levelIndex: 0,
  time: 42.3,
  sparks: 10,
  sparksTotal: 12,
  deaths: 1,
  sparkScore: 1000,
  completionBonus: 1000,
  timeBonus: 254,
  perfectBonus: 0,
  total: 2254,
};

const SUMMARY: RunSummary = {
  outcome: "game-over",
  furthest: 0.4,
  score: 900,
  previousBest: 0,
  isBest: true,
  levelIndex: 0,
  runTime: 50,
  deaths: 5,
  lives: 0,
  sparks: 9,
  sparksTotal: 12,
};

describe("starting", () => {
  test("starts on the intro with nothing remembered", () => {
    const s = initialState();
    expect(s.phase).toBe("intro");
    expect(s.mode).toBeNull();
    expect(s.calibrated).toBe(false);
  });

  test("Turn on camera asks for the camera", () => {
    const { state, effects } = transition(initialState(), { type: "choose-camera" }, 0);
    expect(state.phase).toBe("permission");
    expect(state.resumeTarget).toBeNull();
    expect(has(effects, "camera-start")).toBe(true);
  });

  test("the model still loading shows the loading screen, then calibration", () => {
    const s = play(initialState(), [{ type: "choose-camera" }, { type: "camera-granted" }]).state;
    expect(s.phase).toBe("loading");
    const ready = transition(s, { type: "camera-ready" }, 0);
    expect(ready.state.phase).toBe("calibrate");
    expect(ready.state.mode).toBe("face");
    expect(ready.state.camera).toBe(true);
  });

  test("a camera that arrives after Cancel is switched off again", () => {
    const s = play(initialState(), [{ type: "choose-camera" }, { type: "cancel-permission" }]).state;
    expect(s.phase).toBe("intro");
    const late = transition(s, { type: "camera-ready" }, 0);
    expect(late.state).toBe(s);
    expect(has(late.effects, "camera-stop")).toBe(true);
  });

  test("a camera problem shows the error, with retry and keyboard", () => {
    const s = play(initialState(), [{ type: "choose-camera" }, { type: "camera-failed", issue: "denied" }]).state;
    expect(s.phase).toBe("error");
    expect(s.issue).toBe("denied");
    expect(primaryEvent(s)).toEqual({ type: "choose-camera" });
    const kb = transition(s, { type: "choose-keyboard" }, 0);
    expect(kb.state.phase).toBe("practice");
    expect(kb.state.mode).toBe("keyboard");
  });

  test("calibration leads to practice, and the mouth must close first", () => {
    const s = play(initialState(), [{ type: "choose-camera" }, { type: "camera-ready" }]).state;
    const { state, effects } = transition(s, { type: "calibrated" }, 0);
    expect(state.phase).toBe("practice");
    expect(state.calibrated).toBe(true);
    expect(has(effects, "load-practice")).toBe(true);
    expect(has(effects, "rearm")).toBe(true);
  });
});

describe("practice", () => {
  const practice = () => play(initialState(), [{ type: "choose-keyboard" }]).state;

  test("ticks off each move once and moves on by itself when all three are done", () => {
    let step = transition(practice(), { type: "practice-task", task: "left" }, 0);
    expect(step.state.practice.left).toBe(true);
    step = transition(step.state, { type: "practice-task", task: "left" }, 0);
    expect(step.effects).toEqual([]);
    step = play(step.state, [{ type: "practice-task", task: "right" }]);
    step = transition(step.state, { type: "practice-task", task: "jump" }, 0);
    expect(step.state.practiceComplete).toBe(true);
    expect(has(step.effects, "practice-finish-soon")).toBe(true);
    const next = transition(step.state, { type: "practice-finished" }, 0);
    expect(next.state.phase).toBe("level-intro");
    expect(next.state.practiceDone).toBe(true);
    expect(next.effects.map((e) => e.type)).toEqual(["run", "cancel-countdown", "run", "load-level"]);
  });

  test("a stray finish timer does nothing unless practice is complete", () => {
    const s = practice();
    expect(transition(s, { type: "practice-finished" }, 0).state).toBe(s);
  });

  test("an open mouth in practice counts as the jump", () => {
    const s = transition(practice(), { type: "mouth" }, 0).state;
    expect(s.practice.jump).toBe(true);
  });
});

describe("CONTINUE_GUARD_MS: the jump that ended a screen can't skip the next one", () => {
  test("level intro: the mouth only starts the level after the guard", () => {
    const s = play(initialState(), [{ type: "choose-keyboard" }, { type: "skip-practice" }, { type: "level-loaded", index: 0 }], 1000).state;
    expect(s.continueAt).toBe(1000 + CONTINUE_GUARD_MS);
    expect(transition(s, { type: "mouth" }, 1000 + CONTINUE_GUARD_MS - 1).state).toBe(s);
    const go = transition(s, { type: "mouth" }, 1000 + CONTINUE_GUARD_MS);
    expect(go.state.phase).toBe("countdown");
    expect(go.state.countdown).toEqual({ from: 3, then: "begin" });
  });

  test("a loaded level starts by itself after its title card, unless something starts it sooner", () => {
    const s = play(initialState(), [{ type: "choose-keyboard" }, { type: "skip-practice" }]).state;
    const loaded = transition(s, { type: "level-loaded", index: 0 }, 0);
    expect(loaded.effects).toContainEqual({ type: "auto-start", ms: LEVEL_CARD_MS });
    // The timer fires start-level; a stale one after the level began is ignored.
    const started = transition(loaded.state, { type: "start-level" }, LEVEL_CARD_MS);
    expect(started.state.phase).toBe("countdown");
    expect(transition(started.state, { type: "start-level" }, LEVEL_CARD_MS + 1).state).toBe(started.state);
  });

  test("a level that hasn't loaded can't start, and a stale load is ignored", () => {
    const s = play(initialState(), [{ type: "choose-keyboard" }, { type: "skip-practice" }]).state;
    expect(transition(s, { type: "start-level" }, 0).state).toBe(s);
    expect(transition(s, { type: "level-loaded", index: 2 }, 0).state).toBe(s);
  });

  test("level complete: the mouth continues only after the guard", () => {
    const s = transition(facePlaying(), { type: "level-complete", result: RESULT }, 5000).state;
    expect(s.phase).toBe("level-complete");
    expect(transition(s, { type: "mouth" }, 5000 + CONTINUE_GUARD_MS - 1).state).toBe(s);
    expect(transition(s, { type: "mouth" }, 5000 + CONTINUE_GUARD_MS).state.phase).toBe("level-intro");
  });

  test("results wait longer, and only once the summary is there", () => {
    const over = transition(facePlaying(), { type: "game-over" }, 0).state;
    expect(over.continueAt).toBe(RESULT_GUARD_MS);
    expect(transition(over, { type: "mouth" }, RESULT_GUARD_MS).state).toBe(over);
    const withSummary = transition(over, { type: "summary", summary: SUMMARY }, 0).state;
    expect(transition(withSummary, { type: "mouth" }, RESULT_GUARD_MS - 1).state).toBe(withSummary);
    const retry = transition(withSummary, { type: "mouth" }, RESULT_GUARD_MS);
    expect(retry.state.phase).toBe("level-intro");
    expect(retry.effects[0]).toEqual({ type: "run", op: "retry-level" });
  });
});

describe("FACE_BACK_MS: face lost and found", () => {
  test("losing the face pauses play", () => {
    const { state, effects } = transition(facePlaying(), { type: "frame", hasFace: false, lost: true }, 10_000);
    expect(state.phase).toBe("face-lost");
    expect(hostOps(effects)).toContain("pause");
  });

  test("not while the ball is already past the finish line", () => {
    const s = transition(facePlaying(), { type: "level-finished" }, 0).state;
    expect(transition(s, { type: "frame", hasFace: false, lost: true }, 0).state.phase).toBe("playing");
  });

  test("resumes only after the face has been back for 600 ms, and a flicker restarts the wait", () => {
    let s = transition(facePlaying(), { type: "frame", hasFace: false, lost: true }, 10_000).state;
    s = transition(s, { type: "frame", hasFace: true, lost: false }, 11_000).state;
    expect(s.faceBackSince).toBe(11_000);
    s = transition(s, { type: "frame", hasFace: true, lost: false }, 11_000 + FACE_BACK_MS).state;
    expect(s.phase).toBe("face-lost");
    s = transition(s, { type: "frame", hasFace: false, lost: false }, 11_700).state;
    expect(s.faceBackSince).toBe(0);
    s = transition(s, { type: "frame", hasFace: true, lost: false }, 12_000).state;
    const back = transition(s, { type: "frame", hasFace: true, lost: false }, 12_000 + FACE_BACK_MS + 1);
    expect(back.state.phase).toBe("countdown");
    expect(back.state.countdown).toEqual({ from: 2, then: "resume" });
  });

  test("Resume with no face goes to face lost instead of a countdown", () => {
    let s = transition(facePlaying(), { type: "pause" }, 0).state;
    s = transition(s, { type: "frame", hasFace: false, lost: false }, 100).state;
    expect(transition(s, { type: "resume" }, 200).state.phase).toBe("face-lost");
  });

  test("Continue with keyboard turns the camera off and picks the level back up", () => {
    const lost = transition(facePlaying(), { type: "frame", hasFace: false, lost: true }, 0).state;
    const { state, effects } = transition(lost, { type: "choose-keyboard" }, 0);
    expect(state.mode).toBe("keyboard");
    expect(state.camera).toBe(false);
    expect(state.phase).toBe("countdown");
    expect(has(effects, "camera-stop")).toBe(true);
  });
});

describe("resumeTarget: interruptions return to where you were", () => {
  test("recalibrating mid-level returns to the level, not to practice", () => {
    const s = transition(facePlaying(), { type: "pause" }, 0).state;
    const calib = transition(s, { type: "recalibrate" }, 0).state;
    expect(calib.phase).toBe("calibrate");
    expect(calib.resumeTarget).toBe("level");
    const back = transition(calib, { type: "calibrated" }, 0).state;
    expect(back.phase).toBe("countdown");
    expect(back.resumeTarget).toBeNull();
  });

  test("turning the camera on during keyboard practice calibrates, then resumes practice", () => {
    const practice = play(initialState(), [{ type: "choose-keyboard" }]).state;
    const asking = transition(practice, { type: "choose-camera" }, 0);
    expect(asking.state.resumeTarget).toBe("practice");
    expect(hostOps(asking.effects)).toContain("pause");
    const calib = transition(asking.state, { type: "camera-ready" }, 0).state;
    expect(calib.phase).toBe("calibrate");
    const back = transition(calib, { type: "calibrated" }, 0);
    expect(back.state.phase).toBe("practice");
    expect(hostOps(back.effects)).toContain("resume");
  });

  test("a calibrated player who turns the camera back on skips calibration", () => {
    const kb = transition(transition(facePlaying(), { type: "frame", hasFace: false, lost: true }, 0).state, { type: "choose-keyboard" }, 0).state;
    const playing = transition(kb, { type: "countdown-done" }, 0).state;
    const asking = transition(playing, { type: "choose-camera" }, 0).state;
    const { state, effects } = transition(asking, { type: "camera-ready" }, 0);
    expect(state.phase).toBe("countdown");
    expect(effects[0]).toEqual({ type: "toast", text: "Face controls on" });
  });

  test("a camera that stops mid-level offers the level back", () => {
    const err = transition(facePlaying(), { type: "camera-lost", issue: "ended" }, 0);
    expect(err.state.phase).toBe("error");
    expect(err.state.resumeTarget).toBe("level");
    expect(has(err.effects, "camera-stop")).toBe(true);
    expect(transition(err.state, { type: "choose-keyboard" }, 0).state.phase).toBe("countdown");
  });
});

describe("play", () => {
  test("pause works only while playing or counting down; hiding the tab pauses", () => {
    expect(transition(initialState(), { type: "pause" }, 0).state.phase).toBe("intro");
    const playing = keyboardPlaying();
    expect(transition(playing, { type: "hidden" }, 0).state.phase).toBe("paused");
    const paused = transition(playing, { type: "pause" }, 0);
    expect(paused.state.phase).toBe("paused");
    expect(has(paused.effects, "sfx")).toBe(true);
    expect(primaryEvent(paused.state)).toEqual({ type: "resume" });
    const resumed = transition(paused.state, { type: "resume" }, 0).state;
    expect(resumed.countdown).toEqual({ from: 2, then: "resume" });
  });

  test("a level only completes from play", () => {
    const paused = transition(keyboardPlaying(), { type: "pause" }, 0).state;
    expect(transition(paused, { type: "level-complete", result: RESULT }, 0).state).toBe(paused);
    const done = transition(keyboardPlaying(), { type: "level-complete", result: RESULT }, 0);
    expect(done.state.phase).toBe("level-complete");
    expect(done.effects).toContainEqual({ type: "record-level", result: RESULT });
  });

  test("the last level leads to victory, the others to the next level", () => {
    const one = transition(transition(keyboardPlaying(), { type: "level-complete", result: RESULT }, 0).state, { type: "next" }, 0);
    expect(one.state.phase).toBe("level-intro");
    expect(one.state.levelIndex).toBe(1);
    const last = { ...keyboardPlaying(), levelIndex: LEVEL_COUNT - 1 };
    const win = transition(transition(last, { type: "level-complete", result: { ...RESULT, levelIndex: LEVEL_COUNT - 1 } }, 0).state, { type: "next" }, 0);
    expect(win.state.phase).toBe("victory");
    expect(win.effects).toContainEqual({ type: "finish-run", outcome: "victory" });
  });

  test("restart level restores the level's score and lives before reloading it", () => {
    const paused = transition(keyboardPlaying(), { type: "pause" }, 0).state;
    const { state, effects } = transition(paused, { type: "restart-level" }, 0);
    expect(state.phase).toBe("level-intro");
    expect(effects.slice(0, 3)).toEqual([
      { type: "run", op: "restart-level" },
      { type: "cancel-countdown" },
      { type: "run", op: "level-start", index: 0 },
    ]);
  });
});

describe("booth", () => {
  test("Next player forgets everything and turns the camera off", () => {
    const paused = transition(facePlaying(2), { type: "pause" }, 0).state;
    const { state, effects } = transition(paused, { type: "next-player" }, 0);
    expect(state).toEqual(initialState());
    expect(has(effects, "camera-stop")).toBe(true);
    expect(has(effects, "reset-visitor")).toBe(true);
  });

  test("no face for 60 s turns face lost into a real pause, 90 s resets the game", () => {
    let s = transition(facePlaying(), { type: "frame", hasFace: false, lost: true }, 1000).state;
    expect(s.phase).toBe("face-lost");
    s = transition(s, { type: "frame", hasFace: false, lost: true }, 1000 + ABSENT_PAUSE_MS).state;
    expect(s.phase).toBe("paused");
    // A real pause does not resume on its own when someone sits down.
    const back = play(s, [{ type: "frame", hasFace: true, lost: false }], 1000 + ABSENT_PAUSE_MS + 5000);
    expect(back.state.phase).toBe("paused");
    const reset = transition(s, { type: "frame", hasFace: false, lost: true }, 1000 + ABSENT_RESET_MS);
    expect(reset.state.phase).toBe("intro");
    expect(has(reset.effects, "reset-visitor")).toBe(true);
  });

  test("an empty calibration screen resets too, but a face keeps it going", () => {
    let s = play(initialState(), [{ type: "choose-camera" }, { type: "camera-ready" }]).state;
    s = transition(s, { type: "frame", hasFace: false, lost: false }, 1000).state;
    expect(s.absentSince).toBe(1000);
    s = transition(s, { type: "frame", hasFace: true, lost: false }, 1000 + ABSENT_RESET_MS - 1).state;
    expect(s.phase).toBe("calibrate");
    expect(s.absentSince).toBe(0);
    s = transition(s, { type: "frame", hasFace: false, lost: false }, 200_000).state;
    expect(transition(s, { type: "frame", hasFace: false, lost: false }, 200_000 + ABSENT_RESET_MS - 1).state.phase).toBe("calibrate");
    expect(transition(s, { type: "frame", hasFace: false, lost: false }, 200_000 + ABSENT_RESET_MS).state.phase).toBe("intro");
  });

  test("frames without a change return the same state (no re-render)", () => {
    const s = facePlaying();
    expect(transition(s, { type: "frame", hasFace: true, lost: false }, 50).state).toBe(s);
  });
});

describe("primaryEvent (Space and Enter)", () => {
  test("maps each waiting screen to its main button", () => {
    expect(primaryEvent(initialState())).toEqual({ type: "choose-camera" });
    expect(primaryEvent(keyboardPlaying())).toBeNull();
    const intro = play(initialState(), [{ type: "choose-keyboard" }, { type: "skip-practice" }]).state;
    expect(primaryEvent(intro)).toBeNull();
    expect(primaryEvent({ ...intro, levelReady: true })).toEqual({ type: "start-level" });
    const over = transition(keyboardPlaying(), { type: "game-over" }, 0).state;
    expect(primaryEvent(over)).toBeNull();
    expect(primaryEvent({ ...over, summary: SUMMARY })).toEqual({ type: "retry-level" });
  });
});
