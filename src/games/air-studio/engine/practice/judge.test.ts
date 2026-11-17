import { describe, expect, it } from "bun:test";
import type { PlayEvent } from "../events";
import { LessonJudge } from "./judge";
import type { Lesson } from "./lessons";

const BEAT = 0.5; // 120 beats a minute
const ZERO = 10; // context time of beat 0

const lesson = (patch: Partial<Lesson> = {}): Lesson => ({
  id: "test",
  inst: "drums",
  title: "Test",
  level: "Beginner",
  desc: "",
  tip: "",
  bpm: 120,
  sig: "4/4",
  targets: [
    { beat: 0, key: "snare" },
    { beat: 1, key: "kick" },
    { beat: 2, key: "snare" },
  ],
  ...patch,
});

const hit = (piece: string, t: number): PlayEvent => ({ t, inst: "drums", kind: "hit", piece, vel: 0.8 });
const label = (k: string) => k;

describe("LessonJudge", () => {
  it("judges on time, early and late against the beginner window", () => {
    const j = new LessonJudge(lesson(), "beginner", ZERO, BEAT, 0, label);
    expect(j.onEvent(hit("snare", ZERO + 0.03)).verdict).toBe("perfect");
    const early = j.onEvent(hit("kick", ZERO + BEAT - 0.1));
    expect(early.verdict).toBe("early");
    expect(early.offsetMs).toBe(-100);
    expect(j.onEvent(hit("snare", ZERO + 2 * BEAT + 0.15)).verdict).toBe("late");
    expect(j.done).toBe(true);
    expect(j.hits).toBe(3);
  });

  it("allows for the camera's delay", () => {
    const j = new LessonJudge(lesson(), "beginner", ZERO, BEAT, 0.07, label);
    // Played 70 ms after the beat, as the camera delays every move: on time.
    expect(j.onEvent(hit("snare", ZERO + 0.07)).offsetMs).toBe(0);
  });

  it("is stricter at advanced timing", () => {
    const j = new LessonJudge(lesson(), "advanced", ZERO, BEAT, 0, label);
    expect(j.onEvent(hit("snare", ZERO + 0.05)).verdict).toBe("late");
    // Outside the 130 ms window: nothing to match, so it is an extra hit.
    expect(j.onEvent(hit("kick", ZERO + BEAT + 0.2)).verdict).toBe("extra");
  });

  it("calls the wrong piece wrong and counts the pair", () => {
    const j = new LessonJudge(lesson(), "beginner", ZERO, BEAT, 0, label);
    const f = j.onEvent(hit("kick", ZERO));
    expect(f.verdict).toBe("wrong");
    expect(f.expected).toBe("snare");
    expect(j.wrongPairs.get("snare→kick")).toBe(1);
    // The target is still open for the right piece.
    expect(j.onEvent(hit("snare", ZERO + 0.02)).verdict).toBe("perfect");
  });

  it("counts hits far from any target as extra", () => {
    const j = new LessonJudge(lesson(), "beginner", ZERO, BEAT, 0, label);
    expect(j.onEvent(hit("snare", ZERO - 1)).verdict).toBe("extra");
    expect(j.extras).toBe(1);
  });

  it("marks targets missed once their window has passed", () => {
    const j = new LessonJudge(lesson(), "beginner", ZERO, BEAT, 0, label);
    expect(j.tick(ZERO + 0.2)).toHaveLength(0);
    const missed = j.tick(ZERO + 0.23);
    expect(missed.map((t) => t.key)).toEqual(["snare"]);
    expect(j.targets[0].verdict).toBe("miss");
  });

  it("points at the next group of targets", () => {
    const chord = lesson({ targets: [{ beat: 0, key: "crash" }, { beat: 0, key: "kick" }, { beat: 1, key: "snare" }] });
    const j = new LessonJudge(chord, "beginner", ZERO, BEAT, 0, label);
    expect(j.next().map((t) => t.key).sort()).toEqual(["crash", "kick"]);
    j.onEvent(hit("crash", ZERO));
    expect(j.next().map((t) => t.key)).toEqual(["kick"]);
  });

  it("accepts any pad for rhythm lessons", () => {
    const j = new LessonJudge(lesson({ anyKey: true, targets: [{ beat: 0, key: "*" }] }), "beginner", ZERO, BEAT, 0, (k) => k);
    const f = j.onEvent(hit("cowbell", ZERO));
    expect(f.verdict).toBe("perfect");
    expect(f.label).toBe("cowbell");
  });

  it("accepts the root of a chord-help chord", () => {
    const piano = lesson({ inst: "piano", targets: [{ beat: 0, key: "60" }] });
    const j = new LessonJudge(piano, "beginner", ZERO, BEAT, 0, label);
    const e: PlayEvent = { t: ZERO, inst: "piano", kind: "note", midi: 60, notes: [60, 64, 67], vel: 0.8 };
    expect(j.onEvent(e).verdict).toBe("perfect");
  });

  it("ends one window after the last target", () => {
    const j = new LessonJudge(lesson(), "beginner", ZERO, BEAT, 0.07, label);
    expect(j.endTime).toBeCloseTo(ZERO + 2 * BEAT + 0.22 + 0.07);
  });
});
