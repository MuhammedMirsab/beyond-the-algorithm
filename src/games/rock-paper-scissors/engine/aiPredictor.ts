/**
 * The opponent's brain, copied from the original app. Five simple predictors
 * (how often you pick each move, what you play after each move, what you do
 * after winning or losing, short sequences, your last few rounds) are blended
 * with weights that depend on the difficulty. It only ever reads rounds that
 * are already finished, so it can't see the throw it is trying to beat.
 *
 * Changes from the original: patterns are described in plain words (they reach
 * the screen through the AI's comments), and explanations have no dashes.
 */
import type {
  DetectedStrategy,
  Difficulty,
  DiscoveredPattern,
  GameMode,
  Gesture,
  GestureProbabilities,
  MethodContribution,
  PredictionBreakdown,
  RoundOutcome,
  RoundRecord,
  SealedAICommitment,
} from "./types";

export const GESTURES: readonly Gesture[] = ["rock", "paper", "scissors"] as const;

export function getCounterMove(gesture: Gesture): Gesture {
  switch (gesture) {
    case "rock":
      return "paper";
    case "paper":
      return "scissors";
    case "scissors":
      return "rock";
  }
}

export function computeOutcome(player: Gesture, ai: Gesture): RoundOutcome {
  if (player === ai) return "draw";
  if (
    (player === "rock" && ai === "scissors") ||
    (player === "paper" && ai === "rock") ||
    (player === "scissors" && ai === "paper")
  ) {
    return "player_win";
  }
  return "ai_win";
}

function normalizeProbs(raw: GestureProbabilities): GestureProbabilities {
  const sum = raw.rock + raw.paper + raw.scissors;
  if (sum <= 0 || !Number.isFinite(sum)) {
    return { rock: 1 / 3, paper: 1 / 3, scissors: 1 / 3 };
  }
  return {
    rock: raw.rock / sum,
    paper: raw.paper / sum,
    scissors: raw.scissors / sum,
  };
}

function argmaxGesture(probs: GestureProbabilities): Gesture {
  let best: Gesture = "rock";
  let maxVal = probs.rock;
  if (probs.paper > maxVal) {
    maxVal = probs.paper;
    best = "paper";
  }
  if (probs.scissors > maxVal) {
    best = "scissors";
  }
  return best;
}

function shannonEntropy(probs: GestureProbabilities): number {
  let h = 0;
  for (const g of GESTURES) {
    const p = probs[g];
    if (p > 1e-6) {
      h -= p * Math.log2(p);
    }
  }
  return h;
}

function totalVariationDistance(a: GestureProbabilities, b: GestureProbabilities): number {
  return 0.5 * (Math.abs(a.rock - b.rock) + Math.abs(a.paper - b.paper) + Math.abs(a.scissors - b.scissors));
}

/** "rock, then paper, then scissors": how a sequence reads on screen. */
export function describeSequence(moves: readonly Gesture[]): string {
  return moves.join(", then ");
}

/**
 * A. Frequency Analysis with Laplace smoothing
 */
export function computeFrequencyPrediction(
  moves: Gesture[],
  smoothingAlpha = 1.5
): { probs: GestureProbabilities; support: number; dominant: Gesture | null } {
  const counts: GestureProbabilities = {
    rock: smoothingAlpha,
    paper: smoothingAlpha,
    scissors: smoothingAlpha,
  };
  for (const m of moves) {
    counts[m] += 1;
  }
  const probs = normalizeProbs(counts);
  const rawCounts: Record<Gesture, number> = { rock: 0, paper: 0, scissors: 0 };
  for (const m of moves) rawCounts[m] += 1;

  let dominant: Gesture | null = null;
  if (moves.length >= 4) {
    const sorted = [...GESTURES].sort((a, b) => rawCounts[b] - rawCounts[a]);
    if (rawCounts[sorted[0]] - rawCounts[sorted[1]] >= Math.max(2, Math.floor(moves.length * 0.15))) {
      dominant = sorted[0];
    }
  }

  return { probs, support: moves.length, dominant };
}

/**
 * B1. 1st-Order Markov Transition Prediction P(M_t | M_{t-1})
 */
