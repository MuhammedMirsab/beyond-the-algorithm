import { describe, expect, it } from "bun:test";
import type { PlayEvent } from "../events";
import { freeReport, gradeFor, practiceReport, type JudgedTarget } from "./scoring";

const target = (key: string, verdict: JudgedTarget["verdict"], offsetMs?: number, beat = 0): JudgedTarget => ({ beat, time: beat, key, verdict, offsetMs });

const base = {
  lessonId: "x",
  title: "X",
  level: "beginner" as const,
  extras: 0,
  wrongPairs: new Map<string, number>(),
  duration: 8,
  events: 4,
  labelOf: (k: string) => k,
  bpm: 80,
  sensitivity: 55,
};

describe("practiceReport", () => {
  it("scores a perfect run 100", () => {
    const judged = [0, 1, 2, 3].map((b) => target("snare", "perfect", 0, b));
    const r = practiceReport({ ...base, judged });
    expect(r.overall).toBe(100);
    expect(r.correct).toBe(4);
    expect(r.missed).toBe(0);
    expect(r.noteAccuracy).toBe(100);
    expect(r.grade).toBe("A");
  });

  it("counts only what happened", () => {
    const judged = [target("snare", "perfect", 10), target("snare", "early", -80), target("kick", "late", 90), target("kick", "miss")];
    const r = practiceReport({ ...base, judged, events: 3 });
    expect(r.targets).toBe(4);
    expect(r.correct).toBe(3);
    expect(r.perfect).toBe(1);
    expect(r.early).toBe(1);
    expect(r.late).toBe(1);
    expect(r.missed).toBe(1);
    expect(r.offsets).toEqual([10, -80, 90]);
    expect(r.meanOffsetMs).toBe(7);
    expect(r.perKey.find((k) => k.key === "kick")).toEqual({ key: "kick", label: "kick", total: 2, hit: 1, missed: 1 });
  });

  it("has no timing numbers when nothing was hit", () => {
    const r = practiceReport({ ...base, judged: [target("snare", "miss"), target("snare", "miss")], events: 0 });
    expect(r.meanOffsetMs).toBeNull();
    expect(r.timingAccuracy).toBeNull();
    expect(r.rhythmConsistency).toBeNull();
    expect(r.overall).toBe(0);
  });

  it("takes points off for extra and wrong hits", () => {
    const judged = [0, 1, 2, 3].map((b) => target("snare", "perfect", 0, b));
    const clean = practiceReport({ ...base, judged }).overall ?? 0;
    const messy = practiceReport({ ...base, judged, extras: 2, wrongPairs: new Map([["snare→kick", 1]]) }).overall ?? 0;
    expect(messy).toBeLessThan(clean);
  });

  it("says when the visitor was late, in their own milliseconds", () => {
    const judged = [0, 1, 2, 3].map((b) => target("snare", "late", 80, b));
    const r = practiceReport({ ...base, judged });
    expect(r.recommendations[0]).toContain("80 ms late");
  });

  it("names the piece that was missed most", () => {
    const judged = [target("kick", "miss"), target("kick", "miss"), target("kick", "perfect", 0), target("snare", "perfect", 0), target("snare", "perfect", 5)];
    const r = practiceReport({ ...base, judged });
    expect(r.recommendations.some((t) => t.includes("kick (2 of 3)"))).toBe(true);
  });
});

describe("practiceReport advice", () => {
  it("doesn't blame a position in any-pad lessons, and says when nothing sounded", () => {
    const judged = [0, 1, 2, 3].map((b) => target("*", "miss", undefined, b));
    const r = practiceReport({ ...base, judged, events: 0 });
    expect(r.recommendations.some((t) => t.includes("Any pad"))).toBe(false);
    expect(r.recommendations.some((t) => t.startsWith("Many notes didn't sound"))).toBe(true);
  });
});

describe("freeReport", () => {
  const notes = (times: number[]): PlayEvent[] => times.map((t) => ({ t, inst: "drums", kind: "hit", piece: "snare", vel: 0.8 }));

  it("asks for more notes when a beat played but the take was short", () => {
    const r = freeReport({ title: "Take", events: notes([0, 0.5]), duration: 1, bpm: 120, gridDefined: true, latencyMs: 0 });
    expect(r.timingAccuracy).toBeNull();
    expect(r.notes[0]).toContain("at least 4 notes");
  });

  it("calls timing not applicable without a beat", () => {
    const r = freeReport({ title: "Take", events: notes([0, 0.5, 1, 1.5]), duration: 2, gridDefined: false, latencyMs: 70 });
    expect(r.timingAccuracy).toBeNull();
    expect(r.overall).toBeNull();
    expect(r.grade).toBeNull();
    expect(r.notes).toHaveLength(1);
  });

  it("scores timing against eighth notes when a beat played", () => {
    // 120 beats a minute: eighths every 0.25 s. Every hit 70 ms late, as the camera delays it.
    const r = freeReport({ title: "Take", events: notes([0.07, 0.57, 1.07, 1.57]), duration: 2, bpm: 120, gridDefined: true, latencyMs: 70 });
    expect(Math.abs(r.meanOffsetMs ?? 99)).toBe(0);
    expect(r.timingAccuracy).toBe(100);
  });

  it("needs at least four notes to score timing", () => {
    const r = freeReport({ title: "Take", events: notes([0, 0.5]), duration: 2, bpm: 120, gridDefined: true, latencyMs: 0 });
    expect(r.timingAccuracy).toBeNull();
  });

  it("spots accidental double hits", () => {
    const r = freeReport({ title: "Take", events: notes([0, 0.05, 1, 2]), duration: 3, gridDefined: false, latencyMs: 0 });
    expect(r.accidental).toBe(1);
  });

  it("says when nothing was played", () => {
    const r = freeReport({ title: "Take", events: [], duration: 3, gridDefined: false, latencyMs: 0 });
    expect(r.events).toBe(0);
    expect(r.recommendations).toContain("Nothing played in this take.");
  });
});

describe("gradeFor", () => {
  it("uses the original app's bands", () => {
    expect([95, 85, 70, 55, 10].map(gradeFor)).toEqual(["A", "B", "C", "D", "E"]);
  });
});
