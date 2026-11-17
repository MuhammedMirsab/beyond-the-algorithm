import { describe, expect, test } from "bun:test";
import { classTraits } from "./traits";

describe("classTraits", () => {
  test("waving and clapping are recorded as movement", () => {
    for (const name of ["Wave", "waving", "WAVE HELLO"]) {
      expect(classTraits(name)).toMatchObject({ moving: true, motion: "wave" });
    }
    for (const name of ["Clap", "Clapping"]) {
      expect(classTraits(name)).toMatchObject({ moving: true, motion: "clap", needsBody: true });
    }
    expect(classTraits("Walk")).toMatchObject({ moving: true, motion: "walk", needsBody: true });
    expect(classTraits("Jump")).toMatchObject({ moving: true, motion: null });
    expect(classTraits("Dancing")).toMatchObject({ moving: true, motion: null });
  });

  test("hand shapes need a hand in view", () => {
    for (const name of ["Open hand", "Fist", "Thumbs up", "Pointing", "Palm", "Hand"]) {
      expect(classTraits(name).needsHands).toBe(true);
    }
  });

  test("hands up and hands down are poses, not hand shapes", () => {
    for (const name of ["Hands up", "Hands down"]) {
      expect(classTraits(name)).toEqual({ needsBody: false, needsHands: false, moving: false, motion: null, still: false });
    }
  });

  test("standing and sitting need the body and are still postures", () => {
    expect(classTraits("Stand")).toMatchObject({ needsBody: true, still: true, moving: false });
    expect(classTraits("Sitting")).toMatchObject({ needsBody: true, still: true });
    expect(classTraits("Arms crossed")).toMatchObject({ needsBody: true, still: false });
  });

  test("only whole words count", () => {
    // "Position" contains "sit" and "Microwave" contains "wave", but neither starts a word with it.
    expect(classTraits("Position")).toMatchObject({ needsBody: false, still: false });
    expect(classTraits("Crowd")).toMatchObject({ needsBody: false });
    expect(classTraits("Microwave")).toMatchObject({ moving: false, motion: null });
  });

  test("ignores case and padding", () => {
    expect(classTraits("  wAvE  ")).toEqual(classTraits("Wave"));
  });

  test("an ordinary name has no special needs", () => {
    expect(classTraits("Superhero")).toEqual({ needsBody: false, needsHands: false, moving: false, motion: null, still: false });
  });
});
