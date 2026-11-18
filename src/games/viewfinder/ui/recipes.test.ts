import { describe, expect, test } from "bun:test";
import { FRAGMENT_SHADER } from "../engine/shaders";
import { LUMA, PALETTE, byte, css, dotRadius, luma, nearestColour, thermal } from "./recipes";

/** Every vec3(r, g, b) inside the shader's PALETTE array. */
function shaderPalette() {
  const block = FRAGMENT_SHADER.slice(FRAGMENT_SHADER.indexOf("const vec3 PALETTE[16]"), FRAGMENT_SHADER.indexOf(");", FRAGMENT_SHADER.indexOf("const vec3 PALETTE[16]")));
  return [...block.matchAll(/vec3\(([\d.]+), ([\d.]+), ([\d.]+)\)/g)].map(([, r, g, b]) => [Number(r), Number(g), Number(b)]);
}

describe("the How it works recipes match the shader", () => {
  test("brightness weights", () => {
    expect(FRAGMENT_SHADER).toContain(`vec3(${LUMA.join(", ")})`);
    expect(luma([1, 1, 1])).toBeCloseTo(1);
    expect(luma([0, 1, 0])).toBeCloseTo(0.7152);
  });

  test("pixel art's 16 colours", () => {
    expect(shaderPalette()).toEqual(PALETTE.map((c) => [...c]));
  });

  test("each recipe does what How it works says", () => {
    // Dots: brighter pixel, bigger dot.
    expect(dotRadius([1, 1, 1])).toBeGreaterThan(dotRadius([0.3, 0.3, 0.3]));
    // Thermal: white is hot (near white), black is cold (near black).
    expect(luma(thermal([1, 1, 1]))).toBeGreaterThan(0.9);
    expect(luma(thermal([0, 0, 0]))).toBeLessThan(0.05);
    // Pixel art: always one of the 16.
    expect(PALETTE).toContain(nearestColour([0.4, 0.7, 0.2]));
  });

  test("formatting", () => {
    expect(byte(0.5)).toBe(128);
    expect(css([1, 0.5, 0])).toBe("rgb(255 128 0)");
  });
});
