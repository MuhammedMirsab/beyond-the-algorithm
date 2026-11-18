/**
 * Why the AI guessed what it guessed, in plain words with real counts.
 *
 * The predictor (aiPredictor.ts) blends five methods. For a sealed guess this
 * finds the method that pushed hardest toward the guessed move, then states
 * that method's evidence by counting the visitor's earlier rounds directly.
 * A reason is only given when the counts really back the guess: if the
 * guessed move wasn't the most common in that count, the next method is tried.
 *
 * Also: the transition counts and the method names the How it works panel
 * draws. Nothing here changes what the AI decides.
 */
import { GESTURES } from "./aiPredictor";
import type { Difficulty, Gesture, GestureProbabilities, PredictionBreakdown, PredictorMethod, RoundOutcome, RoundRecord } from "./types";

export type ReasonKind = "first" | "mixed" | "favourite" | "after-move" | "after-result" | "sequence" | "recent" | "even";

export interface Reason {
  kind: ReasonKind;
  /** One sentence for the screen. Every number in it is a real count. */
  text: string;
  /** The moves the sentence is about, oldest first, ending with the guess. */
  moves: Gesture[];
  /** The method behind it, when one is. */
  method: PredictorMethod | null;
  count: number;
  total: number;
}

/** The five methods, named the way a visitor would ask the question. */
export const METHOD_NAME: Record<PredictorMethod, string> = {
  frequency: "Your favourite move",
  markov: "What you throw after each move",
  outcome_markov: "What you do after a win or a loss",
  ngram: "Your short sequences",
  recent: "Your last few rounds",
};

/** The move with the highest odds (ties go to rock, then paper, like the predictor). */
export function topMove(probabilities: GestureProbabilities): Gesture {
  let best: Gesture = "rock";
  for (const g of GESTURES) if (probabilities[g] > probabilities[best]) best = g;
  return best;
}

/** True when it guessed something other than its top odds (the predictor explores now and then). */
export function isMixedGuess(guess: Pick<PredictionBreakdown, "predictedPlayerMove" | "probabilities">): boolean {
  const { predictedPlayerMove, probabilities } = guess;
  const top = topMove(probabilities);
  return predictedPlayerMove !== top && probabilities[predictedPlayerMove] < probabilities[top] - 1e-9;
}

/** "3 of 4 times", "both times", "all 5 times". */
function share(count: number, total: number): string {
  if (count === total) return total === 2 ? "both times" : `all ${total} times`;
  return `${count} of ${total} times`;
}

const emptyRow = (): Record<Gesture, number> => ({ rock: 0, paper: 0, scissors: 0 });

/** True when `move` has a count of at least 1 and no other move beats it. */
function backs(row: Record<Gesture, number>, move: Gesture): boolean {
  return row[move] >= 1 && GESTURES.every((g) => row[g] <= row[move]);
}

const rowTotal = (row: Record<Gesture, number>) => row.rock + row.paper + row.scissors;

/** What came next each time `matches(i)` held for an earlier round i. */
function nextAfter(before: readonly RoundRecord[], matches: (i: number) => boolean): Record<Gesture, number> {
  const row = emptyRow();
  for (let i = 0; i < before.length - 1; i++) if (matches(i)) row[before[i + 1].playerMove] += 1;
  return row;
}

const RESULT_WORD: Record<RoundOutcome, string> = { ai_win: "losing", player_win: "winning", draw: "a draw" };
const RESULT_VERB: Record<RoundOutcome, string> = { ai_win: "lost", player_win: "won", draw: "drew" };

function favourite(before: readonly RoundRecord[], g: Gesture): Reason | null {
  const row = emptyRow();
  for (const r of before) row[r.playerMove] += 1;
  if (!backs(row, g)) return null;
  const total = before.length;
  let text: string;
  if (total === 1) text = `You threw ${g} in your one earlier round.`;
  else if (row[g] === total) text = total === 2 ? `You threw ${g} in both your earlier rounds.` : `You threw ${g} in all ${total} of your earlier rounds.`;
  else text = `You threw ${g} in ${row[g]} of your ${total} earlier rounds.`;
  return { kind: "favourite", text, moves: [g], method: "frequency", count: row[g], total };
}

function afterMove(before: readonly RoundRecord[], g: Gesture): Reason | null {
  if (before.length < 2) return null;
  const last = before[before.length - 1].playerMove;
  const row = nextAfter(before, (i) => before[i].playerMove === last);
  if (!backs(row, g)) return null;
  const total = rowTotal(row);
  let text: string;
  if (total === 1) text = `The one other time you threw ${last}, ${g === last ? "you threw it again" : `${g} came next`}.`;
  else if (g === last) text = `After ${last}, you threw it again ${share(row[g], total)}.`;
  else text = `After ${last}, you threw ${g} next ${share(row[g], total)}.`;
  return { kind: "after-move", text, moves: [last, g], method: "markov", count: row[g], total };
}