export function computeMarkovPrediction(
  moves: Gesture[],
  recencyDecay = 0.94,
  smoothingAlpha = 0.8
): { probs: GestureProbabilities; support: number; topTransition: DiscoveredPattern | null } {
  if (moves.length < 2) {
    return {
      probs: { rock: 1 / 3, paper: 1 / 3, scissors: 1 / 3 },
      support: 0,
      topTransition: null,
    };
  }

  const lastMove = moves[moves.length - 1];
  const counts: GestureProbabilities = {
    rock: smoothingAlpha,
    paper: smoothingAlpha,
    scissors: smoothingAlpha,
  };
  const rawFromLast: Record<Gesture, number> = { rock: 0, paper: 0, scissors: 0 };
  let support = 0;

  for (let i = 0; i < moves.length - 1; i++) {
    if (moves[i] === lastMove) {
      const age = moves.length - 2 - i;
      const weight = Math.pow(recencyDecay, age);
      counts[moves[i + 1]] += weight;
      rawFromLast[moves[i + 1]] += 1;
      support += 1;
    }
  }

  const probs = normalizeProbs(counts);
  const bestNext = argmaxGesture(probs);
  let topTransition: DiscoveredPattern | null = null;
  if (support >= 2 && probs[bestNext] >= 0.45) {
    topTransition = {
      id: `markov-${lastMove}-${bestNext}`,
      pattern: describeSequence([lastMove, bestNext]),
      moves: [lastMove, bestNext],
      predictedNext: bestNext,
      confidence: probs[bestNext],
      occurrences: rawFromLast[bestNext],
      type: "transition",
    };
  }

  return { probs, support, topTransition };
}

/**
 * B2. Outcome-Conditioned Markov P(M_t | M_{t-1}, O_{t-1})
 * Captures Win-Stay / Lose-Shift human psychology.
 */
export function computeOutcomeMarkovPrediction(
  history: Pick<RoundRecord, "playerMove" | "outcome">[],
  smoothingAlpha = 0.9
): { probs: GestureProbabilities; support: number } {
  if (history.length < 2) {
    return { probs: { rock: 1 / 3, paper: 1 / 3, scissors: 1 / 3 }, support: 0 };
  }

  const last = history[history.length - 1];
  const counts: GestureProbabilities = {
    rock: smoothingAlpha,
    paper: smoothingAlpha,
    scissors: smoothingAlpha,
  };
  let support = 0;

  for (let i = 0; i < history.length - 1; i++) {
    if (history[i].playerMove === last.playerMove && history[i].outcome === last.outcome) {
      counts[history[i + 1].playerMove] += 1;
      support += 1;
    }
  }

  return { probs: normalizeProbs(counts), support };
}

/**
 * C. N-gram Sequence Prediction (2-gram and 3-gram context matching)
 */
export function computeNgramPrediction(
  moves: Gesture[],
  maxOrder: 2 | 3 = 3
): { probs: GestureProbabilities; support: number; patterns: DiscoveredPattern[] } {
  if (moves.length < 3) {
    return {
      probs: { rock: 1 / 3, paper: 1 / 3, scissors: 1 / 3 },
      support: 0,
      patterns: [],
    };
  }

  const blended: GestureProbabilities = { rock: 1.0, paper: 1.0, scissors: 1.0 };
  let totalSupport = 0;
  const patterns: DiscoveredPattern[] = [];

  for (let n = 2; n <= maxOrder; n++) {
    if (moves.length <= n) continue;
    const context = moves.slice(-n);
    const counts: Record<Gesture, number> = { rock: 0, paper: 0, scissors: 0 };
    let orderSupport = 0;

    for (let i = 0; i <= moves.length - n - 1; i++) {
      let matches = true;
      for (let j = 0; j < n; j++) {
        if (moves[i + j] !== context[j]) {
          matches = false;
          break;
        }
      }
      if (matches) {
        const nextMove = moves[i + n];
        const age = moves.length - n - 1 - i;
        const recencyWeight = Math.pow(0.95, age);
        counts[nextMove] += recencyWeight;
        orderSupport += 1;
      }
    }

    if (orderSupport > 0) {
      const orderFactor = n === 3 ? 2.4 : 1.5;
      blended.rock += counts.rock * orderFactor;
      blended.paper += counts.paper * orderFactor;
      blended.scissors += counts.scissors * orderFactor;
      totalSupport += orderSupport;

      const orderProbs = normalizeProbs({
        rock: counts.rock + 0.5,
        paper: counts.paper + 0.5,
        scissors: counts.scissors + 0.5,
      });
      const bestNext = argmaxGesture(orderProbs);
      if (orderSupport >= 2 && orderProbs[bestNext] >= 0.45) {
        patterns.push({
          id: `ngram-${n}-${context.join("-")}-${bestNext}`,
          pattern: describeSequence([...context, bestNext]),
          moves: [...context, bestNext],
          predictedNext: bestNext,
          confidence: orderProbs[bestNext],
          occurrences: Math.round(counts[bestNext]),
          type: "sequence",
        });
      }
    }
  }

  return { probs: normalizeProbs(blended), support: totalSupport, patterns };
}

