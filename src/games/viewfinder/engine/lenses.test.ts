import { describe, expect, test } from "bun:test";
import { LENSES, LENS_COUNT, lensKey, wrapLens } from "./lenses";
import { FRAGMENT_SHADER } from "./shaders";

/** Hue in degrees of a #rrggbb colour. */
function hue(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return null;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

describe("lenses", () => {
  test("ten lenses, unique ids", () => {
    expect(LENS_COUNT).toBe(10);
    expect(new Set(LENSES.map((l) => l.id)).size).toBe(10);
  });

  test("array index matches the shader's switch (index = lens id)", () => {
    const cases = [...FRAGMENT_SHADER.matchAll(/case (\d+): return lens(\w+)\(p\);/g)].map(
      ([, index, fn]) => [Number(index), fn.toLowerCase()] as const,
    );
    expect(cases).toHaveLength(LENS_COUNT);
    // Shader functions are named after the ids: case 7 → lensPixel ↔ "pixel".
    for (const [index, fn] of cases) expect<string>(LENSES[index].id).toBe(fn);
  });

  test("keys 1 to 9, then 0 for the tenth", () => {
    expect(LENSES.map((_, i) => lensKey(i)).join("")).toBe("1234567890");
  });

  test("wrapping in both directions", () => {
    expect(wrapLens(-1)).toBe(9);
    expect(wrapLens(10)).toBe(0);
    expect(wrapLens(23)).toBe(3);
  });

  test("no purple accents (DESIGN.md: no purple anywhere)", () => {
    for (const lens of LENSES) {
      const h = hue(lens.accent);
      if (h === null) continue;
      expect(h < 265 || h > 320).toBe(true);
    }
  });

  test("copy follows the writing rules", () => {
    for (const lens of LENSES) {
      for (const text of [lens.name, lens.blurb]) {
        expect(text).not.toMatch(/[—–!]/);
      }
      // Sentence case: only the first letter (or an acronym) is a capital.
      expect(lens.name.slice(1)).toBe(lens.name === "ASCII" ? "SCII" : lens.name.slice(1).toLowerCase());
    }
  });
});
