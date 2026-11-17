import { describe, expect, test } from "bun:test";
import { clueKey, clueText, evaluateClue } from "./clues";
import { parseCustomClue } from "./custom-clue-parser";
import { generateSuggestionsPool } from "./game-engine";
import { createHumanState, humanCards, humanReducer } from "./human";
import { RANGE_IDS, RANGE_MAX } from "./ranges";

describe("clue cards", () => {
  test("wording comes from the range alone and is the same for every secret", () => {
    for (const range of RANGE_IDS) {
      const max = RANGE_MAX[range];
      const reference = humanCards(createHumanState(range, 1, 0)).map((c) => c.question);
      for (let secret = 1; secret <= max; secret++) {
        const cards = humanCards(createHumanState(range, secret, 0));
        expect(cards.map((c) => c.question)).toEqual(reference);
        // No answer exists before a card is used.
        expect(cards.every((c) => c.asked === null)).toBe(true);
      }
    }
  });

  test("cards read neutrally for 1 to 100", () => {
    expect(generateSuggestionsPool(100).map((c) => clueText(c.clue))).toEqual([
      "Is it more than 50?",
      "Is it even?",
      "Is it between 26 and 75?",
      "Is it a multiple of 5?",
      "Is it a multiple of 3?",
    ]);
    expect(clueText(generateSuggestionsPool(1000)[0].clue)).toBe("Is it more than 500?");
    expect(clueText(generateSuggestionsPool(1000)[2].clue)).toBe("Is it between 251 and 750?");
  });

  test("the half and bracket cards split the range exactly in half", () => {
    for (const max of [10, 100, 1000]) {
      const [half, , bracket] = generateSuggestionsPool(max);
      for (const card of [half, bracket]) {
        let yes = 0;
        for (let n = 1; n <= max; n++) if (evaluateClue(card.clue, n)) yes++;
        expect(yes).toBe(max / 2);
      }
    }
  });

  test("a used card shows the true answer, and the wording still doesn't change", () => {
    for (const secret of [12, 37, 64, 90]) {
      const state = humanReducer(createHumanState("100", secret, 0), { type: "ask-card", id: "s-macro-1" });
      const card = humanCards(state)[0];
      expect(card.question).toBe("Is it more than 50?");
      expect(card.asked?.answer).toBe(secret > 50);
    }
  });
});

describe("typed questions", () => {
  const read = (text: string) => {
    const parsed = parseCustomClue(text);
    return parsed.understood ? { question: parsed.question, typoNote: parsed.typoNote } : { message: parsed.message };
  };

  test("understands the examples, with typo fixing", () => {
    expect(read("Is it even?")).toEqual({ question: "Is it even?", typoNote: undefined });
    expect(read("is it divable by 5")).toEqual({ question: "Is it a multiple of 5?", typoNote: "Read “divable” as “divisible”." });
    expect(read("Is it between 20 and 40?").question).toBe("Is it between 20 and 40?");
    expect(read("is it grater than 50").question).toBe("Is it more than 50?");
    expect(read("is it grater than 50").typoNote).toBe("Read “grater” as “greater”.");
    expect(read("is it bigger than 10")).toEqual({ question: "Is it more than 10?", typoNote: undefined });
    expect(read("Is it less than 25?").question).toBe("Is it less than 25?");
    expect(read("is it odd").question).toBe("Is it odd?");
    expect(read("does it end in 7").question).toBe("Does it end in 7?");
    expect(read("is it prime").question).toBe("Is it a prime number?");
    expect(read("is it a square number").question).toBe("Is it a square number?");
    expect(read("is it a cube").question).toBe("Is it a cube number?");
    expect(read("is it 42").question).toBe("Is it 42?");
    expect(read("7").question).toBe("Is it 7?");
    expect(read("is it 20 to 40").question).toBe("Is it between 20 and 40?");
  });

  test("fixed parsing bugs from the original", () => {
    expect(read("is it more than 1,000").question).toBe("Is it more than 1,000?");
    expect(read("is it a 2 digit number").question).toBe("Does it have two digits?");
    expect(read("is it a single digit").question).toBe("Does it have one digit?");
    expect(read("is it evenly divisible by 3").question).toBe("Is it a multiple of 3?");
    expect(read("is it more 50").question).toBe("Is it more than 50?");
  });

  test("says what to try when it can't read the question", () => {
    expect(read("hello there").message).toContain("Is it even?");
    expect(read("   ").message).toContain("Type a question first");
    expect(read("is it divisible by 0").message).toBe("Pick a number above 0 to divide by.");
  });

  test("wording never depends on the secret", () => {
    const questions = ["is it even", "is it grater than 50", "between 20 and 40", "is it 42", "ends in 3", "is it prime"];
    for (const text of questions) {
      const asked = [5, 42, 77, 100].map((secret) => {
        const state = humanReducer(createHumanState("100", secret, 0), { type: "ask-text", text });
        return state.clues[0]?.question;
      });
      expect(new Set(asked).size).toBe(1);
    }
  });

  test("answers are plain yes or no and match the secret", () => {
    const state = humanReducer(createHumanState("100", 37, 0), { type: "ask-text", text: "does it end in 3" });
    expect(state.clues[0]).toMatchObject({ question: "Does it end in 3?", answer: false });
    const prime = humanReducer(createHumanState("100", 37, 0), { type: "ask-text", text: "is it prime" });
    expect(prime.clues[0].answer).toBe(true);
  });

  test("keys identify the same question however it was typed", () => {
    const a = parseCustomClue("is it bigger than 50");
    const b = parseCustomClue("IS IT MORE THAN 50?");
    expect(a.understood && b.understood && clueKey(a.clue) === clueKey(b.clue)).toBe(true);
  });
});
