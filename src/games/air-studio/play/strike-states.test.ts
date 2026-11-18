import { describe, expect, it } from "bun:test";
import { REARM_FRACTION, StrikeDetector } from "../engine/tracking/gestures";
import type { Hand } from "../engine/tracking/hands";
import { REF_SIZE } from "../engine/tracking/hands";
import { crossings, exampleSpeeds, strikeSegments } from "./strike-states";

const THR = 12.3;
const REARM = THR * REARM_FRACTION;

/** A settled hand moving down at `v` hand lengths per second. */
function hand(v: number): Hand {
  const vel = { x: 0, y: v * REF_SIZE };
  return {
    label: "Right",
    present: true,
    lm: [],
    palm: { x: 0.5, y: 0.5 },
    tip: { x: 0.5, y: 0.4 },
    vel,
    tipVel: vel,
    speed: vel.y,
    size: REF_SIZE,
    extended: 4,
    fist: false,
    open: true,
    pinch: false,
    score: 1,
    lastSeen: 0,
    fresh: false,
  };
}

describe("strike states for the reveal", () => {
  it("fires where the real strike detector fires", () => {
    const samples = exampleSpeeds(THR);
    const det = new StrikeDetector();
    const real = samples.filter((s) => det.update(hand(s.v), s.t, THR * REF_SIZE)).map((s) => s.t);
    expect(real.length).toBe(2);
    expect(crossings(samples, THR).map((s) => s.t)).toEqual(real);
  });

  it("waits after each hit until the hand slows below the re-arm speed", () => {
    const samples = exampleSpeeds(THR);
    const hits = crossings(samples, THR);
    const segs = strikeSegments(samples, hits, REARM);
    expect(segs.map((s) => s.state)).toEqual(["ready", "waiting", "ready", "waiting", "ready"]);
    // Every waiting stretch starts at a hit and ends on a sample below the re-arm line.
    for (const seg of segs.filter((s) => s.state === "waiting")) {
      expect(hits.some((h) => h.t === seg.from)).toBe(true);
      const end = samples.find((s) => s.t === seg.to);
      expect(end && end.v < REARM).toBe(true);
    }
  });

  it("a resting hand never crosses the hit line", () => {
    const rest = exampleSpeeds(THR).filter((s) => s.t < 600);
    expect(crossings(rest, THR)).toHaveLength(0);
    expect(Math.max(...rest.map((s) => s.v))).toBeLessThan(REARM);
  });
});
