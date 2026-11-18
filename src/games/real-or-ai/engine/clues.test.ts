import { describe, expect, test } from "bun:test";
import { boxToImage, CLUE_NOTES, evidenceFor, explainedRound, freeCorner, notesFor, numberSide, playedClues, spotInBox, TELLS } from "./clues";
import { coverFit, flipFrom, loupeBackground } from "./geometry";
import { COMPARISON_PAIRS, getGameQuestions, pairAspect } from "./pairs";
import type { PlayerAnswer } from "./types";

describe("CLUE_NOTES", () => {
  test("every pair has a note for each of its three clues, and no note is left over", () => {
    for (const pair of COMPARISON_PAIRS) {
      const notes = notesFor(pair);
      expect(notes).not.toBeNull();
      expect(notes).toHaveLength(pair.aiItem.clues.length);
    }
    const ids = new Set(COMPARISON_PAIRS.map((p) => p.id));
    for (const id of Object.keys(CLUE_NOTES)) expect(ids.has(id)).toBe(true);
  });

  test("every spot lands inside the photo as the game crops it", () => {
    for (const pair of COMPARISON_PAIRS) {
      for (const note of notesFor(pair) ?? []) {
        expect(TELLS).toContain(note.tell);
        const shown = spotInBox(note.spot, pair.aiItem, pairAspect(pair));
        expect(shown.x).toBeGreaterThanOrEqual(0);
        expect(shown.x).toBeLessThanOrEqual(1);
        expect(shown.y).toBeGreaterThanOrEqual(0);
        expect(shown.y).toBeLessThanOrEqual(1);
      }
    }
  });

  test("a pair's three pins never overlap (48px rings on a photo 600px wide)", () => {
    for (const pair of COMPARISON_PAIRS) {
      const spots = (notesFor(pair) ?? []).map((n) => spotInBox(n.spot, pair.aiItem, pairAspect(pair)));
      for (let i = 0; i < spots.length; i++) {
        for (let j = i + 1; j < spots.length; j++) {
          // Distance in photo widths.
          const d = Math.hypot(spots[i].x - spots[j].x, (spots[i].y - spots[j].y) / pairAspect(pair));
          expect(d).toBeGreaterThan(50 / 600);
        }
      }
    }
  });
});

describe("spotInBox", () => {
  test("a wider image loses its sides, a taller one its top and bottom", () => {
    // 2:1 image in a 1:1 box shows the middle half across.
    expect(spotInBox({ x: 0.5, y: 0.3 }, { width: 200, height: 100 }, 1)).toEqual({ x: 0.5, y: 0.3 });
    expect(spotInBox({ x: 0.25, y: 0.3 }, { width: 200, height: 100 }, 1)).toEqual({ x: 0, y: 0.3 });
    expect(spotInBox({ x: 0.75, y: 0.3 }, { width: 200, height: 100 }, 1)).toEqual({ x: 1, y: 0.3 });
    // 1:2 image in a 1:1 box shows the middle half down.
    expect(spotInBox({ x: 0.2, y: 0.25 }, { width: 100, height: 200 }, 1)).toEqual({ x: 0.2, y: 0 });
  });

  test("boxToImage undoes it", () => {
    for (const pair of COMPARISON_PAIRS) {
      for (const image of [pair.aiItem, pair.realItem]) {
        const box = spotInBox({ x: 0.4, y: 0.6 }, image, pairAspect(pair));
        const back = boxToImage(box, image, pairAspect(pair));
        expect(back.x).toBeCloseTo(0.4, 9);
        expect(back.y).toBeCloseTo(0.6, 9);
      }
    }
  });
});

