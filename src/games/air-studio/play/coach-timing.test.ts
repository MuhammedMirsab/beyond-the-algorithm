import { describe, expect, it } from "bun:test";
import type { CoachLine } from "./coach";
import { ANNOUNCE_MS, coachStart, MIN_SHOW_MS, stepCoach, WARN_HOLD_MS, type CoachMoment, type CoachTiming } from "./coach-timing";

const tip = (id: string): CoachLine => ({ id, text: id, tone: "tip", icon: "play" });
const warn = (id: string): CoachLine => ({ id, text: id, tone: "warn", icon: "hands" });

/** Runs the coach every 200 ms from `from` to `to`, with the same moment. */
function run(t: CoachTiming, from: number, to: number, m: CoachMoment) {
  let s = t;
  for (let now = from; now <= to; now += 200) s = stepCoach(s, now, m);
  return s;
}

const moment = (patch: Partial<CoachMoment>): CoachMoment => ({ reveal: 0, active: true, camera: null, lesson: tip("drums-0"), ...patch });

describe("coach timing", () => {
  it("shows the first line at once", () => {
    const s = stepCoach(coachStart(0), 0, moment({}));
    expect(s.shown?.id).toBe("drums-0");
  });

  it("keeps a tip up long enough to read before the next one", () => {
    let s = run(coachStart(0), 0, 0, moment({}));
    s = run(s, 200, MIN_SHOW_MS - 200, moment({ lesson: tip("drums-1") }));
    expect(s.shown?.id).toBe("drums-0");
    s = run(s, MIN_SHOW_MS, MIN_SHOW_MS, moment({ lesson: tip("drums-1") }));
    expect(s.shown?.id).toBe("drums-1");
  });

  it("mentions a camera problem only once it has lasted a moment, then clears it at once", () => {
    let s = run(coachStart(0), 0, 5000, moment({}));
    s = run(s, 5200, 5200 + WARN_HOLD_MS - 200, moment({ camera: warn("no-hands") }));
    expect(s.shown?.id).toBe("drums-0");
    s = run(s, 5200 + WARN_HOLD_MS, 5200 + WARN_HOLD_MS, moment({ camera: warn("no-hands") }));
    expect(s.shown?.id).toBe("no-hands");
    // Hands back: straight back to the tip, no waiting.
    s = stepCoach(s, 6200, moment({}));
    expect(s.shown?.id).toBe("drums-0");
  });

  it("points to a newly revealed part once, for its full time, even right after another line", () => {
    let s = run(coachStart(0), 0, 4000, moment({}));
    // A new tip at 4 s, then the dock grows at 5 s, while that tip still has time to run.
    s = run(s, 4200, 4800, moment({ lesson: tip("drums-1") }));
    expect(s.shown?.id).toBe("drums-1");
    s = run(s, 5000, 5000 + MIN_SHOW_MS, moment({ reveal: 1, lesson: tip("drums-1") }));
    expect(s.shown?.id).toBe("reveal-1");
    const shownAt = s.shownAt;
    s = run(s, 5000 + MIN_SHOW_MS + 200, shownAt + ANNOUNCE_MS - 200, moment({ reveal: 1, lesson: tip("drums-1") }));
    expect(s.shown?.id).toBe("reveal-1");
    s = run(s, shownAt + ANNOUNCE_MS, shownAt + ANNOUNCE_MS + 200, moment({ reveal: 1, lesson: tip("drums-1") }));
    expect(s.shown?.id).toBe("drums-1");
    // Once only.
    s = run(s, shownAt + ANNOUNCE_MS + 400, shownAt + 20_000, moment({ reveal: 1, lesson: tip("drums-1") }));
    expect(s.shown?.id).toBe("drums-1");
  });

  it("says nothing while it is off screen (a lesson, measuring)", () => {
    const s = run(coachStart(0), 0, 1000, moment({ active: false }));
    expect(s.shown).toBeNull();
  });
});
