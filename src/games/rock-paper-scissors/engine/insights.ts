/**
 * "What it noticed about you": the habits behind the predictions, counted from
 * this visitor's finished rounds. Every number here is a real count; a habit is
 * only mentioned once it has happened often enough to mean something.
 */
import { GESTURES } from "./aiPredictor";
import type { Gesture, RoundRecord } from "./types";

/** Fewest chances before a habit is worth mentioning ("1 time out of 1" says nothing). */
export const MIN_SUPPORT = 3;

/** How far from random a habit must be before it counts as one (see `surprise`). */
export const MIN_STRENGTH = 0.5;

export interface HabitCounts {
  total: number;
  counts: Record<Gesture, number>;
  /** The move picked most often (ties go to the earlier of rock, paper, scissors). */
  favourite: { move: Gesture; count: number } | null;
  /** Rounds the visitor lost that were followed by another round, and how often they changed move. */
  afterLoss: { switched: number; total: number };
  /** Rounds the visitor won that were followed by another round, and how often they kept the move. */
  afterWin: { stayed: number; total: number };
  /** The most repeated "after X you played Y", among moves played at least MIN_SUPPORT times before another round. */
  transition: { from: Gesture; to: Gesture; count: number; total: number } | null;
  /** How often the same move came twice in a row. */
  repeats: { count: number; total: number };
  /** How often the AI's locked guess matched the throw. */
  guesses: { correct: number; total: number };
}

export function countHabits(history: readonly RoundRecord[]): HabitCounts {
  const counts: Record<Gesture, number> = { rock: 0, paper: 0, scissors: 0 };
  for (const r of history) counts[r.playerMove] += 1;

  let favourite: HabitCounts["favourite"] = null;
  for (const g of GESTURES) {
    if (counts[g] > 0 && (!favourite || counts[g] > favourite.count)) favourite = { move: g, count: counts[g] };
  }

  const afterLoss = { switched: 0, total: 0 };
  const afterWin = { stayed: 0, total: 0 };
  const repeats = { count: 0, total: 0 };
  const pairs: Record<Gesture, Record<Gesture, number>> = {
    rock: { rock: 0, paper: 0, scissors: 0 },
    paper: { rock: 0, paper: 0, scissors: 0 },
    scissors: { rock: 0, paper: 0, scissors: 0 },
  };

  for (let i = 0; i < history.length - 1; i++) {
    const now = history[i];
    const next = history[i + 1];
    pairs[now.playerMove][next.playerMove] += 1;
    repeats.total += 1;
    if (next.playerMove === now.playerMove) repeats.count += 1;
    if (now.outcome === "ai_win") {
      afterLoss.total += 1;
      if (next.playerMove !== now.playerMove) afterLoss.switched += 1;
    } else if (now.outcome === "player_win") {
      afterWin.total += 1;
      if (next.playerMove === now.playerMove) afterWin.stayed += 1;
    }
  }

  let transition: HabitCounts["transition"] = null;
  for (const from of GESTURES) {
    const row = pairs[from];
    const total = row.rock + row.paper + row.scissors;
    if (total < MIN_SUPPORT) continue;
    for (const to of GESTURES) {
      const count = row[to];
      const best = transition ? transition.count / transition.total : 0;
      if (count / total > best || (count / total === best && transition && count > transition.count)) {
        transition = { from, to, count, total };
      }
    }
  }

  const guesses = { correct: history.filter((r) => r.wasPredictionCorrect).length, total: history.length };

  return { total: history.length, counts, favourite, afterLoss, afterWin, transition, repeats, guesses };
}

export interface Insight {
  id: "favourite" | "after-loss" | "after-win" | "transition" | "repeats";
  /** One sentence with real numbers, e.g. "After losing, you switched 7 times out of 10." */
  text: string;
  /** What a player who picks at random would do, for comparison. */
  random: string;
  /** Moves to draw next to the sentence. */
  moves: Gesture[];
  /** How far this habit is from random play, scaled by how often it was seen. Used to pick the strongest. */
  strength: number;
}

const percent = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

/** "1 time", "4 times". */
const times = (n: number) => (n === 1 ? "1 time" : `${n} times`);

/** How surprising `hits` out of `total` is when random play would hit with probability `p`. */
function surprise(hits: number, total: number, p: number): number {
  if (total === 0) return 0;
  return Math.abs(hits / total - p) * Math.sqrt(total);
}

/**
 * Turns the counts into short sentences, strongest habit first. The favourite
 * move always comes first, because it is what the AI uses even on Easy.
 */
export function describeHabits(habits: HabitCounts, limit = 3): Insight[] {
  const out: Insight[] = [];
  const { total, favourite, afterLoss, afterWin, transition, repeats } = habits;
  if (total === 0) return out;

  if (favourite) {
    out.push({
      id: "favourite",
      text: `You picked ${favourite.move} ${percent(favourite.count, total)}% of the time.`,
      random: "Picking at random gives about 33% each.",
      moves: [favourite.move],
      strength: Number.POSITIVE_INFINITY,
    });
  }

  const others: Insight[] = [];
  if (afterLoss.total >= MIN_SUPPORT) {
    others.push({
      id: "after-loss",
      text: `After losing, you switched ${times(afterLoss.switched)} out of ${afterLoss.total}.`,
      random: "Picking at random switches about 2 times in 3.",
      moves: [],
      strength: surprise(afterLoss.switched, afterLoss.total, 2 / 3),
    });
  }
  if (afterWin.total >= MIN_SUPPORT) {
    others.push({
      id: "after-win",
      text: `After winning, you played the same move again ${times(afterWin.stayed)} out of ${afterWin.total}.`,
      random: "Picking at random repeats about 1 time in 3.",
      moves: [],
      strength: surprise(afterWin.stayed, afterWin.total, 1 / 3),
    });
  }
  if (transition && transition.count >= 2) {
    others.push({
      id: "transition",
      text: `After ${transition.from}, you played ${transition.to} ${times(transition.count)} out of ${transition.total}.`,
      random: "Picking at random gives each move about 1 time in 3.",
      moves: [transition.from, transition.to],
      strength: surprise(transition.count, transition.total, 1 / 3),
    });
  }
  if (repeats.total >= MIN_SUPPORT + 1) {
    others.push({
      id: "repeats",
      text: `You played the same move twice in a row ${times(repeats.count)} out of ${repeats.total}.`,
      random: "Picking at random repeats about 1 time in 3.",
      moves: [],
      strength: surprise(repeats.count, repeats.total, 1 / 3),
    });
  }

  const habitsOnly = others.filter((insight) => insight.strength >= MIN_STRENGTH);
  habitsOnly.sort((a, b) => b.strength - a.strength);
  return [...out, ...habitsOnly].slice(0, limit);
}