describe("geometry", () => {
  test("cover fit fills the box and centres the overflow", () => {
    expect(coverFit({ width: 300, height: 200 }, { width: 1200, height: 800 })).toEqual({ width: 300, height: 200, x: 0, y: 0 });
    expect(coverFit({ width: 200, height: 200 }, { width: 400, height: 200 })).toEqual({ width: 400, height: 200, x: -100, y: 0 });
  });

  test("the magnifier is centred on the pointer", () => {
    const box = { width: 300, height: 200 };
    const bg = loupeBackground(box, { width: 1200, height: 800 }, 150, 100, 2, 100);
    expect(bg).toEqual({ sizeX: 600, sizeY: 400, posX: 50 - 300, posY: 50 - 200 });
  });

  test("flipFrom maps one box onto another", () => {
    const to = { left: 100, top: 100, width: 400, height: 300 };
    expect(flipFrom({ left: 300, top: 250, width: 200, height: 150 }, to)).toEqual({ x: 100, y: 75, scale: 0.5 });
  });
});

const answer = (questionIndex: number, isCorrect: boolean): PlayerAnswer => ({
  questionIndex,
  pairId: `p${questionIndex}`,
  selectedOptionKey: isCorrect ? "A" : "B",
  correctOptionKey: "A",
  isCorrect,
  timeTakenSeconds: 5,
});

describe("the visitor's own clues", () => {
  test("eighteen clues for six rounds, each with its round's outcome", () => {
    const questions = getGameQuestions(6);
    const answers = questions.map((_, i) => answer(i, i % 2 === 0));
    const clues = playedClues(questions, answers);
    expect(clues).toHaveLength(18);
    expect(clues.filter((c) => c.answer.isCorrect)).toHaveLength(9);
  });

  test("evidence takes one clue per round and puts missed rounds first", () => {
    const questions = getGameQuestions(6);
    const answers = questions.map((_, i) => answer(i, i !== 4));
    for (const tell of TELLS) {
      const evidence = evidenceFor(tell, playedClues(questions, answers));
      expect(new Set(evidence.map((e) => e.round)).size).toBe(evidence.length);
      const firstFound = evidence.findIndex((e) => e.answer.isCorrect);
      if (firstFound >= 0) expect(evidence.slice(firstFound).every((e) => e.answer.isCorrect)).toBe(true);
    }
  });

  test("the round explained is the hardest round the AI won, or the hardest round when it won none", () => {
    const questions = getGameQuestions(6);
    const someMissed = questions.map((_, i) => answer(i, i !== 1 && i !== 3));
    expect(explainedRound(questions, someMissed)?.answer.questionIndex).toBe(3);
    const allFound = questions.map((_, i) => answer(i, true));
    expect(explainedRound(questions, allFound)?.question.pair.difficulty).toBe("hard");
    expect(explainedRound(questions, [])).toBeNull();
  });
});

describe("pin layout", () => {
  test("every pin's number lands inside the photo and clear of the photo's labels", () => {
    for (const pair of COMPARISON_PAIRS) {
      for (const note of notesFor(pair) ?? []) {
        const spot = spotInBox(note.spot, pair.aiItem, pairAspect(pair));
        const { dx, dy } = numberSide(spot);
        const x = spot.x + dx * 0.05;
        const y = spot.y + dy * 0.08;
        expect(x).toBeGreaterThan(0.03);
        expect(x).toBeLessThan(0.97);
        expect(y).toBeGreaterThan(0.04);
        expect(y).toBeLessThan(0.96);
        const inTopLeft = x < 0.42 && y < 0.22;
        const inTopRight = x > 0.85 && y < 0.22;
        expect(inTopLeft || inTopRight).toBe(false);
      }
    }
  });

  test("the pick label takes a bottom corner no pin sits in", () => {
    for (const pair of COMPARISON_PAIRS) {
      const spots = (notesFor(pair) ?? []).map((n) => spotInBox(n.spot, pair.aiItem, pairAspect(pair)));
      const corner = freeCorner(spots);
      // The label covers about the bottom quarter of the width and the bottom eighth of the height.
      const inLabel = (s: { x: number; y: number }) => s.y > 0.84 && (corner === "left" ? s.x < 0.3 : s.x > 0.7);
      expect(spots.some(inLabel)).toBe(false);
    }
  });
});
