import { describe, expect, test } from "bun:test";
import { renderToString } from "react-dom/server";
import { evaluateClue } from "../engine/clues";
import { createHumanState, humanReducer, type HumanState } from "../engine/human";
import { createMachineState, machineQuestion, machineReducer, type MachineState } from "../engine/machine";
import { RANGE_IDS, type RangeId } from "../engine/ranges";
import { HumanPlay } from "./human-play";
import { HumanResult } from "./human-result";
import { MachinePlay } from "./machine-play";
import { MachineRight, MachineWrong } from "./machine-result";

/*
 * Every screen renders for every range and phase without throwing, and none
 * of the visible copy is written in capitals. Server rendering skips effects
 * and animation, so this checks structure and words, not motion.
 */

const noop = () => {};

function playMachine(range: RangeId, secret: number, until: MachineState["phase"]): MachineState {
  let state = machineReducer(createMachineState(range), { type: "start" });
  for (let i = 0; i < 20 && state.phase !== until && state.phase !== "guess"; i++) {
    const q = machineQuestion(state);
    if (!q) break;
    state = machineReducer(state, { type: "answer", answer: evaluateClue(q, secret) });
    if (state.phase === until) break;
    state = machineReducer(state, { type: "advance" });
  }
  return state;
}

function playHuman(range: RangeId, secret: number, guesses: number[], clueIds: string[] = []): HumanState {
  let state = createHumanState(range, secret, 0);
  for (const id of clueIds) state = humanReducer(state, { type: "ask-card", id });
  for (const value of guesses) state = humanReducer(state, { type: "guess", value, now: 12_000 });
  return state;
}

/** Text a visitor reads: tags, attributes, scripts, styles and shadow-root templates stripped. */
function visibleText(html: string): string {
  return html
    .replace(/<(style|script|template)\b[\s\S]*?<\/\1>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/g, " ");
}

function expectSentenceCase(html: string) {
  const shouting = visibleText(html).match(/\b[A-Z]{3,}\b/g) ?? [];
  expect(shouting).toEqual([]);
  expect(visibleText(html)).not.toMatch(/[—–!]/);
}

describe("mind reader screens render", () => {
  for (const range of RANGE_IDS) {
    const secret = range === "10" ? 7 : range === "100" ? 37 : 637;

    test(`machine play, every phase, 1 to ${range}`, () => {
      const phases: MachineState[] = [
        createMachineState(range),
        machineReducer(createMachineState(range), { type: "start" }),
        playMachine(range, secret, "narrowing"),
        playMachine(range, secret, "guess"),
      ];
      for (const machine of phases) {
        const html = renderToString(<MachinePlay machine={machine} dispatch={noop} onRangeChange={noop} />);
        expect(html.length).toBeGreaterThan(200);
        expectSentenceCase(html);
      }
    });

    test(`machine results, 1 to ${range}`, () => {
      const guessed = playMachine(range, secret, "guess");
      const props = { dispatch: noop, onPlayAgain: noop, onPlayRange: noop, onSwitchMode: noop, onNextPlayer: noop };
      const right = renderToString(<MachineRight machine={machineReducer(guessed, { type: "confirm", correct: true })} {...props} />);
      expect(right).toContain("It found");
      expectSentenceCase(right);
      const wrong = renderToString(<MachineWrong machine={machineReducer(guessed, { type: "confirm", correct: false })} {...props} />);
      expect(wrong).toContain("didn");
      expectSentenceCase(wrong);
    });

    test(`find its number, playing and finished, 1 to ${range}`, () => {
      const max = range === "10" ? 10 : range === "100" ? 100 : 1000;
      const states = [
        playHuman(range, secret, []),
        playHuman(range, secret, [Math.round(max * 0.8)], ["s-parity-2"]),
        playHuman(range, secret, [Math.round(max * 0.8), secret], ["s-parity-2"]),
      ];
      for (const human of states) {
        const html = renderToString(<HumanPlay human={human} dispatch={noop} onFinished={noop} />);
        expectSentenceCase(html);
      }
      const won = states[2];
      expect(won.status).toBe("won");
      const result = renderToString(<HumanResult human={won} onPlayAgain={noop} onSwitchMode={noop} onNextPlayer={noop} />);
      expect(result).toContain("You found");
      expectSentenceCase(result);
      let lost = playHuman(range, secret, []);
      for (let g = 1; lost.status === "playing"; g++) if (g !== secret) lost = humanReducer(lost, { type: "guess", value: g, now: 1 });
      const lostHtml = renderToString(<HumanResult human={lost} onPlayAgain={noop} onSwitchMode={noop} onNextPlayer={noop} />);
      expect(lostHtml).toContain("Its number was");
      expectSentenceCase(lostHtml);
    });
  }
});
