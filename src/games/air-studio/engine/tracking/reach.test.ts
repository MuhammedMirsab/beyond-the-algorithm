import { afterEach, describe, expect, it } from "bun:test";
import { settings } from "../settings";
import { fromReach, intersect, playArea, resetViewport, setViewport, strikeThreshold, toReach } from "./reach";

afterEach(() => {
  resetViewport();
  settings.reset();
});

describe("strikeThreshold", () => {
  it("maps sensitivity 0 to 100 onto the original app's 2.6 down to 0.55", () => {
    expect(strikeThreshold(0, 0)).toBeCloseTo(2.6);
    expect(strikeThreshold(0, 100)).toBeCloseTo(0.55);
    expect(strikeThreshold(0, 55)).toBeCloseTo(2.6 + (0.55 - 2.6) * 0.55);
  });

  it("adds an instrument's offset and clamps", () => {
    expect(strikeThreshold(10, 55)).toBeCloseTo(strikeThreshold(0, 65));
    expect(strikeThreshold(80, 55)).toBeCloseTo(0.55);
  });

  it("reads the visitor's sensitivity by default", () => {
    settings.update("tracking", { sensitivity: 80 });
    expect(strikeThreshold()).toBeCloseTo(strikeThreshold(0, 80));
  });
});

describe("playArea", () => {
  it("is the reach box when the whole camera picture is visible", () => {
    expect(playArea()).toEqual(settings.get().tracking.reach);
  });

  it("keeps instruments inside the visible part of the picture", () => {
    setViewport({ x0: 0, x1: 1, y0: 0.2, y1: 0.8 });
    const r = playArea();
    expect(r.y0).toBeCloseTo(0.2);
    expect(r.y1).toBeCloseTo(0.8);
    expect(r.x0).toBeCloseTo(settings.get().tracking.reach.x0);
  });

  it("falls back to the visible area when the reach box is mostly off screen", () => {
    const view = { x0: 0.5, x1: 1, y0: 0, y1: 1 };
    expect(playArea({ x0: 0, x1: 0.6, y0: 0, y1: 1 }, view)).toEqual(view);
  });

  it("maps to and from the play area", () => {
    setViewport({ x0: 0.1, x1: 0.9, y0: 0.1, y1: 0.9 });
    settings.update("tracking", { reach: { x0: 0, x1: 1, y0: 0, y1: 1 } });
    expect(toReach({ x: 0.5, y: 0.1 })).toEqual({ x: 0.5, y: 0 });
    const p = fromReach({ x: 1, y: 0.5 });
    expect(p.x).toBeCloseTo(0.9);
    expect(p.y).toBeCloseTo(0.5);
  });

  it("intersects boxes", () => {
    expect(intersect({ x0: 0, x1: 0.6, y0: 0.2, y1: 1 }, { x0: 0.1, x1: 1, y0: 0, y1: 0.7 })).toEqual({ x0: 0.1, x1: 0.6, y0: 0.2, y1: 0.7 });
  });
});
