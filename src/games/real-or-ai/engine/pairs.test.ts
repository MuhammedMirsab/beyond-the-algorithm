import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { aiSides, COMPARISON_PAIRS, getGameQuestions, pairAspect } from "./pairs";

const PUBLIC_DIR = join(import.meta.dir, "..", "..", "..", "..", "public");

/** Width and height from a JPEG's start-of-frame marker. */
function jpegSize(bytes: Uint8Array): { width: number; height: number } | null {
  let i = 2;
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) return null;
    const marker = bytes[i + 1];
    const length = (bytes[i + 2] << 8) | bytes[i + 3];
    const isFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isFrame) return { height: (bytes[i + 5] << 8) | bytes[i + 6], width: (bytes[i + 7] << 8) | bytes[i + 8] };
    i += 2 + length;
  }
  return null;
}

const BANNED = /\b(delve|leverage|unlock|empower|elevate|seamless\w*|cutting-edge|revolutionary|magic\w*|journey|harness|robust|crucial|pivotal|showcase|vibrant)\b/i;

describe("COMPARISON_PAIRS", () => {
  test("ten pairs: 3 easy, 3 medium, 4 hard, each with 3 clues", () => {
    expect(COMPARISON_PAIRS).toHaveLength(10);
    const count = (d: string) => COMPARISON_PAIRS.filter((p) => p.difficulty === d).length;
    expect([count("easy"), count("medium"), count("hard")]).toEqual([3, 3, 4]);
    for (const pair of COMPARISON_PAIRS) expect(pair.aiItem.clues).toHaveLength(3);
    expect(new Set(COMPARISON_PAIRS.map((p) => p.id)).size).toBe(10);
  });

  test("file names never say which photo is AI", () => {
    for (const pair of COMPARISON_PAIRS) {
      for (const photo of [pair.realItem, pair.aiItem]) {
        const file = photo.src.split("/").pop() ?? "";
        expect(file).toMatch(/^[a-z]+-[12]\.jpg$/);
      }
    }
    // And "-1" isn't always the AI one.
    const aiFirst = COMPARISON_PAIRS.filter((p) => p.aiItem.src.endsWith("-1.jpg")).length;
    expect(aiFirst).toBeGreaterThan(0);
    expect(aiFirst).toBeLessThan(COMPARISON_PAIRS.length);
  });

  test("every file exists and matches the size in the data (the shared crop depends on it)", async () => {
    for (const pair of COMPARISON_PAIRS) {
      for (const photo of [pair.realItem, pair.aiItem]) {
        const file = Bun.file(join(PUBLIC_DIR, photo.src));
        expect(await file.exists()).toBe(true);
        const size = jpegSize(new Uint8Array(await file.arrayBuffer()));
        expect(size).toEqual({ width: photo.width, height: photo.height });
      }
    }
  });

  test("copy follows the writing rules: no dashes, no exclamation marks, no banned words", () => {
    const strings = COMPARISON_PAIRS.flatMap((p) => [p.subject, ...p.aiItem.clues]);
    for (const s of strings) {
      // En dash, em dash, exclamation mark.
      expect(s).not.toMatch(/[–—!]/);
      expect(s).not.toMatch(BANNED);
    }
  });

  test("no invented sources or tool names", () => {
    const text = JSON.stringify(COMPARISON_PAIRS);
    expect(text).not.toMatch(/Archive|Forensic AI Lab|Gemini Diffusion|Optical|Neural Diffusion|Exhibition Custom/i);
    for (const pair of COMPARISON_PAIRS) {
      const { source, license } = pair.realItem.credit;
      // Either a real Commons credit with its licence, or honestly unknown.
      if (source === null) expect(license).toBeNull();
      else expect([source, typeof license]).toEqual(["Wikimedia Commons", "string"]);
    }
  });

  test("the shared crop box sits between the two photos' shapes", () => {
    for (const pair of COMPARISON_PAIRS) {
      const a = pair.realItem.width / pair.realItem.height;
      const b = pair.aiItem.width / pair.aiItem.height;
      const r = pairAspect(pair);
      expect(r).toBeGreaterThanOrEqual(Math.min(a, b) - 0.001);
      expect(r).toBeLessThanOrEqual(Math.max(a, b) + 0.001);
    }
  });
});

describe("getGameQuestions", () => {
  test("six rounds: 2 easy, 2 medium, 2 hard, all different pairs", () => {
    const qs = getGameQuestions(6);
    expect(qs.map((q) => q.pair.difficulty)).toEqual(["easy", "easy", "medium", "medium", "hard", "hard"]);
    expect(new Set(qs.map((q) => q.pair.id)).size).toBe(6);
    expect(qs.map((q) => q.questionNumber)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  test("one AI and one real photo per round, and the answer key points at the AI one", () => {
    for (let run = 0; run < 20; run++) {
      for (const q of getGameQuestions(6)) {
        const ai = q.correctOptionKey === "A" ? q.optionA : q.optionB;
        const realOne = q.correctOptionKey === "A" ? q.optionB : q.optionA;
        expect(ai.isReal).toBe(false);
        expect(realOne.isReal).toBe(true);
        expect(ai.id).toBe(q.pair.aiItem.id);
      }
    }
  });

  test("the next player gets the pairs the last one didn't see first", () => {
    const first = getGameQuestions(6).filter((q) => q.pair.difficulty === "easy").map((q) => q.pair.id);
    const second = getGameQuestions(6).filter((q) => q.pair.difficulty === "easy").map((q) => q.pair.id);
    const unseen = COMPARISON_PAIRS.filter((p) => p.difficulty === "easy" && !first.includes(p.id)).map((p) => p.id);
    expect(unseen).toHaveLength(1);
    expect(second).toContain(unseen[0]);
  });

  test("the AI photo is never on one side for more than 4 of 6 rounds", () => {
    for (let run = 0; run < 300; run++) {
      const onA = getGameQuestions(6).filter((q) => q.correctOptionKey === "A").length;
      expect(onA).toBeGreaterThanOrEqual(2);
      expect(onA).toBeLessThanOrEqual(4);
    }
  });
});

describe("aiSides", () => {
  test("falls back to alternating if the coin keeps landing one way", () => {
    expect(aiSides(6, () => 0.1)).toEqual(["A", "B", "A", "B", "A", "B"]);
  });
});
