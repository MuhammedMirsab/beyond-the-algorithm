import { describe, expect, test } from "bun:test";
import { numberRange } from "./game-engine";
import { cluesLeft, createHumanState, elapsedSeconds, guessesLeft, humanReducer, humanScore, possibleNumbers, type HumanState } from "./human";
import { RANGE_IDS, RANGE_MAX } from "./ranges";
import { describeSession, initialSession, sessionReducer } from "./session";

const guess = (state: HumanState, value: number, now = 0) => humanReducer(state, { type: "guess", value, now });

describe("find its number", () => {
  test("guessing the middle of what's left always wins inside the budget", () => {
    for (const range of RANGE_IDS) {
      for (let secret = 1; secret <= RANGE_MAX[range]; secret++) {
        let state = createHumanState(range, secret, 0);
        while (state.status === "playing") {
          const possible = possibleNumbers(state);
          state = guess(state, possible[Math.floor((possible.length - 1) / 2)]);
        }
        expect(state.status).toBe("won");
        expect(state.guesses.length).toBeLessThanOrEqual(numberRange(range).maxGuesses);
      }
    }
  });

  test("higher and lower point the right way and narrow what's possible", () => {
    let state = createHumanState("100", 37, 0);
    state = guess(state, 50);
    expect(state.guesses[0]).toMatchObject({ value: 50, result: "lower", before: 100, after: 49 });
    state = guess(state, 20);
    expect(state.guesses[1]).toMatchObject({ result: "higher", before: 49, after: 29 });
    expect(possibleNumbers(state)[0]).toBe(21);
    expect(guessesLeft(state)).toBe(5);
  });

  test("runs out after the budget and ends the round", () => {
    let state = createHumanState("10", 10, 1000);
    for (const v of [1, 2, 3, 4]) state = guess(state, v, 5000);
    expect(state.status).toBe("lost");
    expect(state.endedAt).toBe(5000);
    expect(humanScore(state)).toBeNull();
    expect(guess(state, 10)).toBe(state);
  });

  test("a win records the time and a score", () => {
    let state = createHumanState("100", 50, 1000);
    state = guess(state, 50, 13_000);
    expect(state.status).toBe("won");
    expect(elapsedSeconds(state)).toBe(12);
    expect(humanScore(state)?.firstTryBonus).toBe(true);
  });

  test("bad and repeated guesses cost nothing", () => {
    let state = createHumanState("100", 37, 0);
    state = guess(state, 0);
    expect(state.event).toEqual({ kind: "invalid-guess", message: "Type a whole number from 1 to 100." });
    state = guess(state, 101);
    state = guess(state, 2.5);
    expect(state.guesses).toHaveLength(0);
    state = guess(guess(state, 60), 60);
    expect(state.guesses).toHaveLength(1);
    expect(state.event).toEqual({ kind: "repeat-guess", index: 0 });
  });

  test("clues are limited per range, and repeats are free", () => {
    let state = createHumanState("100", 37, 0);
    state = humanReducer(state, { type: "ask-card", id: "s-parity-2" });
    state = humanReducer(state, { type: "ask-text", text: "is it even?" });
    expect(state.clues).toHaveLength(1);
    expect(state.event).toEqual({ kind: "repeat-clue", index: 0 });
    state = humanReducer(state, { type: "ask-card", id: "s-macro-1" });
    state = humanReducer(state, { type: "ask-text", text: "is it prime" });
    expect(cluesLeft(state)).toBe(0);
    state = humanReducer(state, { type: "ask-card", id: "s-div-5" });
    expect(state.clues).toHaveLength(3);
    expect(state.event).toEqual({ kind: "no-clues-left" });
    // Not understood never uses up a clue.
    const fresh = humanReducer(createHumanState("10", 3, 0), { type: "ask-text", text: "what is it" });
    expect(fresh.event?.kind).toBe("not-understood");
    expect(cluesLeft(fresh)).toBe(1);
  });

  test("clues narrow the possible set beyond a min and max", () => {
    let state = createHumanState("100", 37, 0);
    state = humanReducer(state, { type: "ask-card", id: "s-parity-2" });
    expect(state.clues[0]).toMatchObject({ answer: false, before: 100, after: 50 });
    state = humanReducer(state, { type: "ask-card", id: "s-bracket-3" });
    expect(state.clues[1]).toMatchObject({ question: "Is it between 26 and 75?", answer: true, after: 25 });
    expect(possibleNumbers(state)).toContain(37);
    expect(possibleNumbers(state).every((n) => n % 2 === 1 && n >= 26 && n <= 75)).toBe(true);
  });

  test("the secret is always still possible", () => {
    for (const secret of [1, 13, 50, 51, 99, 100]) {
      let state = createHumanState("100", secret, 0);
      for (const text of ["is it even", "more than 30", "multiple of 3"]) {
        state = humanReducer(state, { type: "ask-text", text });
      }
      for (const v of [70, 20, 45]) state = guess(state, v);
      expect(possibleNumbers(state)).toContain(secret);
    }
  });
});

describe("session", () => {
  test("next player resets everything back to the default range", () => {
    let session = sessionReducer(initialSession(), { type: "set-range", range: "1000" });
    session = sessionReducer(session, { type: "start-human", secret: 400, now: 0 });
    expect(session.screen).toBe("human");
    session = sessionReducer(session, { type: "human", action: { type: "guess", value: 500, now: 1 } });
    session = sessionReducer(session, { type: "next-player" });
    expect(session).toMatchObject({ screen: "intro", range: "100" });
  });

  test("the range can't change mid-game", () => {
    let session = sessionReducer(initialSession(), { type: "start-machine" });
    session = sessionReducer(session, { type: "set-range", range: "10" });
    expect(session.range).toBe("100");
  });

  test("announces the question and the feedback", () => {
    let session = sessionReducer(initialSession(), { type: "start-machine" });
    session = sessionReducer(session, { type: "machine", action: { type: "start" } });
    expect(describeSession(session)).toBe("Question 1. Is your number more than 50?");
    let human = sessionReducer(initialSession(), { type: "start-human", secret: 37, now: 0 });
    human = sessionReducer(human, { type: "human", action: { type: "guess", value: 50, now: 1 } });
    expect(describeSession(human)).toBe("Lower. It's less than 50. 6 guesses left.");
  });
});
