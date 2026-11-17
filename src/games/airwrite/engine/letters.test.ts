import { describe, expect, it } from "bun:test";
import { CLOUD_SIZE, firstLetterClouds, sampleClouds, segmentLetters } from "./letters";
import type { StrokeXY } from "./recognition/pdollar";
import { recognizeStrokes } from "./recognition/recognize";

/** "HI" drawn with the mouse: straight two-point strokes, in surface pixels. */
const HI: StrokeXY[] = [
  [[300, 150], [300, 320]],
  [[390, 150], [390, 320]],
  [[300, 236], [390, 236]],
  [[470, 150], [470, 320]],
];

/** A picture frame like exportInk() makes for those strokes (origin 260,110; 1:1 scale). */
const FRAME = { width: 250, height: 250, originX: 260, originY: 110, scale: 1, inkSize: 10 };

describe("segmentLetters", () => {
  it("boxes each letter the recogniser found, labelled with what it read", () => {
    const text = recognizeStrokes(HI).text;
    expect(text).toBe("HI");
    const { boxes, words } = segmentLetters(HI, text, FRAME);
    expect(words).toBe(1);
    expect(boxes.map((b) => b.char)).toEqual(["H", "I"]);
    for (const b of boxes) {
      expect(b.left).toBeGreaterThanOrEqual(0);
      expect(b.top).toBeGreaterThanOrEqual(0);
      expect(b.left + b.width).toBeLessThanOrEqual(100);
      expect(b.top + b.height).toBeLessThanOrEqual(100);
    }
    // H spans 300-390 px, I sits at 470 px: the H box is left of the I box and wider.
    expect(boxes[0].left).toBeLessThan(boxes[1].left);
    expect(boxes[0].width).toBeGreaterThan(boxes[1].width);
  });

  it("leaves boxes unlabelled when the reading doesn't line up letter for letter", () => {
    expect(segmentLetters(HI, "HELLO", FRAME).boxes.every((b) => b.char === null)).toBe(true);
    expect(segmentLetters(HI, null, FRAME).boxes).toHaveLength(2);
  });
});

describe("firstLetterClouds", () => {
  it("returns the first letter and its closest library shape as point clouds", () => {
    const clouds = firstLetterClouds(HI, "HI");
    expect(clouds?.char).toBe("H");
    expect(clouds?.yours).toHaveLength(CLOUD_SIZE);
    expect(clouds?.library).toHaveLength(CLOUD_SIZE);
  });

  it("has a sample for before anything is written", () => {
    expect(sampleClouds().yours).toHaveLength(CLOUD_SIZE);
  });
});
