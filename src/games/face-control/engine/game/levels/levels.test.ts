import { describe, expect, test } from "bun:test";
import { keyboardSign, LEVELS, PRACTICE } from "./index";

describe("keyboardSign", () => {
  const signs = [PRACTICE, ...LEVELS].flatMap((level) => level.signs ?? []);

  test("keyboard players never see a face instruction", () => {
    for (const sign of signs) {
      const shown = keyboardSign(sign);
      expect(shown.icon).not.toBe("tilt");
      expect(shown.icon).not.toBe("mouth");
      expect([shown.x, shown.y]).toEqual([sign.x, sign.y]);
    }
  });

  test("the face controls become their keys; every other sign stays as it is", () => {
    expect(keyboardSign({ x: 0, y: 0, icon: "tilt", text: "Tilt to roll" })).toEqual({ x: 0, y: 0, icon: "arrows", text: "Arrow keys to roll" });
    expect(keyboardSign({ x: 0, y: 0, icon: "mouth", text: "Open your mouth to jump" })).toEqual({ x: 0, y: 0, icon: "space", text: "Space to jump" });
    for (const sign of signs.filter((s) => s.icon !== "tilt" && s.icon !== "mouth")) expect(keyboardSign(sign)).toBe(sign);
  });
});

describe("sign copy", () => {
  const texts = [PRACTICE, ...LEVELS].flatMap((level) => (level.signs ?? []).flatMap((sign) => [sign.text, keyboardSign(sign).text]));

  test("sentence case: a capital first letter, never a whole word in capitals", () => {
    for (const text of texts) {
      expect(text[0]).toBe(text[0].toUpperCase());
      for (const word of text.split(/\s+/)) {
        if (word.length > 1) expect(word).not.toBe(word.toUpperCase());
      }
    }
  });

  test("no dashes or dots as separators", () => {
    for (const text of texts) expect(text).not.toMatch(/[·–—]/);
  });
});
