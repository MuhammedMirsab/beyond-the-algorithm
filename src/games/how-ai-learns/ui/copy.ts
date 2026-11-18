/**
 * Words the game builds from real numbers. Sentence case, no dashes,
 * no exclamation marks (DESIGN.md §9).
 */

import type { Decision } from "../engine/rules";
import type { Outcome } from "../engine/rules";

export const pct = (x: number) => `${Math.round(x * 100)}%`;

/** "a pen", "an orange"... keys stay plural ("keys"). */
export function withArticle(label: string): string {
  const lower = label.toLowerCase();
  if (lower === "keys") return "keys";
  return /^[aeiou]/.test(lower) ? `an ${lower}` : `a ${lower}`;
}

/** "Pen and Cup" / "Pen, Cup and Keys" in lower case for sentences. */
export function joinWords(words: string[]): string {
  const w = words.map((x) => x.toLowerCase());
  if (w.length <= 1) return w.join("");
  return `${w.slice(0, -1).join(", ")} and ${w[w.length - 1]}`;
}

export const OUTCOME_WORD: Record<Outcome, string> = {
  right: "Right",
  wrong: "Wrong",
  unknown: "Not sure",
};

/** One sentence on why it answered (or didn't), from the real numbers. */
export function explainDecision(decision: Decision, threshold: number, truth?: string): string {
  const best = decision.top.label.toLowerCase();
  if (decision.reason === "unfamiliar") return "This photo doesn’t look much like any of its examples, so it won’t guess.";
  if (decision.reason === "unsure") {
    return `Its best guess is ${best}, but it is only ${pct(decision.top.probability)} sure. You asked for ${pct(threshold)}.`;
  }
  if (decision.reason === "torn") {
    const second = decision.runnerUp?.label.toLowerCase() ?? "another group";
    return `It can’t choose between ${best} and ${second}.`;
  }
  if (truth && decision.answer !== truth) return `It’s really ${withArticle(truth)}.`;
  return `${pct(decision.top.probability)} sure.`;
}
