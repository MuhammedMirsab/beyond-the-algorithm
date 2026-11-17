import { describe, expect, test } from "bun:test";
import { evaluateClue } from "./clues";
import { createMachineState, machineCandidates, machineGuess, machineQuestion, machineReducer, type MachineState } from "./machine";
import {
  binaryFact,
  binaryQuestionText,
  filterBinaryCandidates,
  findContradiction,
  getCandidatesForMax,
  getNextBinaryQuestion,
  PREDICTION_RANGES,
  type AnswerRecord,
} from "./prediction-engine";
import { halvingsFor, RANGE_IDS, RANGE_MAX } from "./ranges";

/** Answers every question honestly for `n`; returns the question path. */
function honestPath(max: number, n: number): AnswerRecord[] {
  let candidates = getCandidatesForMax(max);
  const path: AnswerRecord[] = [];
  for (let q = getNextBinaryQuestion(candidates, 0); q; q = getNextBinaryQuestion(candidates, path.length)) {
    const answer = evaluateClue(q, n);
    path.push({ question: q, answer });
    candidates = filterBinaryCandidates(candidates, q, answer);
    if (path.length > 20) throw new Error("runaway");
  }
  expect(candidates).toEqual([n]);
  return path;
}

/** Plays the reducer to the guess with the given answer function. */
function playMachine(range: (typeof RANGE_IDS)[number], answerFor: (state: MachineState) => boolean): MachineState {
  let state = machineReducer(createMachineState(range), { type: "start" });
  for (let i = 0; i < 50 && state.phase !== "guess"; i++) {
    state = machineReducer(state, { type: "answer", answer: answerFor(state) });
    expect(state.phase).toBe("narrowing");
    state = machineReducer(state, { type: "advance" });
  }
  return state;
}

describe("question sequence", () => {
  test("first questions read as the brief says", () => {
    expect(binaryQuestionText(getNextBinaryQuestion(getCandidatesForMax(100), 0)!)).toBe("Is your number more than 50?");
    expect(binaryQuestionText(getNextBinaryQuestion(getCandidatesForMax(1000), 0)!)).toBe("Is your number more than 500?");
    expect(getNextBinaryQuestion(getCandidatesForMax(50), 1)).toEqual({ kind: "even" });
  });

  for (const range of PREDICTION_RANGES) {
    test(`ends at exactly one candidate for every number from 1 to ${range.max}`, () => {
      const limit = halvingsFor(range.max);
      let longest = 0;
      for (let n = 1; n <= range.max; n++) {
        const path = honestPath(range.max, n);
        longest = Math.max(longest, path.length);
        expect(path.length).toBeLessThanOrEqual(limit);
        expect(path.length).toBeLessThanOrEqual(range.questionCap);
      }
      // 4, 7 and 10 questions: the bound is reached, never passed.
      expect(longest).toBe(limit);
    });
  }

  test("1 to 100 never needs more than 7 questions (2^7 = 128)", () => {
    expect(halvingsFor(100)).toBe(7);
    expect(halvingsFor(10)).toBe(4);
    expect(halvingsFor(1000)).toBe(10);
  });

  test("every question splits the list into two non-empty parts", () => {
    for (const max of [10, 100, 1000]) {
      let candidates = getCandidatesForMax(max);
      for (let i = 0; candidates.length > 1; i++) {
        const q = getNextBinaryQuestion(candidates, i)!;
        const yes = filterBinaryCandidates(candidates, q, true);
        const no = filterBinaryCandidates(candidates, q, false);
        expect(yes.length).toBeGreaterThan(0);
        expect(no.length).toBeGreaterThan(0);
        expect(Math.max(yes.length, no.length)).toBe(Math.ceil(candidates.length / 2));
        candidates = yes.length >= no.length ? yes : no;
      }
    }
  });
});

