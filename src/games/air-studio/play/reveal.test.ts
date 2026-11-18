import { describe, expect, it } from "bun:test";
import { nextReveal, REVEAL_GAP_S, REVEAL_STEPS, type Reveal } from "./reveal";

const at = (current: Reveal, events: number, seconds = 0, sinceLast = 99, hasTake = false) => nextReveal(current, { events, seconds, hasTake, sinceLast });

describe("progressive disclosure", () => {
  it("starts with the instrument alone, and shows the switcher after a few hits", () => {
    expect(at(0, 0)).toBe(0);
    expect(at(0, REVEAL_STEPS[0].events - 1)).toBe(0);
    expect(at(0, REVEAL_STEPS[0].events)).toBe(1);
  });

  it("brings play along and record, then practice, as the visitor keeps playing", () => {
    expect(at(1, REVEAL_STEPS[1].events - 1)).toBe(1);
    expect(at(1, REVEAL_STEPS[1].events)).toBe(2);
    expect(at(2, REVEAL_STEPS[2].events)).toBe(3);
    expect(at(3, 0)).toBe(3);
  });

  it("never shows two steps at once", () => {
    // Plenty of notes already: still one step per call, and a pause between steps.
    expect(at(0, 100)).toBe(1);
    expect(at(1, 100, 0, REVEAL_GAP_S - 0.1)).toBe(1);
    expect(at(1, 100, 0, REVEAL_GAP_S)).toBe(2);
  });

  it("helps someone still finding their way, after enough seconds of live play", () => {
    expect(at(0, 0, REVEAL_STEPS[0].seconds)).toBe(1);
    expect(at(1, 0, REVEAL_STEPS[1].seconds)).toBe(2);
  });

  it("offers practice as soon as a take is recorded", () => {
    expect(at(2, 0, 0, 99, true)).toBe(3);
    // A take can't skip the steps before it.
    expect(at(1, 0, 0, 99, true)).toBe(1);
  });
});