function afterResult(before: readonly RoundRecord[], g: Gesture): Reason | null {
  if (before.length < 2) return null;
  const last = before[before.length - 1];
  const row = nextAfter(before, (i) => before[i].playerMove === last.playerMove && before[i].outcome === last.outcome);
  if (!backs(row, g)) return null;
  const total = rowTotal(row);
  const move = last.playerMove;
  let text: string;
  if (total === 1) {
    text = `The last time you ${RESULT_VERB[last.outcome]} with ${move}, ${g === move ? "you kept it" : `you threw ${g} next`}.`;
  } else if (g === move) {
    text = `After ${RESULT_WORD[last.outcome]} with ${move}, you kept it ${share(row[g], total)}.`;
  } else {
    text = `After ${RESULT_WORD[last.outcome]} with ${move}, you threw ${g} next ${share(row[g], total)}.`;
  }
  return { kind: "after-result", text, moves: [move, g], method: "outcome_markov", count: row[g], total };
}

function sequence(before: readonly RoundRecord[], g: Gesture, order: 2 | 3): Reason | null {
  if (before.length <= order) return null;
  const moves = before.map((r) => r.playerMove);
  const context = moves.slice(-order);
  const row = emptyRow();
  for (let i = 0; i + order < moves.length; i++) {
    if (context.every((m, j) => moves[i + j] === m)) row[moves[i + order]] += 1;
  }
  if (!backs(row, g)) return null;
  const total = rowTotal(row);
  const said = context.join(" then ");
  const text =
    total === 1 ? `The one other time you threw ${said}, ${g} came next.` : `After ${said}, you threw ${g} ${share(row[g], total)}.`;
  return { kind: "sequence", text, moves: [...context, g], method: "ngram", count: row[g], total };
}

function recent(before: readonly RoundRecord[], g: Gesture, difficulty: Difficulty): Reason | null {
  const window = before.slice(difficulty === "hard" ? -6 : -9);
  // Only worth saying when the window is shorter than everything (otherwise it's the favourite).
  if (window.length === before.length || window.length < 3) return null;
  const row = emptyRow();
  for (const r of window) row[r.playerMove] += 1;
  if (!backs(row, g) || row[g] < 2) return null;
  return {
    kind: "recent",
    text: `You threw ${g} in ${row[g]} of your last ${window.length} rounds.`,
    moves: [g],
    method: "recent",
    count: row[g],
    total: window.length,
  };
}

/**
 * The main reason behind a sealed guess. `before` is every round the AI had
 * seen when it locked (the visitor's history before that round).
 */
export function explainGuess(guess: PredictionBreakdown, before: readonly RoundRecord[], difficulty: Difficulty): Reason {
  const g = guess.predictedPlayerMove;
  if (before.length === 0) {
    return {
      kind: "first",
      text: "It hadn't seen you play yet, so this guess was random.",
      moves: [g],
      method: null,
      count: 0,
      total: 0,
    };
  }
  if (isMixedGuess(guess)) {
    const top = topMove(guess.probabilities);
    return {
      kind: "mixed",
      text: `Its odds pointed to ${top}, but now and then it picks another on purpose, so it's harder to read.`,
      moves: [top, g],
      method: null,
      count: 0,
      total: 0,
    };
  }

  // Methods ordered by how hard they pushed toward the guessed move.
  const pushes = guess.methodContributions
    .map((m) => ({ method: m.method, push: m.weight * (m.probabilities[g] - 1 / 3) }))
    .filter((m) => m.push > 0.002)
    .sort((a, b) => b.push - a.push);

  for (const { method } of pushes) {
    let reason: Reason | null = null;
    if (method === "frequency") reason = favourite(before, g);
    else if (method === "markov") reason = afterMove(before, g);
    else if (method === "outcome_markov") reason = afterResult(before, g);
    else if (method === "ngram") reason = (difficulty === "hard" ? sequence(before, g, 3) : null) ?? sequence(before, g, 2);
    else if (method === "recent") reason = recent(before, g, difficulty) ?? favourite(before, g);
    if (reason) return reason;
  }

  // Nothing pushed clearly: say so, unless the plain count still backs it.
  return (
    favourite(before, g) ?? {
      kind: "even",
      text: "Your moves were close to even, so this guess was close to random.",
      moves: [g],
      method: null,
      count: 0,
      total: 0,
    }
  );
}

/** How often each move followed each move: `from` → `to` → count. */
export function transitionCounts(history: readonly RoundRecord[]): Record<Gesture, Record<Gesture, number>> {
  const out: Record<Gesture, Record<Gesture, number>> = { rock: emptyRow(), paper: emptyRow(), scissors: emptyRow() };
  for (let i = 0; i < history.length - 1; i++) out[history[i].playerMove][history[i + 1].playerMove] += 1;
  return out;
}
