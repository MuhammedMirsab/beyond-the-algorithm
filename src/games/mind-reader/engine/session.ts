/**
 * One visitor's session: the intro (with the shared range), then one of the
 * two modes. "next-player" drops everything back to a fresh intro.
 *
 * `round` changes whenever a new game starts, so the UI can key its local
 * state (inputs, the name form) to it and never carry it into the next game.
 */

import { cluesLeft, createHumanState, guessesLeft, humanReducer, humanScore, type HumanAction, type HumanState } from "./human";
import { createMachineState, machineCandidates, machineGuess, machineQuestion, machineReducer, type MachineAction, type MachineState } from "./machine";
import { binaryQuestionText } from "./prediction-engine";
import { DEFAULT_RANGE, formatNumber, rangeLabel, type RangeId } from "./ranges";

export type Session =
  | { screen: "intro"; range: RangeId; round: number }
  | { screen: "machine"; range: RangeId; round: number; machine: MachineState }
  | { screen: "human"; range: RangeId; round: number; human: HumanState };

export type SessionAction =
  | { type: "set-range"; range: RangeId }
  | { type: "start-machine"; range?: RangeId }
  | { type: "start-human"; secret: number; now: number }
  | { type: "to-intro" }
  | { type: "machine"; action: MachineAction }
  | { type: "human"; action: HumanAction }
  | { type: "next-player" };

export function initialSession(): Session {
  return { screen: "intro", range: DEFAULT_RANGE, round: 0 };
}

export function sessionReducer(session: Session, action: SessionAction): Session {
  switch (action.type) {
    case "set-range":
      if (session.screen === "intro") return { ...session, range: action.range };
      // Before the first question the visitor can still pick a bigger or smaller field.
      if (session.screen === "machine" && session.machine.phase === "think" && session.range !== action.range) {
        return { ...session, range: action.range, machine: createMachineState(action.range) };
      }
      return session;
    case "start-machine": {
      const range = action.range ?? session.range;
      return { screen: "machine", range, round: session.round + 1, machine: createMachineState(range) };
    }
    case "start-human":
      return {
        screen: "human",
        range: session.range,
        round: session.round + 1,
        human: createHumanState(session.range, action.secret, action.now),
      };
    case "to-intro":
      return { screen: "intro", range: session.range, round: session.round + 1 };
    case "machine":
      if (session.screen !== "machine") return session;
      return { ...session, machine: machineReducer(session.machine, action.action) };
    case "human":
      if (session.screen !== "human") return session;
      return { ...session, human: humanReducer(session.human, action.action) };
    case "next-player":
      return { screen: "intro", range: DEFAULT_RANGE, round: session.round + 1 };
  }
}

const plural = (n: number, one: string, many: string) => `${formatNumber(n)} ${n === 1 ? one : many}`;

/** What a screen reader should hear after each change. Derived, so it can't drift from the screen. */
export function describeSession(session: Session): string {
  if (session.screen === "intro") return "";

  if (session.screen === "machine") {
    const m = session.machine;
    switch (m.phase) {
      case "think":
        return `Think of a number from ${rangeLabel(m.range)}. Keep it in your head.`;
      case "ask": {
        const q = machineQuestion(m);
        return q ? `Question ${m.steps.length + 1}. ${binaryQuestionText(q)}` : "";
      }
      case "narrowing":
        return `Possible numbers: ${formatNumber(machineCandidates(m).length)}.`;
      case "guess":
        return `Your number is ${formatNumber(machineGuess(m))}. Is that right?`;
      case "right":
        return `It found your number, ${formatNumber(machineGuess(m))}, in ${plural(m.steps.length, "question", "questions")}.`;
      case "wrong":
        return "One of your answers didn't match your number.";
    }
  }

  const h = session.human;
  if (h.status === "won") {
    const score = humanScore(h);
    return `You found ${formatNumber(h.secret)} in ${plural(h.guesses.length, "guess", "guesses")}. Score ${formatNumber(score?.finalScore ?? 0)}.`;
  }
  if (h.status === "lost") return `Out of guesses. The number was ${formatNumber(h.secret)}.`;

  const e = h.event;
  if (!e) {
    return `I'm thinking of a number from ${rangeLabel(h.range)}. You have ${plural(guessesLeft(h), "guess", "guesses")}.`;
  }
  switch (e.kind) {
    case "guess": {
      const g = h.guesses[e.index];
      const dir = g.result === "higher" ? "more" : "less";
      return `${g.result === "higher" ? "Higher" : "Lower"}. It's ${dir} than ${formatNumber(g.value)}. ${plural(guessesLeft(h), "guess", "guesses")} left.`;
    }
    case "repeat-guess": {
      const g = h.guesses[e.index];
      return `You already guessed ${formatNumber(g.value)}. It's ${g.result === "higher" ? "higher" : "lower"}.`;
    }
    case "invalid-guess":
    case "not-understood":
      return e.message;
    case "clue": {
      const c = h.clues[e.index];
      return `${c.question} ${c.answer ? "Yes" : "No"}. ${plural(cluesLeft(h), "clue", "clues")} left.`;
    }
    case "repeat-clue": {
      const c = h.clues[e.index];
      return `You already asked that. ${c.question} ${c.answer ? "Yes" : "No"}.`;
    }
    case "no-clues-left":
      return "No clues left. Use your guesses.";
  }
}
