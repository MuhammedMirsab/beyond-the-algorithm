import { describe, expect, it } from "bun:test";
import { OneEuro } from "./one-euro";

const DT = 1 / 30;

describe("OneEuro", () => {
  it("passes the first sample straight through", () => {
    const f = new OneEuro();
    expect(f.filter(0.42, DT)).toBe(0.42);
  });

  it("steadies a hand held still", () => {
    const f = new OneEuro(0.5, 6);
    let out = 0;
    // ±0.004 of jitter around 0.5, as a webcam gives on a still hand.
    for (let i = 0; i < 90; i++) out = f.filter(0.5 + (i % 2 ? 0.004 : -0.004), DT);
    expect(Math.abs(out - 0.5)).toBeLessThan(0.0025);
  });

  it("follows a fast move with little lag", () => {
    const f = new OneEuro(0.5, 6);
    let out = 0;
    // 1.8 frame heights a second: a quick strike.
    for (let i = 0; i <= 15; i++) out = f.filter(i * 0.06, DT);
    expect(15 * 0.06 - out).toBeLessThan(0.06);
  });

  it("smooths more when the minimum cutoff is lower", () => {
    const noisy = (f: OneEuro) => {
      let max = 0;
      for (let i = 0; i < 90; i++) {
        const out = f.filter(0.5 + (i % 2 ? 0.01 : -0.01), DT);
        // The first samples pass through; measure once it has settled.
        if (i >= 30) max = Math.max(max, Math.abs(out - 0.5));
      }
      return max;
    };
    expect(noisy(new OneEuro(0.5, 0))).toBeLessThan(noisy(new OneEuro(4, 0)));
  });

  it("starts over after reset", () => {
    const f = new OneEuro();
    f.filter(0.1, DT);
    f.filter(0.2, DT);
    f.reset();
    expect(f.filter(0.9, DT)).toBe(0.9);
  });
});
