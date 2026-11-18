import { describe, expect, test } from "bun:test";
import { CARTOON_LENS, LENSES, LENS_COUNT, lensKey, wrapLens } from "./lenses";
import { FRAGMENT_SHADER, PREVIEW_FRAGMENT_SHADER } from "./shaders";

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
  test("eleven lenses, unique ids", () => {
    expect(LENS_COUNT).toBe(11);
    expect(new Set(LENSES.map((l) => l.id)).size).toBe(11);
  });

  test("array index matches the shader's switch (index = lens id), in both programs", () => {
    for (const shader of [FRAGMENT_SHADER, PREVIEW_FRAGMENT_SHADER]) {
      const cases = [...shader.matchAll(/case (\d+): return lens(\w+)\(p\);/g)].map(
        ([, index, fn]) => [Number(index), fn.toLowerCase()] as const,
      );
      expect(cases).toHaveLength(LENS_COUNT);
      // Shader functions are named after the ids: case 0 → lensPixel ↔ "pixel".
      for (const [index, fn] of cases) expect<string>(LENSES[index].id).toBe(fn);
    }
  });

  test("the picker starts with the vivid, cheap ones; Cartoon (face model) is third", () => {
    expect(LENSES.slice(0, 3).map((l) => l.name)).toEqual(["Pixel art", "Thermal", "Cartoon"]);
    expect(CARTOON_LENS).toBe(2);
  });

  test("keys 1 to 9, 0 for the tenth, minus for the eleventh", () => {
    expect(LENSES.map((_, i) => lensKey(i)).join("")).toBe("1234567890-");
  });

  test("wrapping in both directions", () => {
    expect(wrapLens(-1)).toBe(10);
    expect(wrapLens(11)).toBe(0);
    expect(wrapLens(23)).toBe(1);
  });

  test("no purple accents (DESIGN.md: no purple anywhere)", () => {
    for (const lens of LENSES) {
      const h = hue(lens.accent);
      if (h === null) continue;
      expect(h < 265 || h > 320).toBe(true);
    }
  });

  test("names are plain words in sentence case; recipes follow the writing rules", () => {
    for (const lens of LENSES) {
      expect(lens.name.slice(1)).toBe(lens.name.slice(1).toLowerCase());
      for (const text of [lens.name, lens.recipe]) {
        expect(text).not.toMatch(/[—–!]/);
        expect(text).not.toMatch(/\b[A-Z]{2,}\b/);
      }
    }
    // Honest about what a filter can't do.
    expect(LENSES.find((l) => l.id === "thermal")?.recipe).toContain("can't feel heat");
    expect(LENSES.find((l) => l.id === "xray")?.recipe).toContain("can't see through you");
  });
});
