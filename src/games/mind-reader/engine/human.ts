/**
 * "Find its number" as a reducer: the round logic that lived in the original
 * HumanGuessGame.tsx (startNewRound, handleSelectSuggestion,
 * handleCustomQuestionSubmit, handleGuessSubmit and the interval maths).
 *
 * Changes from the original:
 * - What's still possible is the exact set of numbers that fit every guess
 *   and every clue, not only a min/max window, so "Is it even?" and a "no"
 *   to "between 26 and 75" narrow it too.
 * - A clue's answer is worked out when it's asked, never before.
 * - Asking the same clue twice, or guessing a number twice, costs nothing:
 *   it just repeats the answer.
 * - The clock is two timestamps instead of a 1-second interval, so there is
 *   no timer to leak when the visitor leaves or the range changes.
 */

import { clueKey, clueText, evaluateClue, type Clue } from "./clues";
import { parseCustomClue } from "./custom-clue-parser";
import { calculateScore, generateSuggestionsPool, numberRange, type ScoreBreakdown } from "./game-engine";
import { formatNumber, RANGE_MAX, type RangeId } from "./ranges";

export type GuessResult = "higher" | "lower" | "correct";

export interface GuessRecord {
  value: number;
  result: GuessResult;
  /** Possible numbers before and after this guess. */
  before: number;
  after: number;
  /** The smallest and largest possible numbers before this guess. */
  low: number;
  high: number;
  /** The middle of what was possible before this guess: the guess that halves it. */
  middle: number;
}

export interface AskedClue {
  key: string;
  clue: Clue;
  question: string;
  /** true means yes. */
  answer: boolean;
  before: number;
  after: number;
  source: "card" | "typed";
  typoNote?: string;
}

export type HumanEvent =
  | { kind: "guess"; index: number }
  | { kind: "repeat-guess"; index: number }
  | { kind: "invalid-guess"; message: string }
  | { kind: "clue"; index: number }
  | { kind: "repeat-clue"; index: number }
  | { kind: "not-understood"; message: string }
  | { kind: "no-clues-left" };

export type HumanStatus = "playing" | "won" | "lost";

export interface HumanState {
  range: RangeId;
  secret: number;
  startedAt: number;
  endedAt: number | null;
  guesses: GuessRecord[];
  clues: AskedClue[];
  status: HumanStatus;
  /** What the last action did, for feedback and announcements. */
  event: HumanEvent | null;
  /** Counts actions, so repeated feedback still replays. */
  turn: number;
}

export type HumanAction =
  | { type: "guess"; value: number; now: number }
  | { type: "ask-card"; id: string }
  | { type: "ask-text"; text: string };

export function createHumanState(range: RangeId, secret: number, now: number): HumanState {
  const max = RANGE_MAX[range];
  return {
    range,
    secret: Math.min(max, Math.max(1, Math.round(secret))),
    startedAt: now,
    endedAt: null,
    guesses: [],
    clues: [],
    status: "playing",
    event: null,
    turn: 0,
  };
}

/** A fair secret: any whole number in the range, equally likely. */
export function randomSecret(range: RangeId): number {
  return Math.floor(Math.random() * RANGE_MAX[range]) + 1;
}

type Knowledge = Pick<HumanState, "guesses" | "clues">;

function fits(known: Knowledge, n: number): boolean {
  for (const g of known.guesses) {
    if (g.result === "correct" ? n !== g.value : g.result === "higher" ? n <= g.value : n >= g.value) return false;
  }
  for (const c of known.clues) {
    if (evaluateClue(c.clue, n) !== c.answer) return false;
  }
  return true;
}

/** Every number that fits all the guesses and clues so far. Always holds the secret. */
export function possibleNumbers(state: Knowledge & Pick<HumanState, "range">): number[] {
  const out: number[] = [];
  const max = RANGE_MAX[state.range];
  for (let n = 1; n <= max; n++) if (fits(state, n)) out.push(n);
  return out;
}

export function guessesLeft(state: HumanState): number {
  return Math.max(0, numberRange(state.range).maxGuesses - state.guesses.length);
}

