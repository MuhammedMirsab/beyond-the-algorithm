/**
 * The match flow the arena runs, with fake timers: the lock beat before the
 * chant, rock-paper-scissors-shoot, the camera's grace period, the 3 s miss and
 * its replay, keys pressed early, the end of a match, the guesses it keeps, and
 * what Rematch and Next player keep.
 */
import { afterEach, beforeEach, describe, expect, it, jest } from "bun:test";
import { getCounterMove } from "../engine/aiPredictor";
import type { CVFrameResult, DetectedGesture, Gesture, PredictionBreakdown } from "../engine/types";
import {
  isRoundLive,
  LEAD_IN_MS,
  MatchController,
  SHOOT_GRACE_MS,
  SHOOT_TIMEOUT_MS,
  STEP_MS,
  TO_SHOOT_MS,
} from "../match-controller";

function frame(gesture: DetectedGesture, confidence = 0.9): CVFrameResult {
  return {
    timestamp: Date.now(),
    handCount: gesture === "none" ? 0 : 1,
    landmarks: null,
    allHandsLandmarks: [],
    handedness: "Right",
    gesture,
    confidence,
    mediapipeGesture: gesture,
    mediapipeConfidence: confidence,
    geometricGesture: gesture,
    geometricConfidence: confidence,
    secondaryGesture: gesture,
    secondaryConfidence: confidence,
    qualityIssues: gesture === "none" ? ["no_hand"] : [],
    inferenceLatencyMs: 5,
    fps: 18,
    backend: "cpu",
    brightnessScore: 120,
    motionScore: 0,
  };
}

/** Feeds camera frames 55 ms apart, like the tracker's loop. */
function feed(controller: MatchController, gesture: DetectedGesture, count: number) {
  for (let i = 0; i < count; i++) {
    controller.onFrame(frame(gesture));
    jest.advanceTimersByTime(55);
  }
}

