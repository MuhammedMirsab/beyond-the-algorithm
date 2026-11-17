import { describe, expect, it } from "bun:test";
import { createInitialLearningSnapshot } from "../engine/aiLearningManager";
import { getCounterMove } from "../engine/aiPredictor";
import {
  createNewMatchState,
  pauseMatchState,
  prepareAndLockRound,
  resumeMatchState,
  resolveRoundWithValidatedGesture,
  setCountdownStep,
} from "../engine/gameStateManager";
import type { RoundRecord } from "../engine/types";

describe("Game State Manager & Modes", () => {
  it("completes Best of Three when a player reaches 2 wins", () => {
    let match = createNewMatchState("best_of_three", "easy", "bo3-1");
    let learning = createInitialLearningSnapshot();
    const allRounds: RoundRecord[] = [];

    for (let step = 0; step < 6; step++) {
      if (match.phase === "match_complete") break;
      match = prepareAndLockRound(match, allRounds, learning);
      match = setCountdownStep(match, "SHOOT");
      const aiMove = match.sealedCommitment!.aiMove;
      // Pick the gesture that beats AI move so player wins deterministically
      const winningPlayerMove = aiMove === "rock" ? "paper" : aiMove === "paper" ? "scissors" : "rock";
      const res = resolveRoundWithValidatedGesture(match, winningPlayerMove, learning, allRounds);
      expect(res.accepted).toBe(true);
      match = res.nextMatch;
      learning = res.nextLearning;
      if (res.roundRecord) allRounds.push(res.roundRecord);
    }

    expect(match.phase).toBe("match_complete");
    expect(match.winner).toBe("player");
    expect(match.playerScore).toBe(2);
  });

  it("supports pause and resume cleanly without losing sealed state", () => {
    let match = createNewMatchState("quick_play", "normal");
    const learning = createInitialLearningSnapshot();
    match = prepareAndLockRound(match, [], learning);
    match = setCountdownStep(match, 2);

    const paused = pauseMatchState(match);
    expect(paused.phase).toBe("paused");
    expect(paused.sealedCommitment).not.toBeNull();

    const resumed = resumeMatchState(paused);
    expect(resumed.phase).toBe("countdown");
    expect(resumed.countdownValue).toBe(2);
  });

  // The original tested tournament stages here. This build has no tournaments,
  // so the same slot checks the mode the arcade plays: first to 5, AI winning.
  it("completes First to Five when the AI reaches 5 wins, and stops accepting rounds", () => {
    let match = createNewMatchState("first_to_five", "hard", "ft5-1");
    let learning = createInitialLearningSnapshot();
    const allRounds: RoundRecord[] = [];

    for (let step = 0; step < 12; step++) {
      if (match.phase === "match_complete") break;
      match = prepareAndLockRound(match, allRounds, learning);
      match = setCountdownStep(match, "SHOOT");
      // Throw the move the AI's sealed move beats, so the AI wins every round.
      const aiMove = match.sealedCommitment!.aiMove;
      const losingPlayerMove = aiMove === "rock" ? "scissors" : aiMove === "paper" ? "rock" : "paper";
      expect(getCounterMove(losingPlayerMove)).not.toBe(losingPlayerMove);
      const res = resolveRoundWithValidatedGesture(match, losingPlayerMove, learning, allRounds);
      expect(res.accepted).toBe(true);
      match = res.nextMatch;
      learning = res.nextLearning;
      if (res.roundRecord) allRounds.push(res.roundRecord);
      if (res.completedMatchRecord) {
        expect(res.completedMatchRecord.winner).toBe("ai");
        expect(res.completedMatchRecord.totalRounds).toBe(5);
      }
    }

    expect(match.phase).toBe("match_complete");
    expect(match.winner).toBe("ai");
    expect(match.aiScore).toBe(5);
    expect(match.matchRounds.length).toBe(5);
    expect(() => prepareAndLockRound(match, allRounds, learning)).toThrow();
  });
});
