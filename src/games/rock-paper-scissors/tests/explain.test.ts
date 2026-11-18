/**
 * The reasons shown next to each revealed guess: they must name the move it
 * guessed, use only real counts from the rounds it had seen, and never claim
 * a habit the counts don't back.
 */
import { describe, expect, it } from "bun:test";
import { createInitialLearningSnapshot, updateLearningSnapshot } from "../engine/aiLearningManager";
import { computeOutcome, getCounterMove, GESTURES, predictNextMove } from "../engine/aiPredictor";
import { explainGuess, isMixedGuess, topMove, transitionCounts } from "../engine/explain";
import type { Difficulty, Gesture, PredictionBreakdown, RoundRecord } from "../engine/types";

function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

/** Plays a sequence through the real predictor and keeps each round's sealed guess. */
function play(moves: Gesture[], difficulty: Difficulty, seed: number) {
  const rng = seeded(seed);
  let learning = createInitialLearningSnapshot();
  const history: RoundRecord[] = [];
  const guesses: PredictionBreakdown[] = [];
  for (const move of moves) {
    const guess = predictNextMove(history, difficulty, "first_to_five", { expertReliability: learning.expertReliability }, rng);
    const round: RoundRecord = {
      id: `r-${history.length}`,
      matchId: "m",
      roundNumber: history.length + 1,
      timestamp: history.length,
      mode: "first_to_five",
      difficulty,
      predictedPlayerMove: guess.predictedPlayerMove,
      aiCounterMove: guess.aiCounterMove,
      aiLockedAtMs: history.length,
      playerMove: move,
      playerDetectedAtMs: history.length,
      outcome: computeOutcome(move, guess.aiCounterMove),
      predictionConfidence: guess.confidence,
      wasPredictionCorrect: guess.predictedPlayerMove === move,
      detectedStrategy: guess.detectedStrategy,
      commentary: "",
      mood: "curious",
    };
    learning = updateLearningSnapshot(learning, round, guess, history);
    history.push(round);
    guesses.push(guess);
  }
  return { history, guesses };
}

const SEQUENCES: Gesture[][] = [
  Array(10).fill("rock"),
  ["rock", "paper", "scissors", "rock", "paper", "scissors", "rock", "paper", "scissors", "rock", "paper"],
  ["rock", "rock", "paper", "rock", "rock", "paper", "rock", "rock", "paper", "rock", "rock"],
  ["paper", "scissors", "scissors", "rock", "paper", "rock", "scissors", "paper", "paper", "rock", "scissors", "rock"],
  [...Array(6).fill("scissors"), ...Array(6).fill("paper")],
];

describe("Why it guessed what it guessed", () => {
  it("says the first guess is random", () => {
    const { history, guesses } = play(["rock"], "normal", 1);
    const reason = explainGuess(guesses[0], history.slice(0, 0), "normal");
    expect(reason.kind).toBe("first");
    expect(reason.text).toBe("It hadn't seen you play yet, so this guess was random.");
  });

  it("owns up when it picked something other than its top odds", () => {
    const guess: PredictionBreakdown = {
      predictedPlayerMove: "scissors",
      aiCounterMove: getCounterMove("scissors"),
      confidence: 0.5,
      probabilities: { rock: 0.5, paper: 0.3, scissors: 0.2 },
      methodContributions: [],
      detectedStrategy: "frequency_bias",
      topPatterns: [],
      explanation: "",
    };
    expect(isMixedGuess(guess)).toBe(true);
    expect(topMove(guess.probabilities)).toBe("rock");
    const { history } = play(["rock", "rock", "paper"], "easy", 2);
    const reason = explainGuess(guess, history, "easy");
    expect(reason.kind).toBe("mixed");
    expect(reason.text).toContain("rock");
  });

  it("names the guessed move and uses only real counts from earlier rounds", () => {
    for (const difficulty of ["easy", "normal", "hard"] as const) {
      for (const [n, seq] of SEQUENCES.entries()) {
        const { history, guesses } = play(seq, difficulty, 7 + n);
        guesses.forEach((guess, i) => {
          const before = history.slice(0, i);
          const reason = explainGuess(guess, before, difficulty);
          expect(reason.text).not.toMatch(/[–—!]/);
          expect(reason.text).not.toMatch(/\b1 times\b|\bof 1 times\b/);
          expect(reason.text.charAt(0)).toBe(reason.text.charAt(0).toUpperCase());
          if (reason.kind === "first" || reason.kind === "mixed" || reason.kind === "even") return;

          expect(reason.moves[reason.moves.length - 1]).toBe(guess.predictedPlayerMove);
          expect(reason.text).toContain(guess.predictedPlayerMove);
          expect(reason.count).toBeGreaterThanOrEqual(1);
          expect(reason.count).toBeLessThanOrEqual(reason.total);
          expect(reason.total).toBeLessThanOrEqual(before.length);
          if (reason.total > 1) {
            const said =
              reason.count === reason.total
                ? reason.total === 2
                  ? /\bboth\b/
                  : new RegExp(`\\ball ${reason.total}\\b`)
                : new RegExp(`\\b${reason.count} of (your )?(last )?${reason.total}\\b`);
            expect(reason.text).toMatch(said);
          }
          if (reason.kind === "favourite") {
            expect(reason.count).toBe(before.filter((r) => r.playerMove === guess.predictedPlayerMove).length);
            expect(reason.total).toBe(before.length);
          }
        });
      }
    }
    // Hundreds of predictions: room for a busy machine.
  }, 30_000);

  it("explains a visitor who always throws rock by their favourite or their repeats", () => {
    const { history, guesses } = play(Array(8).fill("rock"), "easy", 4);
    const last = guesses.length - 1;
    const reason = explainGuess(guesses[last], history.slice(0, last), "easy");
    if (reason.kind !== "mixed") {
      expect(guesses[last].predictedPlayerMove).toBe("rock");
      expect(["favourite", "after-move", "after-result", "recent", "sequence"]).toContain(reason.kind);
      expect(reason.text).toContain("rock");
    }
  });
});

describe("Transition counts", () => {
  it("counts every pair of neighbouring rounds once", () => {
    const { history } = play(SEQUENCES[3], "normal", 5);
    const counts = transitionCounts(history);
    let total = 0;
    for (const from of GESTURES) for (const to of GESTURES) total += counts[from][to];
    expect(total).toBe(history.length - 1);
    expect(counts.paper.scissors).toBeGreaterThanOrEqual(1);
  });
});