describe("machine reducer", () => {
  for (const range of RANGE_IDS) {
    test(`guesses right the first time for every honest number, 1 to ${RANGE_MAX[range]}`, () => {
      for (let n = 1; n <= RANGE_MAX[range]; n++) {
        const state = playMachine(range, (s) => evaluateClue(machineQuestion(s)!, n));
        expect(state.phase).toBe("guess");
        expect(machineCandidates(state)).toEqual([n]);
        expect(machineGuess(state)).toBe(n);
      }
    });
  }

  test("any answers at all, even lies, still end at one number inside the cap", () => {
    let seed = 7;
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    for (const range of RANGE_IDS) {
      for (let run = 0; run < 300; run++) {
        const state = playMachine(range, () => random() < 0.5);
        expect(state.phase).toBe("guess");
        expect(machineCandidates(state)).toHaveLength(1);
        expect(state.steps.length).toBeLessThanOrEqual(halvingsFor(RANGE_MAX[range]));
      }
    }
  });

  test("ignores answers during the narrowing beat", () => {
    let state = machineReducer(createMachineState("100"), { type: "start" });
    state = machineReducer(state, { type: "answer", answer: true });
    const again = machineReducer(state, { type: "answer", answer: false });
    expect(again).toBe(state);
    expect(state.steps).toHaveLength(1);
  });

  test("undo restores the previous list and question", () => {
    let state = machineReducer(createMachineState("100"), { type: "start" });
    const firstQuestion = machineQuestion(state);
    state = machineReducer(machineReducer(state, { type: "answer", answer: false }), { type: "advance" });
    expect(machineCandidates(state)).toHaveLength(50);
    state = machineReducer(state, { type: "undo" });
    expect(state.steps).toHaveLength(0);
    expect(machineCandidates(state)).toHaveLength(100);
    expect(machineQuestion(state)).toEqual(firstQuestion);
    expect(machineReducer(state, { type: "undo" })).toBe(state);
  });

  test("confirm only works on the guess", () => {
    const start = machineReducer(createMachineState("10"), { type: "start" });
    expect(machineReducer(start, { type: "confirm", correct: true })).toBe(start);
    const guessed = playMachine("10", (s) => evaluateClue(machineQuestion(s)!, 7));
    expect(machineReducer(guessed, { type: "confirm", correct: true }).phase).toBe("right");
    expect(machineReducer(guessed, { type: "confirm", correct: false }).phase).toBe("wrong");
  });
});

describe("contradiction finder", () => {
  test("honest answers have no contradiction", () => {
    for (const n of [1, 2, 37, 50, 51, 99, 100]) {
      expect(findContradiction(honestPath(100, n), n)).toBe(-1);
    }
  });

  test("finds the first answer that doesn't fit, wherever the slip was", () => {
    for (const max of [10, 100, 1000]) {
      for (const n of [1, Math.floor(max / 3), Math.floor(max / 2), max - 1, max]) {
        const steps = honestPath(max, n).length;
        for (let slip = 0; slip < steps; slip++) {
          // Replay with one wrong answer at `slip`; questions after it change, as they would live.
          let candidates = getCandidatesForMax(max);
          const answers: AnswerRecord[] = [];
          for (let q = getNextBinaryQuestion(candidates, 0); q; q = getNextBinaryQuestion(candidates, answers.length)) {
            const honest = evaluateClue(q, n);
            const answer = answers.length === slip ? !honest : honest;
            answers.push({ question: q, answer });
            candidates = filterBinaryCandidates(candidates, q, answer);
          }
          expect(candidates).toHaveLength(1);
          expect(candidates[0]).not.toBe(n);
          expect(findContradiction(answers, n)).toBe(slip);
          // The number it guessed fits every answer.
          expect(findContradiction(answers, candidates[0])).toBe(-1);
        }
      }
    }
  });

  test("explains the mismatch in plain words", () => {
    expect(binaryFact({ kind: "more-than", value: 50 }, 37)).toBe("37 is not more than 50");
    expect(binaryFact({ kind: "more-than", value: 50 }, 64)).toBe("64 is more than 50");
    expect(binaryFact({ kind: "even" }, 37)).toBe("37 is odd");
    expect(binaryFact({ kind: "more-than", value: 500 }, 1000)).toBe("1,000 is more than 500");
  });
});
