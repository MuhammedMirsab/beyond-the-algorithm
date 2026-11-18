/**
 * Tests for what this build adds on top of the original engine: replaying a
 * missed round, ignoring the countdown's frames, the habits shown at the end,
 * the camera hints and the copy rules for the AI's comments.
 */
import { describe, expect, it } from "bun:test";
import { createInitialLearningSnapshot, updateLearningSnapshot } from "../engine/aiLearningManager";
import { computeOutcome, getCounterMove, predictNextMove } from "../engine/aiPredictor";
import {
  createNewMatchState,
  prepareAndLockRound,
  rearmRound,
  resolveRoundWithValidatedGesture,
  setCountdownStep,
} from "../engine/gameStateManager";
import { countHabits, describeHabits } from "../engine/insights";
import type { Difficulty, Gesture, RoundRecord } from "../engine/types";
import {
  canAcceptRoundGesture,
  clearValidationBuffer,
  createValidationState,
  markRoundGestureConfirmed,
  pushFrameToValidation,
} from "../vision/gestureValidation";
import { HINT_COPY, pickHint } from "../vision/hints";

function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

/** Plays a whole sequence through the real engine, the way the arena does. */
function play(moves: Gesture[], difficulty: Difficulty = "normal", seed = 3) {
  const rng = seeded(seed);
  let learning = createInitialLearningSnapshot();
  const history: RoundRecord[] = [];
  for (const move of moves) {
    const breakdown = predictNextMove(history, difficulty, "first_to_five", { expertReliability: learning.expertReliability }, rng);
    const round: RoundRecord = {
      id: `r-${history.length}`,
      matchId: "m",
      roundNumber: history.length + 1,
      timestamp: history.length,
      mode: "first_to_five",
      difficulty,
      predictedPlayerMove: breakdown.predictedPlayerMove,
      aiCounterMove: breakdown.aiCounterMove,
      aiLockedAtMs: history.length,
      playerMove: move,
      playerDetectedAtMs: history.length,
      outcome: computeOutcome(move, breakdown.aiCounterMove),
      predictionConfidence: breakdown.confidence,
      wasPredictionCorrect: breakdown.predictedPlayerMove === move,
      detectedStrategy: breakdown.detectedStrategy,
      commentary: "",
      mood: "curious",
    };
    learning = updateLearningSnapshot(learning, round, breakdown, history);
    history.push({ ...round, commentary: learning.lastCommentary });
  }
  return { history, learning };
}

/** A round with a fixed outcome, for habit counting. */
function round(i: number, playerMove: Gesture, outcome: RoundRecord["outcome"], correct = false): RoundRecord {
  return {
    id: `h-${i}`,
    matchId: "m",
    roundNumber: i + 1,
    timestamp: i,
    mode: "first_to_five",
    difficulty: "normal",
    predictedPlayerMove: playerMove,
    aiCounterMove: getCounterMove(playerMove),
    aiLockedAtMs: i,
    playerMove,
    playerDetectedAtMs: i,
    outcome,
    predictionConfidence: 0.4,
    wasPredictionCorrect: correct,
    detectedStrategy: "random",
    commentary: "",
    mood: "curious",
  };
}

describe("Replaying a round the camera missed", () => {
  it("keeps the sealed AI move and can still be resolved once", () => {
    let match = createNewMatchState("first_to_five", "normal", "rearm");
    const learning = createInitialLearningSnapshot();
    match = prepareAndLockRound(match, [], learning, () => 0.42);
    const sealed = match.sealedCommitment!;
    match = setCountdownStep(match, "SHOOT");

    const replay = rearmRound(match);
    expect(replay.phase).toBe("locked");
    expect(replay.countdownValue).toBe(3);
    expect(replay.sealedCommitment).toBe(sealed);

    const shoot = setCountdownStep(replay, "SHOOT");
    const res = resolveRoundWithValidatedGesture(shoot, "rock", learning, []);
    expect(res.accepted).toBe(true);
    expect(res.roundRecord!.aiCounterMove).toBe(sealed.aiMove);
    expect(res.roundRecord!.aiLockedAtMs).toBe(sealed.lockedAtMs);
  });

  it("refuses to replay a round that was never sealed", () => {
    const match = createNewMatchState("first_to_five", "normal", "unsealed");
    expect(() => rearmRound(match)).toThrow();
  });
});

describe("Frames from the countdown don't count at Shoot", () => {
  it("forgets a fist pumped during the countdown but keeps the duplicate guard", () => {
    let val = createValidationState();
    for (let i = 0; i < 6; i++) {
      val = pushFrameToValidation(val, { gesture: "rock", confidence: 0.95, timestamp: i * 50, qualityIssues: [] });
    }
    expect(canAcceptRoundGesture(val, "r1", 5_000).gesture).toBe("rock");

    val = markRoundGestureConfirmed(val, "r1", 5_000);
    val = clearValidationBuffer(val);
    expect(val.buffer.length).toBe(0);
    expect(val.stableGesture).toBe("none");
    expect(canAcceptRoundGesture(val, "r2", 9_000).allowed).toBe(false);
    expect(canAcceptRoundGesture(val, "r1", 9_000).reason).toBe("Round already resolved.");

    for (let i = 0; i < 4; i++) {
      val = pushFrameToValidation(val, { gesture: "paper", confidence: 0.9, timestamp: 9_000 + i * 50, qualityIssues: [] });
    }
    expect(canAcceptRoundGesture(val, "r2", 9_300).gesture).toBe("paper");
  });
});