export function cluesLeft(state: HumanState): number {
  return Math.max(0, numberRange(state.range).maxSuggestions - state.clues.length);
}

export function elapsedSeconds(state: HumanState): number {
  return state.endedAt == null ? 0 : Math.max(0, Math.round((state.endedAt - state.startedAt) / 1000));
}

export function humanScore(state: HumanState): ScoreBreakdown | null {
  if (state.status !== "won") return null;
  return calculateScore(RANGE_MAX[state.range], state.guesses.length, state.clues.length, elapsedSeconds(state));
}

export interface ClueCardView {
  id: string;
  question: string;
  /** The asked clue once used (by card or typed), else null: no answer exists before that. */
  asked: AskedClue | null;
}

/** The cards on screen. Built from the range and what was asked, never from the secret. */
export function humanCards(state: Pick<HumanState, "range" | "clues">): ClueCardView[] {
  return generateSuggestionsPool(RANGE_MAX[state.range]).map((card) => {
    const key = clueKey(card.clue);
    return { id: card.id, question: clueText(card.clue), asked: state.clues.find((c) => c.key === key) ?? null };
  });
}

function ask(state: HumanState, clue: Clue, source: AskedClue["source"], typoNote?: string): HumanState {
  const turn = state.turn + 1;
  const key = clueKey(clue);
  const existing = state.clues.findIndex((c) => c.key === key);
  if (existing >= 0) return { ...state, event: { kind: "repeat-clue", index: existing }, turn };
  if (cluesLeft(state) === 0) return { ...state, event: { kind: "no-clues-left" }, turn };

  const before = possibleNumbers(state).length;
  const asked: Omit<AskedClue, "after"> = {
    key,
    clue,
    question: clueText(clue),
    answer: evaluateClue(clue, state.secret),
    before,
    source,
    ...(typoNote ? { typoNote } : {}),
  };
  const after = possibleNumbers({ ...state, clues: [...state.clues, { ...asked, after: 0 }] }).length;
  const clues = [...state.clues, { ...asked, after }];
  return { ...state, clues, event: { kind: "clue", index: clues.length - 1 }, turn };
}

export function humanReducer(state: HumanState, action: HumanAction): HumanState {
  if (state.status !== "playing") return state;

  switch (action.type) {
    case "guess": {
      const turn = state.turn + 1;
      const { max, maxGuesses } = numberRange(state.range);
      const value = action.value;
      if (!Number.isInteger(value) || value < 1 || value > max) {
        return { ...state, event: { kind: "invalid-guess", message: `Type a whole number from 1 to ${formatNumber(max)}.` }, turn };
      }
      const repeat = state.guesses.findIndex((g) => g.value === value);
      if (repeat >= 0) return { ...state, event: { kind: "repeat-guess", index: repeat }, turn };

      const result: GuessResult = value === state.secret ? "correct" : state.secret > value ? "higher" : "lower";
      const possible = possibleNumbers(state);
      const before = possible.length;
      const window = {
        low: possible[0] ?? value,
        high: possible[possible.length - 1] ?? value,
        middle: possible[Math.floor((possible.length - 1) / 2)] ?? value,
      };
      const after = possibleNumbers({ ...state, guesses: [...state.guesses, { value, result, before, after: 0, ...window }] }).length;
      const guesses = [...state.guesses, { value, result, before, after, ...window }];
      const status: HumanStatus = result === "correct" ? "won" : guesses.length >= maxGuesses ? "lost" : "playing";
      return {
        ...state,
        guesses,
        status,
        endedAt: status === "playing" ? null : action.now,
        event: { kind: "guess", index: guesses.length - 1 },
        turn,
      };
    }

    case "ask-card": {
      const card = generateSuggestionsPool(RANGE_MAX[state.range]).find((c) => c.id === action.id);
      return card ? ask(state, card.clue, "card") : state;
    }

    case "ask-text": {
      const parsed = parseCustomClue(action.text);
      if (!parsed.understood) {
        return { ...state, event: { kind: "not-understood", message: parsed.message }, turn: state.turn + 1 };
      }
      return ask(state, parsed.clue, "typed", parsed.typoNote);
    }
  }
}
