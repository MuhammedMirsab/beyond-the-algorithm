import { describe, expect, test } from "bun:test";
import { parseWholeNumber } from "./ranges";

describe("parseWholeNumber", () => {
  test("reads whole numbers in range", () => {
    expect(parseWholeNumber("5", 100)).toBe(5);
    expect(parseWholeNumber("1", 10)).toBe(1);
    expect(parseWholeNumber("1000", 1000)).toBe(1000);
    expect(parseWholeNumber(" 42 ", 100)).toBe(42);
    expect(parseWholeNumber("007", 100)).toBe(7);
  });

  test("rejects anything that isn't digits instead of turning it into another number", () => {
    expect(parseWholeNumber("-5", 100)).toBeNull();
    expect(parseWholeNumber("1.5", 100)).toBeNull();
    expect(parseWholeNumber("5e1", 100)).toBeNull();
    expect(parseWholeNumber("5a", 100)).toBeNull();
    expect(parseWholeNumber("+5", 100)).toBeNull();
    expect(parseWholeNumber("1,000", 1000)).toBeNull();
    expect(parseWholeNumber("", 100)).toBeNull();
    expect(parseWholeNumber("  ", 100)).toBeNull();
  });

  test("rejects numbers outside 1 to max", () => {
    expect(parseWholeNumber("0", 100)).toBeNull();
    expect(parseWholeNumber("101", 100)).toBeNull();
    expect(parseWholeNumber("12345", 1000)).toBeNull();
  });
});
