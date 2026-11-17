/**
 * "Let it read my mind" as a reducer: the stage machine that lived inside the
 * original PredictionGame.tsx, minus the mentalist theatre (scripted remarks,
 * 2-second "thinking" pauses, the second-chance guess).
 *
 * think -> ask <-> narrowing -> guess -> right | wrong
 *
 * "narrowing" is the short beat after each answer while the crossed-out
 * numbers dim. The UI owns its timer and sends "advance"; the reducer ignores
 * answers that arrive during it, so double taps can't skip a question.
 */

import {
  filterBinaryCandidates,
  getCandidatesForMax,
  getNextBinaryQuestion,
  pickGuess,
  predictionRange,
  type BinaryQuestion,
} from "./prediction-engine";
import type { RangeId } from "./ranges";

export type MachinePhase = "think" | "ask" | "narrowing" | "guess" | "right" | "wrong";

export interface AnsweredStep {
  question: BinaryQuestion;
  /** true means the visitor said yes. */
  answer: boolean;
  /** How many numbers were possible before this answer. */
  before: number;
  /** The numbers still possible after it. Kept whole so Undo can restore them. */
  candidates: number[];
}

export interface MachineState {
  range: RangeId;
  phase: MachinePhase;
  steps: AnsweredStep[];
}

export type MachineAction =
  | { type: "start" }
  | { type: "answer"; answer: boolean }
  | { type: "advance" }
  | { type: "undo" }
  | { type: "confirm"; correct: boolean };

export function createMachineState(range: RangeId): MachineState {
  return { range, phase: "think", steps: [] };
}

export function machineCandidates(state: MachineState): number[] {
  const last = state.steps[state.steps.length - 1];
  return last ? last.candidates : getCandidatesForMax(predictionRange(state.range).max);
}

/** The question on screen: being asked, or (while narrowing) just answered. */
export function machineQuestion(state: MachineState): BinaryQuestion | null {
  if (state.phase === "narrowing") return state.steps[state.steps.length - 1]?.question ?? null;
  if (state.phase !== "ask") return null;
  const asked = state.steps.length;
  if (asked >= predictionRange(state.range).questionCap) return null;
  return getNextBinaryQuestion(machineCandidates(state), asked);
}

export function machineGuess(state: MachineState): number {
  return pickGuess(machineCandidates(state));
}

export function machineReducer(state: MachineState, action: MachineAction): MachineState {
  switch (action.type) {
    case "start":
      return state.phase === "think" ? { ...state, phase: "ask" } : state;

    case "answer": {
      if (state.phase !== "ask") return state;
      const question = machineQuestion(state);
      if (!question) return { ...state, phase: "guess" };
      const before = machineCandidates(state);
      const step: AnsweredStep = {
        question,
        answer: action.answer,
        before: before.length,
        candidates: filterBinaryCandidates(before, question, action.answer),
      };
      return { ...state, phase: "narrowing", steps: [...state.steps, step] };
    }

    case "advance": {
      if (state.phase !== "narrowing") return state;
      const done =
        machineCandidates(state).length <= 1 || state.steps.length >= predictionRange(state.range).questionCap;
      return { ...state, phase: done ? "guess" : "ask" };
    }

    case "undo":
      if (state.phase !== "ask" || state.steps.length === 0) return state;
      return { ...state, steps: state.steps.slice(0, -1) };

    case "confirm":
      // From "wrong", only a yes: the visitor typed the number it guessed after a mis-tap on "No".
      if (state.phase === "guess") return { ...state, phase: action.correct ? "right" : "wrong" };
      if (state.phase === "wrong" && action.correct) return { ...state, phase: "right" };
      return state;
  }
}