function toShoot() {
  jest.advanceTimersByTime(TO_SHOOT_MS);
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("A round in the arena", () => {
  it("seals the AI's move on a beat of its own, then chants rock, paper, scissors, shoot", () => {
    const controller = new MatchController("normal");
    expect(controller.getSnapshot().beat).toBeNull();
    expect(controller.startRound()).toBe(true);
    let view = controller.getSnapshot();
    expect(view.match.phase).toBe("locked");
    expect(view.beat).toBe("lock");
    expect(view.match.countdownValue).toBe(3);
    const sealed = view.match.sealedCommitment;
    expect(sealed).not.toBeNull();

    jest.advanceTimersByTime(LEAD_IN_MS);
    view = controller.getSnapshot();
    expect(view.beat).toBe("rock");
    expect(view.match.phase).toBe("countdown");
    expect(view.match.countdownValue).toBe(3);
    jest.advanceTimersByTime(STEP_MS);
    expect(controller.getSnapshot().beat).toBe("paper");
    expect(controller.getSnapshot().match.countdownValue).toBe(2);
    jest.advanceTimersByTime(STEP_MS);
    expect(controller.getSnapshot().beat).toBe("scissors");
    expect(controller.getSnapshot().match.countdownValue).toBe(1);
    jest.advanceTimersByTime(STEP_MS);
    view = controller.getSnapshot();
    expect(view.beat).toBe("shoot");
    expect(view.match.phase).toBe("detecting");
    expect(view.match.countdownValue).toBe("SHOOT");
    expect(view.match.sealedCommitment).toBe(sealed);
    // A second Space during the round does nothing.
    expect(controller.startRound()).toBe(false);
  });

  it("ignores a fist pumped during the countdown and the first moments after Shoot", () => {
    const controller = new MatchController("normal");
    controller.startRound();
    const countdownFrames = Math.floor(TO_SHOOT_MS / 55);
    feed(controller, "rock", countdownFrames); // the lock beat and the whole chant
    expect(controller.getSnapshot().match.phase).toBe("countdown");
    jest.advanceTimersByTime(TO_SHOOT_MS - countdownFrames * 55);
    expect(controller.getSnapshot().match.phase).toBe("detecting");

    // Still rock right after Shoot, inside the grace period: not a throw.
    feed(controller, "rock", Math.floor(SHOOT_GRACE_MS / 55));
    expect(controller.getSnapshot().match.phase).toBe("detecting");

    feed(controller, "paper", 5);
    const view = controller.getSnapshot();
    expect(view.match.phase).toBe("round_complete");
    expect(view.history).toHaveLength(1);
    expect(view.history[0].playerMove).toBe("paper");
  });

  it("needs several agreeing frames, not one lucky one", () => {
    const controller = new MatchController("normal");
    controller.startRound();
    toShoot();
    jest.advanceTimersByTime(SHOOT_GRACE_MS);
    feed(controller, "scissors", 1);
    feed(controller, "uncertain", 2);
    expect(controller.getSnapshot().match.phase).toBe("detecting");
    feed(controller, "scissors", 4);
    expect(controller.getSnapshot().history[0]?.playerMove).toBe("scissors");
  });

  it("says it missed after 3 s without a hand, and replays with the same sealed move", () => {
    const controller = new MatchController("hard");
    controller.startRound();
    const sealed = controller.getSnapshot().match.sealedCommitment!;
    toShoot();
    feed(controller, "none", 10);
    jest.advanceTimersByTime(SHOOT_TIMEOUT_MS);

    let view = controller.getSnapshot();
    expect(view.missed).toBe(true);
    expect(view.beat).toBeNull();
    expect(isRoundLive(view)).toBe(false);
    expect(view.match.phase).toBe("locked");
    expect(view.match.sealedCommitment).toBe(sealed);
    expect(view.history).toHaveLength(0);

    // Frames arriving while it waits for the replay change nothing.
    feed(controller, "rock", 6);
    expect(controller.getSnapshot().history).toHaveLength(0);

    expect(controller.startRound()).toBe(true);
    view = controller.getSnapshot();
    expect(view.missed).toBe(false);
    expect(view.beat).toBe("lock");
    expect(view.match.sealedCommitment).toBe(sealed);
    toShoot();
    jest.advanceTimersByTime(SHOOT_GRACE_MS);
    feed(controller, "rock", 5);
    view = controller.getSnapshot();
    expect(view.history).toHaveLength(1);
    expect(view.history[0].aiCounterMove).toBe(sealed.aiMove);
    expect(view.history[0].aiLockedAtMs).toBe(sealed.lockedAtMs);
  });

  it("throws a key pressed during the countdown at Shoot, and never times out with keys", () => {
    const controller = new MatchController("easy");
    controller.setInputMode("keys");
    controller.throwMove("rock"); // before the round: ignored
    expect(controller.getSnapshot().pendingThrow).toBeNull();

    controller.startRound();
    controller.throwMove("rock"); // during the lock beat: kept
    expect(controller.getSnapshot().pendingThrow).toBe("rock");
    jest.advanceTimersByTime(LEAD_IN_MS + STEP_MS);
    controller.throwMove("scissors"); // a change of mind during the chant
    expect(controller.getSnapshot().pendingThrow).toBe("scissors");
    expect(controller.getSnapshot().history).toHaveLength(0);
    jest.advanceTimersByTime(TO_SHOOT_MS - LEAD_IN_MS - STEP_MS);
    expect(controller.getSnapshot().history[0]?.playerMove).toBe("scissors");
    expect(controller.getSnapshot().beat).toBeNull();

    controller.startRound();
    toShoot();
    jest.advanceTimersByTime(SHOOT_TIMEOUT_MS * 3);
    expect(controller.getSnapshot().missed).toBe(false);
    expect(controller.getSnapshot().match.phase).toBe("detecting");
    controller.throwMove("paper");
    expect(controller.getSnapshot().history).toHaveLength(2);
  });

  it("ends the match at 5 wins and refuses another round", () => {
    const controller = new MatchController("normal");
    controller.setInputMode("keys");
    for (let i = 0; i < 40 && controller.getSnapshot().match.phase !== "match_complete"; i++) {
      controller.startRound();
      toShoot();
      // Throw what beats the sealed move, so the visitor wins every round.
      const aiMove = controller.getSnapshot().match.sealedCommitment!.aiMove;
      controller.throwMove(getCounterMove(aiMove));
    }
    const view = controller.getSnapshot();
    expect(view.match.phase).toBe("match_complete");
    expect(view.match.winner).toBe("player");
    expect(view.match.playerScore).toBe(5);
    expect(controller.startRound()).toBe(false);
  });
});

describe("What it thought before each round", () => {
  it("keeps the sealed guess for every finished round, in order", () => {
    const controller = new MatchController("normal");
    controller.setInputMode("keys");
    const sealedGuesses: PredictionBreakdown[] = [];
    for (const move of ["rock", "paper", "rock"] as const) {
      controller.startRound();
      sealedGuesses.push(controller.getSnapshot().match.sealedCommitment!.breakdown);
      toShoot();
      controller.throwMove(move);
    }
    const view = controller.getSnapshot();
    expect(view.guesses).toHaveLength(view.history.length);
    view.guesses.forEach((guess, i) => {
      expect(guess).toBe(sealedGuesses[i]);
      expect(guess.predictedPlayerMove).toBe(view.history[i].predictedPlayerMove);
      expect(guess.aiCounterMove).toBe(view.history[i].aiCounterMove);
    });
  });
});

describe("Rematch and Next player", () => {
  function playRounds(controller: MatchController, moves: Gesture[]) {
    for (const move of moves) {
      controller.startRound();
      toShoot();
      controller.throwMove(move);
    }
  }

  it("Rematch keeps the AI's memory of the visitor; Next player wipes it", () => {
    const controller = new MatchController("normal");
    controller.setInputMode("keys");
    playRounds(controller, ["rock", "rock", "paper"]);
    const learned = controller.getSnapshot();
    expect(learned.history).toHaveLength(3);

    controller.newMatch("hard");
    let view = controller.getSnapshot();
    expect(view.match.playerScore + view.match.aiScore + view.match.draws).toBe(0);
    expect(view.match.difficulty).toBe("hard");
    expect(view.history).toHaveLength(3);
    expect(view.guesses).toHaveLength(3);
    expect(view.learning.totalObservations).toBe(3);

    controller.forget();
    view = controller.getSnapshot();
    expect(view.history).toHaveLength(0);
    expect(view.guesses).toHaveLength(0);
    expect(view.learning.totalObservations).toBe(0);
    expect(view.match.difficulty).toBe("normal");
    expect(view.match.matchRounds).toHaveLength(0);
  });

  it("switching input mid-round or unmounting cancels the round without scoring it", () => {
    const controller = new MatchController("normal");
    controller.startRound();
    jest.advanceTimersByTime(STEP_MS);
    controller.setInputMode("keys");
    let view = controller.getSnapshot();
    expect(isRoundLive(view)).toBe(false);
    expect(view.match.sealedCommitment).toBeNull();
    jest.advanceTimersByTime(STEP_MS * 5);
    expect(controller.getSnapshot().match.phase).toBe("idle");

    controller.startRound();
    controller.dispose();
    jest.advanceTimersByTime(STEP_MS * 5);
    view = controller.getSnapshot();
    expect(view.match.phase).toBe("idle");
    expect(view.history).toHaveLength(0);
    // Still usable afterwards (React StrictMode mounts twice).
    expect(controller.startRound()).toBe(true);
  });
});
