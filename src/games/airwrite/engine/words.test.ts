import { describe, expect, it } from "bun:test";
import type { Recognition } from "./recognition/recognize";
import { forTheScreen, isRude, normaliseWord } from "./words";

const reading = (text: string, alternatives: string[] = []): Recognition => ({ text, confidence: 0.8, alternatives, kind: "text", ms: 3 });

describe("isRude", () => {
  it("catches obvious words, spaced or not", () => {
    for (const w of ["FUCK", "f u c k", "SHIT", "dickhead", "ass"]) expect(isRude(w)).toBe(true);
  });
  it("leaves names and ordinary words alone", () => {
    for (const w of ["NAZIA", "SHITAL", "GRAPE", "CLASS", "PASS", "HI", "EDEX", "2026", "CAT", "DICKENS", "SCRAPE"]) expect(isRude(w)).toBe(false);
  });
});

describe("forTheScreen", () => {
  it("hides a rude reading completely", () => {
    expect(forTheScreen(reading("SHIT", ["SHOT"]))).toEqual({ result: { ...reading(""), alternatives: [] }, hidden: true });
  });
  it("keeps a clean reading and drops rude alternatives", () => {
    expect(forTheScreen(reading("SAT", ["SEX", "SAD"]))).toEqual({ result: reading("SAT", ["SAD"]), hidden: false });
  });
});

describe("normaliseWord", () => {
  it("ignores case, spaces and punctuation", () => {
    expect(normaliseWord("hello, World")).toBe(normaliseWord("HELLO WORLD"));
  });
});
