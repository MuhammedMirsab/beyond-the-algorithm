/**
 * What the opponent remembers about one visitor, copied from the original app.
 * `updateLearningSnapshot` is unchanged; the commentary strings are rewritten in
 * plain English, and every number in them is a real count from this visitor.
 * Dropped: rebuilding a snapshot from stored rounds (nothing is stored here).
 */
import type {
  AIPersonalityMood,
  Gesture,
  LearningActivityEvent,
  LearningSnapshot,
  PerGestureAccuracy,
  PredictionBreakdown,
  RoundOutcome,
  RoundRecord,
} from "./types";
import { DEFAULT_EXPERT_RELIABILITY } from "./aiPredictor";

export const OPENING_COMMENT = "Show me your first move. I'm ready to take notes.";

export function createInitialLearningSnapshot(): LearningSnapshot {
  return {
    totalObservations: 0,
    gestureCounts: { rock: 0, paper: 0, scissors: 0 },
    predictionsMade: 0,
    correctPredictions: 0,
    incorrectPredictions: 0,
    rollingAccuracy: 0,
    baselineFrequencyAccuracy: 0,
    baselineRandomAccuracy: 0.333,
    perGestureAccuracy: {
      rock: { predicted: 0, correct: 0 },
      paper: { predicted: 0, correct: 0 },
      scissors: { predicted: 0, correct: 0 },
    },
    expertReliability: { ...DEFAULT_EXPERT_RELIABILITY },
    recentActivity: [],
    mood: "curious",
    lastCommentary: OPENING_COMMENT,
    accuracyHistory: [],
  };
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "1 time", "3 times". */
function times(n: number): string {
  return n === 1 ? "1 time" : `${n} times`;
}

/**
 * The opponent's one-line comment after a round. Same decision order as the
 * original; only the words changed. It talks about the visitor's habits (the
 * "why"); the arena states the guess itself separately.
 */
export function determinePersonalityAndCommentary(
  snapshot: LearningSnapshot,
  round: {
    roundNumber: number;
    playerMove: Gesture;
    predictedPlayerMove: Gesture;
    wasPredictionCorrect: boolean;
    outcome: RoundOutcome;
    breakdown: PredictionBreakdown;
  },
  previousRounds: readonly RoundRecord[],
): { mood: AIPersonalityMood; commentary: string } {
  const { playerMove, predictedPlayerMove, wasPredictionCorrect, outcome, breakdown, roundNumber } = round;

  // Simple stats from real data (the snapshot already includes this round).
  const total = snapshot.totalObservations;
  const counts = snapshot.gestureCounts;
  const pct = (g: Gesture) => (total > 0 ? Math.round((counts[g] / total) * 100) : 33);

  // How many of the last few guesses (up to 5, this round included) were right.
  let recentCorrect = 0;
  for (let i = previousRounds.length - 1; i >= Math.max(0, previousRounds.length - 4); i--) {
    if (previousRounds[i].wasPredictionCorrect) recentCorrect++;
  }
  if (wasPredictionCorrect) recentCorrect++;
  const recentWindow = Math.min(5, previousRounds.length + 1);

  if (roundNumber <= 2 && previousRounds.length < 2) {
    if (previousRounds.length === 0) {
      return { mood: "curious", commentary: `${capitalize(playerMove)} to start. I'm writing that down.` };
    }
    return {
      mood: "curious",
      commentary: wasPredictionCorrect
        ? `I guessed ${playerMove}. Two rounds isn't much to go on, so I'm still counting.`
        : `You played ${playerMove}. I need a few more rounds to spot a pattern.`,
    };
  }

  if (breakdown.detectedStrategy === "strategy_shift") {
    return {
      mood: "surprised",
      commentary: wasPredictionCorrect
        ? "You changed your style, and I still caught it."
        : `You changed your style. My notes said ${predictedPlayerMove}, you played ${playerMove}.`,
    };
  }

  if (!wasPredictionCorrect && breakdown.confidence >= 0.52) {
    return {
      mood: "surprised",
      commentary: `I was ${Math.round(breakdown.confidence * 100)}% sure you'd play ${predictedPlayerMove}. You fooled me.`,
    };
  }

  if (wasPredictionCorrect && recentCorrect >= 3) {
    const top = breakdown.topPatterns[0];
    if (top && (top.type === "sequence" || top.type === "transition")) {
      return { mood: "confident", commentary: `${capitalize(top.pattern)}. You've done that before.` };
    }
    if (top && top.type === "bias") {
      return { mood: "confident", commentary: `You keep coming back to ${top.predictedNext}.` };
    }
    return {
      mood: "confident",
      commentary: `I've guessed right ${recentCorrect} times in the last ${recentWindow} rounds.`,
    };
  }

  if (breakdown.detectedStrategy === "frequency_bias" && pct(playerMove) >= 44) {
    return {
      mood: "competitive",
      commentary: `You've played ${playerMove} ${times(counts[playerMove])} out of ${total}.`,
    };
  }

  if (breakdown.detectedStrategy === "cyclic") {
    const lastThree = [...previousRounds.slice(-2).map((r) => r.playerMove), playerMove];
    return { mood: "competitive", commentary: `You're going round in a circle: ${lastThree.join(", ")}.` };
  }

  if (breakdown.detectedStrategy === "random") {
    // Rotate through a few honest lines so a hard-to-read player isn't told the same thing every round.
    const lines = [
      outcome === "player_win" ? "Nice mix. I can't find a pattern yet." : "Your moves are hard to guess right now.",
      `Rock ${counts.rock}, paper ${counts.paper}, scissors ${counts.scissors} so far. No favourite yet.`,
      "I'm still looking for a pattern in your moves.",
    ];
    return { mood: "cautious", commentary: lines[roundNumber % lines.length] };
  }

  if (wasPredictionCorrect) {
    return { mood: "confident", commentary: `I saw ${playerMove} coming from your last few moves.` };
  }

  const previousMove = previousRounds[previousRounds.length - 1]?.playerMove;
  return {
    mood: "competitive",
    commentary: previousMove
      ? `${capitalize(playerMove)} after ${previousMove}. I've added that to my notes.`
      : `You played ${playerMove}. I've added that to my notes.`,
  };
}

/**
 * Updates the AI learning metrics and each predictor's reliability after a
 * finished round. Never mutates input; returns a fresh snapshot.
 */
export function updateLearningSnapshot(
  prev: LearningSnapshot,
  round: RoundRecord,
  breakdown: PredictionBreakdown,
  allHistoryBeforeRound: readonly RoundRecord[],
): LearningSnapshot {
  const totalObservations = prev.totalObservations + 1;
  const gestureCounts = {
    ...prev.gestureCounts,
    [round.playerMove]: prev.gestureCounts[round.playerMove] + 1,
  };

  const predictionsMade = prev.predictionsMade + 1;
  const correctPredictions = prev.correctPredictions + (round.wasPredictionCorrect ? 1 : 0);
  const incorrectPredictions = prev.incorrectPredictions + (round.wasPredictionCorrect ? 0 : 1);

  const perGestureAccuracy: PerGestureAccuracy = {
    rock: { ...prev.perGestureAccuracy.rock },
    paper: { ...prev.perGestureAccuracy.paper },
    scissors: { ...prev.perGestureAccuracy.scissors },
  };
  perGestureAccuracy[round.predictedPlayerMove].predicted += 1;
  if (round.wasPredictionCorrect) {
    perGestureAccuracy[round.predictedPlayerMove].correct += 1;
  }

  // Rolling prediction accuracy over last 15 rounds
  const recentWindow = [...allHistoryBeforeRound.slice(-14), round];
  const rollingCorrect = recentWindow.filter((r) => r.wasPredictionCorrect).length;
  const rollingAccuracy = rollingCorrect / recentWindow.length;

  // Baseline frequency predictor accuracy (always predicting the prior most common gesture)
  const fullHistory = [...allHistoryBeforeRound, round];
  let freqBaselineCorrect = 0;
  const runningCounts: Record<Gesture, number> = { rock: 0, paper: 0, scissors: 0 };
  for (const r of fullHistory) {
    let best: Gesture = "rock";
    if (runningCounts.paper > runningCounts[best]) best = "paper";
    if (runningCounts.scissors > runningCounts[best]) best = "scissors";
    if (r.playerMove === best) freqBaselineCorrect++;
    runningCounts[r.playerMove]++;
  }
  const baselineFrequencyAccuracy = freqBaselineCorrect / fullHistory.length;

  // Update expert reliability using exponential moving average of probability assigned to true player move
  const expertReliability = { ...prev.expertReliability };
  for (const mc of breakdown.methodContributions) {
    const pTrue = mc.probabilities[round.playerMove];
    expertReliability[mc.method] = Math.min(0.95, Math.max(0.1, expertReliability[mc.method] * 0.82 + pTrue * 0.18));
  }

  // Learning activity events (kept for completeness; not shown in this build).
  const newEvents: LearningActivityEvent[] = [];
  const now = round.timestamp;
  if (breakdown.detectedStrategy === "strategy_shift") {
    newEvents.push({
      id: `evt-shift-${round.id}`,
      timestamp: now,
      roundNumber: round.roundNumber,
      type: "strategy_shift",
      message: `Round ${round.roundNumber}: the player changed style, so recent moves count more.`,
    });
  } else if (breakdown.topPatterns.length > 0 && round.wasPredictionCorrect) {
    const top = breakdown.topPatterns[0];
    newEvents.push({
      id: `evt-pat-${round.id}`,
      timestamp: now,
      roundNumber: round.roundNumber,
      type: top.type === "sequence" ? "sequence_repeated" : "pattern_discovered",
      message: `Pattern confirmed: ${top.pattern} (${Math.round(top.confidence * 100)}%).`,
    });
  } else if (
    prev.accuracyHistory.length > 0 &&
    Math.abs(rollingAccuracy - prev.accuracyHistory[prev.accuracyHistory.length - 1].rollingAccuracy) >= 0.08
  ) {
    const prevAcc = prev.accuracyHistory[prev.accuracyHistory.length - 1].rollingAccuracy;
    newEvents.push({
      id: `evt-acc-${round.id}`,
      timestamp: now,
      roundNumber: round.roundNumber,
      type: "confidence_change",
      message:
        rollingAccuracy > prevAcc
          ? `Recent guesses right: up to ${Math.round(rollingAccuracy * 100)}%.`
          : `Recent guesses right: down to ${Math.round(rollingAccuracy * 100)}%.`,
    });
  }

  const aiWins = fullHistory.filter((r) => r.outcome === "ai_win").length;
  const decisive = fullHistory.filter((r) => r.outcome !== "draw").length;
  const aiWinRate = decisive > 0 ? aiWins / decisive : 0;

  const accuracyHistory = [
    ...prev.accuracyHistory.slice(-49),
    {
      round: fullHistory.length,
      rollingAccuracy,
      confidence: round.predictionConfidence,
      aiWinRate,
    },
  ];

  const intermediateSnapshot: LearningSnapshot = {
    totalObservations,
    gestureCounts,
    predictionsMade,
    correctPredictions,
    incorrectPredictions,
    rollingAccuracy,
    baselineFrequencyAccuracy,
    baselineRandomAccuracy: 1 / 3,
    perGestureAccuracy,
    expertReliability,
    recentActivity: [...newEvents, ...prev.recentActivity].slice(0, 20),
    mood: prev.mood,
    lastCommentary: prev.lastCommentary,
    accuracyHistory,
  };

  const { mood, commentary } = determinePersonalityAndCommentary(
    intermediateSnapshot,
    {
      roundNumber: round.roundNumber,
      playerMove: round.playerMove,
      predictedPlayerMove: round.predictedPlayerMove,
      wasPredictionCorrect: round.wasPredictionCorrect,
      outcome: round.outcome,
      breakdown,
    },
    allHistoryBeforeRound,
  );

  return {
    ...intermediateSnapshot,
    mood,
    lastCommentary: commentary,
  };
}