describe("What it noticed about you", () => {
  it("counts the favourite move, reactions to losing and winning, and repeats", () => {
    const history = [
      round(0, "rock", "ai_win"),
      round(1, "paper", "ai_win"),
      round(2, "scissors", "ai_win"),
      round(3, "rock", "player_win"),
      round(4, "rock", "player_win"),
      round(5, "rock", "player_win"),
      round(6, "rock", "draw"),
    ];
    const habits = countHabits(history);
    expect(habits.total).toBe(7);
    expect(habits.favourite).toEqual({ move: "rock", count: 5 });
    expect(habits.afterLoss).toEqual({ switched: 3, total: 3 });
    expect(habits.afterWin).toEqual({ stayed: 3, total: 3 });
    expect(habits.repeats).toEqual({ count: 3, total: 6 });
    expect(habits.transition).toEqual({ from: "rock", to: "rock", count: 3, total: 4 });
  });

  it("only states habits with real numbers and enough rounds behind them", () => {
    const history = [
      round(0, "rock", "ai_win"),
      round(1, "paper", "ai_win"),
      round(2, "scissors", "ai_win"),
      round(3, "rock", "player_win"),
      round(4, "rock", "player_win"),
      round(5, "rock", "player_win"),
      round(6, "rock", "draw"),
    ];
    const lines = describeHabits(countHabits(history), 4);
    expect(lines[0].text).toBe("You picked rock 71% of the time.");
    expect(lines.map((l) => l.text)).toContain("After winning, you played the same move again 3 times out of 3.");
    for (const line of lines) {
      expect(line.text).not.toMatch(/[–—!]/);
      expect(line.text).not.toMatch(/1 times|out of 1\b|out of 2\b/);
    }

    // Two rounds are not enough to claim a reaction to losing.
    const short = describeHabits(countHabits([round(0, "rock", "ai_win"), round(1, "paper", "draw")]));
    expect(short.map((l) => l.id)).toEqual(["favourite"]);
    expect(describeHabits(countHabits([]))).toEqual([]);
  });

  it("counts the AI's correct guesses against the rounds played", () => {
    const habits = countHabits([round(0, "rock", "ai_win", true), round(1, "rock", "ai_win", true), round(2, "paper", "draw")]);
    expect(habits.guesses).toEqual({ correct: 2, total: 3 });
  });
});

describe("Camera hints", () => {
  it("waits for an issue to last a few frames, then picks the most useful one", () => {
    expect(pickHint([["too_far"], ["too_far"]], false)).toBeNull();
    const frames = Array.from({ length: 8 }, () => ["too_far", "low_light"] as const);
    expect(pickHint(frames.map((f) => [...f]), false)).toBe("low_light");
    expect(HINT_COPY.low_light).toBe("Move to brighter light");
  });

  it("doesn't nag about a lowered hand between rounds", () => {
    const frames = Array.from({ length: 10 }, () => ["no_hand" as const]);
    expect(pickHint(frames, false)).toBeNull();
    expect(pickHint(frames, true)).toBe("no_hand");
  });
});

describe("The AI's comments", () => {
  it("are plain sentences without dashes, arrows or exclamation marks", () => {
    const sequences: Gesture[][] = [
      Array(12).fill("rock"),
      ["rock", "paper", "scissors", "rock", "paper", "scissors", "rock", "paper", "scissors", "rock"],
      ["rock", "rock", "paper", "scissors", "rock", "rock", "paper", "scissors", "rock", "rock"],
      [...Array(8).fill("rock"), ...Array(8).fill("scissors")],
      ["paper", "scissors", "scissors", "rock", "paper", "rock", "scissors", "paper", "paper", "rock", "scissors"],
    ];
    for (const difficulty of ["easy", "normal", "hard"] as const) {
      for (const seq of sequences) {
        const { history, learning } = play(seq, difficulty);
        expect(learning.lastCommentary.length).toBeGreaterThan(0);
        for (const r of history) {
          expect(r.commentary).not.toMatch(/[–—→!]/);
          expect(r.commentary).not.toMatch(/\b(entropy|markov|ensemble|weights)\b/i);
          expect(r.commentary.charAt(0)).toBe(r.commentary.charAt(0).toUpperCase());
        }
      }
    }
    // Fifteen simulated sessions: room for a busy machine.
  }, 30_000);

  it("talks about the real counts when a visitor leans on one move", () => {
    const { history } = play(["rock", "paper", "rock", "rock", "scissors", "rock", "rock", "paper", "rock"], "easy", 11);
    const counts = history.map((r) => r.commentary).filter((c) => /out of \d+/.test(c));
    for (const line of counts) {
      const [, n, total] = /(\d+) times? out of (\d+)/.exec(line) ?? [];
      expect(Number(n)).toBeLessThanOrEqual(Number(total));
      expect(Number(total)).toBeLessThanOrEqual(history.length);
    }
  });
});