/**
 * D. Recent Behavior Analysis (sliding short window to catch strategy shifts fast)
 */
export function computeRecentBehaviorPrediction(
  moves: Gesture[],
  windowSize = 8
): {
  probs: GestureProbabilities;
  support: number;
  shiftMagnitude: number;
  isShifting: boolean;
} {
  if (moves.length === 0) {
    return {
      probs: { rock: 1 / 3, paper: 1 / 3, scissors: 1 / 3 },
      support: 0,
      shiftMagnitude: 0,
      isShifting: false,
    };
  }

  const recentMoves = moves.slice(-windowSize);
  const recentCounts: GestureProbabilities = { rock: 0.75, paper: 0.75, scissors: 0.75 };
  recentMoves.forEach((m, idx) => {
    const weight = 0.7 + (idx / Math.max(1, recentMoves.length - 1)) * 0.8;
    recentCounts[m] += weight;
  });

  // Also blend recent 1st-order transition inside the short window
  const recentMarkov = computeMarkovPrediction(recentMoves, 0.9, 0.7);
  const recentFreqProbs = normalizeProbs(recentCounts);

  const combined =
    recentMarkov.support >= 2
      ? normalizeProbs({
          rock: recentFreqProbs.rock * 0.45 + recentMarkov.probs.rock * 0.55,
          paper: recentFreqProbs.paper * 0.45 + recentMarkov.probs.paper * 0.55,
          scissors: recentFreqProbs.scissors * 0.45 + recentMarkov.probs.scissors * 0.55,
        })
      : recentFreqProbs;

  let shiftMagnitude = 0;
  let isShifting = false;
  if (moves.length >= windowSize + 4) {
    const olderMoves = moves.slice(0, -windowSize);
    const olderProbs = computeFrequencyPrediction(olderMoves, 1.0).probs;
    shiftMagnitude = totalVariationDistance(olderProbs, recentFreqProbs);
    isShifting = shiftMagnitude >= 0.28;
  }

  return {
    probs: combined,
    support: recentMoves.length,
    shiftMagnitude,
    isShifting,
  };
}

export interface PredictorConfig {
  expertReliability: Record<"frequency" | "markov" | "outcome_markov" | "ngram" | "recent", number>;
  rollingAccuracy: number;
}

export const DEFAULT_EXPERT_RELIABILITY: PredictorConfig["expertReliability"] = {
  frequency: 0.34,
  markov: 0.36,
  outcome_markov: 0.35,
  ngram: 0.38,
  recent: 0.35,
};

/**
 * E & F. Weighted Ensemble Prediction & Adaptive Strategy Selection.
 * Strictly reads ONLY completed prior rounds (`history`): it never sees the current throw.
 */
