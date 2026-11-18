import { describe, expect, test } from "bun:test";
import { thumbnailVideoRect } from "./preview";
import { FRAGMENT_SHADER, PREVIEW_FRAGMENT_SHADER, PREVIEW_MAX_CELLS } from "./shaders";
import { LENS_COUNT } from "./lenses";

/** The body of a GLSL function, from its signature to the closing brace at column 0. */
function fn(source: string, signature: string) {
  const start = source.indexOf(signature);
  if (start < 0) return null;
  const end = source.indexOf("\n}\n", start);
  return source.slice(start, end + 2);
}

describe("shaders", () => {
  test("both programs run the very same lens code", () => {
    for (const sig of ["vec3 lensPixel(vec2 p)", "vec3 lensCartoon(vec2 p)", "vec3 lensHalftone(vec2 p)", "vec3 lens(int id, vec2 p)"]) {
      const main = fn(FRAGMENT_SHADER, sig);
      expect(main).not.toBeNull();
      expect(fn(PREVIEW_FRAGMENT_SHADER, sig)).toBe(main);
    }
  });

  test("the compositor keeps its uniforms; the preview maps them to per-thumbnail globals", () => {
    for (const decl of [
      "uniform vec4 uVideoRect;",
      "uniform vec2 uCenter;",
      "uniform vec4 uBox;",
      "uniform vec4 uFace[4];",
      "uniform vec3 uEdges[4];",
      "uniform int uLens;",
      "uniform int uPrevLens;",
      "uniform float uMix;",
      "uniform float uActive;",
    ]) {
      expect(FRAGMENT_SHADER).toContain(decl);
    }
    for (const name of ["uVideoRect", "uCenter", "uBox", "uFace"]) {
      expect(PREVIEW_FRAGMENT_SHADER).toMatch(new RegExp(`#define ${name} g\\w+`));
      expect(PREVIEW_FRAGMENT_SHADER).not.toContain(`uniform vec4 ${name};`);
    }
    expect(PREVIEW_FRAGMENT_SHADER).toContain("vec3 col = clamp(lens(id, local), 0.0, 1.0);");
    expect(FRAGMENT_SHADER).toContain("vec3 current = lens(uLens, p);");
  });

  test("the preview has room for every lens", () => {
    expect(PREVIEW_MAX_CELLS).toBeGreaterThanOrEqual(LENS_COUNT);
    expect(PREVIEW_FRAGMENT_SHADER).toContain(`uniform vec4 uCells[${PREVIEW_MAX_CELLS}]`);
  });

  test("text drawn by the shaders never needs capitals (they draw no text at all)", () => {
    expect(FRAGMENT_SHADER).not.toMatch(/fillText|toUpperCase/);
  });
});

describe("thumbnail framing", () => {
  test("covers the square thumbnail, centred, a little closer than the main view", () => {
    const r = thumbnailVideoRect(1280, 720, 96, 96, 1.2);
    expect(r.h).toBeCloseTo(96 * 1.2);
    expect(r.w).toBeCloseTo(1280 * ((96 * 1.2) / 720));
    expect(r.x + r.w / 2).toBeCloseTo(48);
    expect(r.y + r.h / 2).toBeCloseTo(48);
    // Both sides are covered.
    expect(r.x).toBeLessThanOrEqual(0);
    expect(r.y).toBeLessThanOrEqual(0);
  });

  test("portrait cameras (phones) cover the width instead", () => {
    const r = thumbnailVideoRect(720, 1280, 88, 88, 1);
    expect(r.w).toBeCloseTo(88);
    expect(r.h).toBeGreaterThan(88);
  });
});
