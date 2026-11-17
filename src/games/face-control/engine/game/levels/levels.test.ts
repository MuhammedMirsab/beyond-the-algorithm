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
    expect(keyboardSign({ x: 0, y: 0, icon: "tilt", text: "TILT TO ROLL" })).toEqual({ x: 0, y: 0, icon: "arrows", text: "ARROWS TO ROLL" });
    expect(keyboardSign({ x: 0, y: 0, icon: "mouth", text: "OPEN MOUTH · JUMP" })).toEqual({ x: 0, y: 0, icon: "space", text: "SPACE · JUMP" });
    for (const sign of signs.filter((s) => s.icon !== "tilt" && s.icon !== "mouth")) expect(keyboardSign(sign)).toBe(sign);
  });
});
