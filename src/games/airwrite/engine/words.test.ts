import { describe, expect, it } from "bun:test";
import type { Recognition } from "./recognition/recognize";
import { displayCase, forTheScreen, inDisplayCase, isRude, normaliseWord } from "./words";

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

describe("displayCase", () => {
  it("shows a reading in capitals in sentence case", () => {
    expect(displayCase("CAT")).toBe("Cat");
    expect(displayCase("HELLO WORLD")).toBe("Hello world");
  });
  it("keeps lowercase readings, digits and EDEX as they are", () => {
    expect(displayCase("cat")).toBe("cat");
    expect(displayCase("2026")).toBe("2026");
    expect(displayCase("EDEX")).toBe("EDEX");
    expect(displayCase("")).toBe("");
  });
  it("formats the alternatives too", () => {
    expect(inDisplayCase(reading("HI", ["HE"]))).toEqual(reading("Hi", ["He"]));
  });
});