export function predictNextMove(
  history: readonly RoundRecord[],
  difficulty: Difficulty,
  mode: GameMode,
  config?: Partial<PredictorConfig>,
  rng: () => number = Math.random
): PredictionBreakdown {
  const moves = history.map((r) => r.playerMove);
  const totalObs = moves.length;
  const reliability = {
    ...DEFAULT_EXPERT_RELIABILITY,
    ...(config?.expertReliability ?? {}),
  };

  // Cold start handling (< 2 observations)
  if (totalObs === 0) {
    const pick = GESTURES[Math.floor(rng() * 3) % 3];
    return {
      predictedPlayerMove: pick,
      aiCounterMove: getCounterMove(pick),
      confidence: 0.33,
      probabilities: { rock: 1 / 3, paper: 1 / 3, scissors: 1 / 3 },
      methodContributions: [],
      detectedStrategy: "cold_start",
      topPatterns: [],
      explanation: "No rounds yet, so its first move is a random pick.",
    };
  }

  const effectiveDifficulty: Difficulty = mode === "practice" ? "easy" : difficulty;

  const freq = computeFrequencyPrediction(
    moves,
    effectiveDifficulty === "hard" ? 1.0 : 1.6
  );
  const markov = computeMarkovPrediction(
    moves,
    effectiveDifficulty === "hard" ? 0.91 : 0.95,
    effectiveDifficulty === "hard" ? 0.55 : 0.9
  );
  const outcomeMarkov = computeOutcomeMarkovPrediction(
    history.map((h) => ({ playerMove: h.playerMove, outcome: h.outcome })),
    effectiveDifficulty === "hard" ? 0.6 : 1.0
  );
  const ngram = computeNgramPrediction(moves, effectiveDifficulty === "hard" ? 3 : 2);
  const recent = computeRecentBehaviorPrediction(
    moves,
    effectiveDifficulty === "hard" ? 6 : 9
  );

  // Base weights differ genuinely by difficulty
  let rawWeights: Record<"frequency" | "markov" | "outcome_markov" | "ngram" | "recent", number>;
  if (effectiveDifficulty === "easy") {
    rawWeights = {
      frequency: 0.58,
      markov: 0.24,
      outcome_markov: 0.0,
      ngram: 0.0,
      recent: 0.18,
    };
  } else if (effectiveDifficulty === "normal") {
    rawWeights = {
      frequency: 0.2,
      markov: 0.28,
      outcome_markov: 0.14,
      ngram: ngram.support >= 2 ? 0.24 : 0.05,
      recent: recent.isShifting ? 0.34 : 0.19,
    };
  } else {
    // Hard: stronger sequence analysis, outcome-conditioned Markov, and rapid shift adaptation
    rawWeights = {
      frequency: 0.12,
      markov: 0.26,
      outcome_markov: outcomeMarkov.support >= 2 ? 0.2 : 0.08,
      ngram: ngram.support >= 2 ? 0.32 : 0.08,
      recent: recent.isShifting ? 0.42 : 0.22,
    };
  }

  // Modulate weights by empirical reliability of each predictor
  const weightedFactors = {
    frequency: rawWeights.frequency * (0.5 + reliability.frequency),
    markov: rawWeights.markov * (0.5 + reliability.markov) * (markov.support > 0 ? 1 : 0.35),
    outcome_markov:
      rawWeights.outcome_markov *
      (0.5 + reliability.outcome_markov) *
      (outcomeMarkov.support > 0 ? 1 : 0.25),
    ngram: rawWeights.ngram * (0.5 + reliability.ngram) * (ngram.support >= 2 ? 1.15 : 0.25),
    recent: rawWeights.recent * (0.5 + reliability.recent),
  };

  const wSum =
    weightedFactors.frequency +
    weightedFactors.markov +
    weightedFactors.outcome_markov +
    weightedFactors.ngram +
    weightedFactors.recent;

  const normWeights = {
    frequency: weightedFactors.frequency / wSum,
    markov: weightedFactors.markov / wSum,
    outcome_markov: weightedFactors.outcome_markov / wSum,
    ngram: weightedFactors.ngram / wSum,
    recent: weightedFactors.recent / wSum,
  };

  const methodContributions: MethodContribution[] = [
    {
      method: "frequency",
      label: "Frequency Analysis",
      probabilities: freq.probs,
      weight: normWeights.frequency,
      supportCount: freq.support,
    },
    {
      method: "markov",
      label: "Markov Transitions",
      probabilities: markov.probs,
      weight: normWeights.markov,
      supportCount: markov.support,
    },
    {
      method: "outcome_markov",
      label: "Win/Lose Reaction",
      probabilities: outcomeMarkov.probs,
      weight: normWeights.outcome_markov,
      supportCount: outcomeMarkov.support,
    },
    {
      method: "ngram",
      label: "N-Gram Sequences",
      probabilities: ngram.probs,
      weight: normWeights.ngram,
      supportCount: ngram.support,
    },
    {
      method: "recent",
      label: "Recent Window",
      probabilities: recent.probs,
      weight: normWeights.recent,
      supportCount: recent.support,
    },
  ];

  // Combine ensemble probabilities
  const ensembleRaw: GestureProbabilities = { rock: 0, paper: 0, scissors: 0 };
  for (const mc of methodContributions) {
    ensembleRaw.rock += mc.probabilities.rock * mc.weight;
    ensembleRaw.paper += mc.probabilities.paper * mc.weight;
    ensembleRaw.scissors += mc.probabilities.scissors * mc.weight;
  }

  // Smooth limited observations toward uniform so small samples don't overclaim
  const observationRamp = Math.min(1, totalObs / (effectiveDifficulty === "hard" ? 4 : 6));
  const smoothed = normalizeProbs({
    rock: ensembleRaw.rock * observationRamp + (1 / 3) * (1 - observationRamp),
    paper: ensembleRaw.paper * observationRamp + (1 / 3) * (1 - observationRamp),
    scissors: ensembleRaw.scissors * observationRamp + (1 / 3) * (1 - observationRamp),
  });

  // Detect player strategy & entropy
  const entropy = shannonEntropy(smoothed);
  const maxEntropy = Math.log2(3); // ~1.585
  const topPatterns: DiscoveredPattern[] = [...ngram.patterns];
  if (markov.topTransition) topPatterns.push(markov.topTransition);
  if (freq.dominant) {
    topPatterns.push({
      id: `bias-${freq.dominant}`,
      pattern: `mostly ${freq.dominant}`,
      moves: [freq.dominant],
      predictedNext: freq.dominant,
      confidence: freq.probs[freq.dominant],
      occurrences: moves.filter((m) => m === freq.dominant).length,
      type: "bias",
    });
  }

  let detectedStrategy: DetectedStrategy = "random";
  if (totalObs < 3) {
    detectedStrategy = "cold_start";
  } else if (recent.isShifting) {
    detectedStrategy = "strategy_shift";
  } else if (ngram.patterns.length > 0) {
    detectedStrategy = "sequence_pattern";
  } else if (markov.topTransition && markov.topTransition.confidence >= 0.5) {
    // Check if cyclic R->P->S or S->P->R
    const last = moves[moves.length - 1];
    const next = markov.topTransition.predictedNext;
    if (next !== last) {
      detectedStrategy = "markov_habit";
    } else {
      detectedStrategy = "frequency_bias";
    }
  } else if (freq.dominant) {
    detectedStrategy = "frequency_bias";
  } else if (entropy > maxEntropy * 0.96) {
    detectedStrategy = "random";
  }

  // Check if player looks cyclic over recent 6 moves
  if (moves.length >= 6) {
    const tail = moves.slice(-6);
    const isForwardCycle = tail.every((m, idx) => idx === 0 || m === getCounterMove(tail[idx - 1]));
    const isReverseCycle = tail.every((m, idx) => idx > 0 ? getCounterMove(m) === tail[idx - 1] : true);
    if (isForwardCycle || isReverseCycle) {
      detectedStrategy = "cyclic";
    }
  }

  // Adaptive strategy selection & exploration
  const predictedBest = argmaxGesture(smoothed);
  const rawConfidence = smoothed[predictedBest];

  // Epsilon exploration based on difficulty & weak signal
  const epsilon =
    mode === "practice"
      ? 0.5
      : effectiveDifficulty === "easy"
      ? 0.4
      : effectiveDifficulty === "normal"
      ? rawConfidence < 0.4
        ? 0.25
        : 0.08
      : rawConfidence < 0.37
      ? 0.15
      : 0.0;

  let chosenPredicted = predictedBest;
  if (rng() < epsilon) {
    // Sample proportionally from smoothed probabilities when exploring
    const roll = rng();
    if (roll < smoothed.rock) chosenPredicted = "rock";
    else if (roll < smoothed.rock + smoothed.paper) chosenPredicted = "paper";
    else chosenPredicted = "scissors";
  }

  const aiCounterMove = getCounterMove(chosenPredicted);

  let explanation = "Weighing how often you pick each move and what you play after each one.";
  if (detectedStrategy === "cold_start") {
    explanation = "Still watching your first moves before trusting any pattern.";
  } else if (detectedStrategy === "strategy_shift") {
    explanation = "Your last few moves don't match your earlier habits, so it trusts the recent ones more.";
  } else if (detectedStrategy === "cyclic") {
    explanation = "You are going round in a circle of moves.";
  } else if (detectedStrategy === "sequence_pattern" && topPatterns[0]) {
    explanation = `You have played ${topPatterns[0].pattern} before.`;
  } else if (detectedStrategy === "markov_habit" && markov.topTransition) {
    explanation = `You often play ${markov.topTransition.pattern}.`;
  } else if (detectedStrategy === "frequency_bias" && freq.dominant) {
    explanation = `You pick ${freq.dominant} more than the other moves.`;
  } else if (detectedStrategy === "random") {
    explanation = "Your recent moves look random, so it mixes up its own.";
  }

  return {
    predictedPlayerMove: chosenPredicted,
    aiCounterMove,
    confidence: Math.round(rawConfidence * 1000) / 1000,
    probabilities: smoothed,
    methodContributions,
    detectedStrategy,
    topPatterns: topPatterns.slice(0, 4),
    explanation,
  };
}

/**
 * Seals an AI decision strictly before the round begins.
 */
export function lockAIPredictionForRound(
  roundId: string,
  roundNumber: number,
  history: readonly RoundRecord[],
  difficulty: Difficulty,
  mode: GameMode,
  config?: Partial<PredictorConfig>,
  rng: () => number = Math.random
): SealedAICommitment {
  const breakdown = predictNextMove(history, difficulty, mode, config, rng);
  return {
    roundId,
    roundNumber,
    lockedAtMs: Date.now(),
    predictedPlayerMove: breakdown.predictedPlayerMove,
    aiMove: breakdown.aiCounterMove,
    confidence: breakdown.confidence,
    breakdown,
  };
}
