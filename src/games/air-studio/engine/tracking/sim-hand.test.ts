import { describe, expect, it } from "bun:test";
import { StrikeDetector, StrumDetector } from "./gestures";
import { HandSet, type Pt } from "./hands";
import { NO_STROKE, simHandPoints, startStroke, strokeStep, type SimAnchor, type Stroke } from "./sim-hand";
import { strikeThreshold } from "./reach";

const PALM = [0, 5, 9, 13, 17];
const palmOf = (pts: Pt[]) => ({ x: PALM.reduce((a, i) => a + pts[i].x, 0) / 5, y: PALM.reduce((a, i) => a + pts[i].y, 0) / 5 });

/** Plays one click through the real pipeline at `fps`; returns the strike detector's hits and any strums. */
function click(opts: { anchor: SimAnchor; y?: number; fps?: number; sensitivity?: number }) {
  const { anchor, y = 0.5, fps = 60, sensitivity = 55 } = opts;
  const set = new HandSet();
  const strike = new StrikeDetector();
  const strum = new StrumDetector();
  const thr = strikeThreshold(0, sensitivity);
  const hits: { vel: number; at: Pt }[] = [];
  const strums: string[] = [];
  let stroke: Stroke = NO_STROKE;
  const dt = 1000 / fps;
  let t = 0;
  // Resting on the pointer for a while, then a click.
  for (let i = 0; i < 40; i++) {
    if (i === 20) stroke = startStroke(dt);
    const step = strokeStep(stroke, t, y);
    stroke = step.stroke;
    const found = step.visible ? [{ label: "Right" as const, pts: simHandPoints(0.5, step.y, false, 4 / 3, anchor), score: 1 }] : [];
    const f = set.ingest(found, t, 4 / 3, 50, false);
    if (f.Right) {
      const hit = strike.update(f.Right, t, thr);
      if (hit) hits.push(hit);
      const s = strum.update(f.Right, t, thr);
      if (s) strums.push(s.dir);
    }
    t += dt;
  }
  return { hits, strums, thr };
}

describe("simHandPoints", () => {
  it("puts the index fingertip on the pointer for keys and pitch", () => {
    const pts = simHandPoints(0.4, 0.6, false, 16 / 9, "tip");
    expect(pts).toHaveLength(21);
    expect(pts[8].x).toBeCloseTo(0.4);
    expect(pts[8].y).toBeCloseTo(0.6);
  });

  it("puts the palm on the pointer for pads and strums", () => {
    const palm = palmOf(simHandPoints(0.4, 0.6, false, 16 / 9, "palm"));
    expect(palm.x).toBeCloseTo(0.4);
    expect(palm.y).toBeCloseTo(0.6);
  });
});

describe("a click plays as a strike", () => {
  it("hits once, on the pointer, at the default sensitivity on any screen", () => {
    for (const fps of [30, 60, 144]) {
      const { hits } = click({ anchor: "palm", y: 0.5, fps });
      expect(hits).toHaveLength(1);
      // The hit lands within 4% of the screen of where the pointer is.
      expect(Math.abs(hits[0].at.y - 0.5)).toBeLessThan(0.04);
    }
  });

  it("still counts at the lowest sensitivity", () => {
    for (const fps of [60, 144]) {
      const { hits } = click({ anchor: "palm", sensitivity: 0, fps });
      expect(hits).toHaveLength(1);
      expect(Math.abs(hits[0].at.y - 0.5)).toBeLessThan(0.04);
    }
    expect(click({ anchor: "tip", sensitivity: 0 }).hits).toHaveLength(1);
  });

  it("still counts on a slow screen, landing near the pointer", () => {
    for (const fps of [20, 24]) {
      const { hits } = click({ anchor: "palm", y: 0.5, fps });
      expect(hits).toHaveLength(1);
      expect(Math.abs(hits[0].at.y - 0.5)).toBeLessThan(0.04);
    }
  });

  it("strums down only: the jump to the top of the stroke is never an up strum", () => {
    const { strums } = click({ anchor: "palm" });
    expect(strums).toEqual(["down"]);
  });
});
