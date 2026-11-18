import { describe, expect, test } from "bun:test";
import { formatDistance, gpsGuess, guessesUntil, pointOnPath, positionAt, scaleFromAccuracy, sourceGuess, trailUntil } from "./gps";
import { batteryGuess, daySegments, drain, formatDuration, roughClock, sleepWindow } from "./battery";
import { connectionGuess, connectionLabel } from "./connection";
import { localPoint, pushTap, tapRhythm, tapSide, touchGuess, type TapPoint } from "./touch";
import { clockLabel, pushLimited, signed } from "./math";
import { CHARGING_WEEK } from "../data/battery";
import { DAY, DAY_END, DAY_START, PLACES } from "../data/places";
import { EXPERIMENTS } from "../data/experiments";
import { correctIndex, QUIZ_QUESTIONS, quizScore } from "../data/quiz";

describe("gps accuracy", () => {
  test("scales from building to city", () => {
    expect(scaleFromAccuracy(8)).toBe("building");
    expect(scaleFromAccuracy(30)).toBe("building");
    expect(scaleFromAccuracy(120)).toBe("street");
    expect(scaleFromAccuracy(900)).toBe("area");
    expect(scaleFromAccuracy(12_000)).toBe("city");
  });

  test("distances read naturally", () => {
    expect(formatDistance(0.4)).toBe("1 m");
    expect(formatDistance(12.6)).toBe("13 m");
    expect(formatDistance(1450)).toBe("1.5 km");
    expect(formatDistance(23_400)).toBe("23 km");
  });

  test("guesses the source and what it can tell", () => {
    expect(sourceGuess(6)).toBe("Satellites");
    expect(sourceGuess(60)).toBe("Nearby Wi-Fi");
    expect(sourceGuess(2000)).toBe("Phone towers");
    expect(gpsGuess(10).label).toBe("Which building you're in");
    expect(gpsGuess(5000).because).toContain("5.0 km");
  });
});

describe("simulated day", () => {
  test("the day covers every minute without gaps", () => {
    for (let i = 1; i < DAY.length; i++) expect(DAY[i].from).toBe(DAY[i - 1].to);
    expect(DAY[0].from).toBe(0);
    expect(DAY[DAY.length - 1].to).toBe(24 * 60);
  });

  test("the phone is home at 6 am, at school at 10, at sport at 6 pm", () => {
    expect(positionAt(DAY_START).place).toBe("home");
    expect(positionAt(10 * 60).place).toBe("school");
    expect(positionAt(18 * 60).place).toBe("sports");
    expect(positionAt(7 * 60 + 15).place).toBeNull();
  });

  test("travel moves along the road", () => {
    const start = positionAt(7 * 60).point;
    const middle = positionAt(7 * 60 + 15).point;
    expect(start).toEqual(PLACES.home.at);
    expect(middle).not.toEqual(PLACES.home.at);
    expect(middle).not.toEqual(PLACES.school.at);
  });

  test("points along a path", () => {
    const path = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }];
    expect(pointOnPath(path, 0)).toEqual({ x: 0, y: 0 });
    expect(pointOnPath(path, 0.5)).toEqual({ x: 10, y: 0 });
    expect(pointOnPath(path, 0.75)).toEqual({ x: 10, y: 5 });
    expect(pointOnPath(path, 1)).toEqual({ x: 10, y: 10 });
  });

  test("guesses unlock as the day goes on", () => {
    expect(guessesUntil(DAY_START).map((g) => g.place)).toEqual(["home"]);
    expect(guessesUntil(10 * 60).map((g) => g.place)).toEqual(["home", "school"]);
    expect(guessesUntil(DAY_END).map((g) => g.place)).toEqual(["home", "school", "sports"]);
  });

  test("the trail starts at home", () => {
    const trail = trailUntil(8 * 60);
    expect(trail[0]).toEqual(PLACES.home.at);
    expect(trail.length).toBe(25);
  });
});

describe("battery drain", () => {
  test("drains by the activity amount", () => {
    expect(drain(100, 25)).toBe(75);
    expect(drain(75, 18)).toBe(57);
  });

  test("never drops below 5%", () => {
    expect(drain(12, 25)).toBe(5);
    expect(drain(5, 5)).toBe(5);
  });

  test("durations", () => {
    expect(formatDuration(Infinity)).toBeNull();
    expect(formatDuration(0)).toBeNull();
    expect(formatDuration(45 * 60)).toBe("45 min");
    expect(formatDuration(2 * 3600 + 5 * 60)).toBe("2 h 05 min");
  });

  test("guesses from level and charging", () => {
    expect(batteryGuess(40, true).label).toContain("Plugged in");
    expect(batteryGuess(12, false).label).toBe("Out for a long time");
    expect(batteryGuess(64, false).because).toContain("64%");
  });

  test("the charging week gives away bedtime and wake-up", () => {
    const sleep = sleepWindow(CHARGING_WEEK);
    expect(sleep).not.toBeNull();
    if (!sleep) return;
    expect(roughClock(sleep.bedtime)).toBe("11:15 pm");
    expect(roughClock(sleep.wake)).toBe("7:15 am");
  });

  test("afternoon top-ups are ignored", () => {
    expect(sleepWindow([{ day: "Mon", sessions: [{ start: 15 * 60, end: 16 * 60 }] }])).toBeNull();
  });

  test("overnight charges are split at midnight across two rows", () => {
    const week = [
      { day: "Mon", sessions: [{ start: 23 * 60, end: 6 * 60 }] },
      { day: "Tue", sessions: [{ start: 15 * 60, end: 16 * 60 }] },
    ];
    // Monday: Tuesday's row wraps round to Monday, which had no session ending after midnight before it.
    expect(daySegments(week, 0)).toEqual([{ from: 23 * 60, to: 24 * 60 }]);
    // Tuesday: the morning end of Monday night, then its own afternoon top-up.
    expect(daySegments(week, 1)).toEqual([
      { from: 0, to: 6 * 60 },
      { from: 15 * 60, to: 16 * 60 },
    ]);
  });

  test("every bar in the sample week stays inside its day", () => {
    CHARGING_WEEK.forEach((_, i) => {
      for (const s of daySegments(CHARGING_WEEK, i)) {
        expect(s.from).toBeGreaterThanOrEqual(0);
        expect(s.to).toBeLessThanOrEqual(24 * 60);
        expect(s.to).toBeGreaterThan(s.from);
      }
    });
  });
});

describe("connection", () => {
  test("labels and guesses", () => {
    expect(connectionLabel("wifi")).toBe("Wi-Fi");
    expect(connectionLabel(undefined)).toBeNull();
    expect(connectionGuess({ type: "wifi" }, true).label).toContain("Wi-Fi");
    expect(connectionGuess({ type: "cellular" }, true).label).toBe("Probably out");
    expect(connectionGuess({}, false).label).toBe("Offline");
    expect(connectionGuess({ effectiveType: "4g", rtt: 50 }, true).label).toContain("steady");
  });
});

describe("touch", () => {
  const rect = { left: 100, top: 50, width: 300, height: 600 };
  const taps = (xs: number[]): TapPoint[] => xs.map((x, i) => ({ id: i, x, y: 100, t: i * 250 }));

  test("page coordinates become glass coordinates", () => {
    expect(localPoint(250, 350, rect)).toEqual({ x: 150, y: 300, inside: true });
    expect(localPoint(90, 350, rect).inside).toBe(false);
    expect(localPoint(250, 350, rect, 0.5)).toEqual({ x: 300, y: 600, inside: true });
  });

  test("keeps the last 8 taps", () => {
    let list: TapPoint[] = [];
    for (let i = 0; i < 12; i++) list = pushTap(list, { id: i, x: i, y: i, t: i });
    expect(list.length).toBe(8);
    expect(list[0].id).toBe(4);
    expect(list[7].id).toBe(11);
  });

  test("rhythm averages the latest burst only", () => {
    const list: TapPoint[] = [
      { id: 0, x: 0, y: 0, t: 0 },
      { id: 1, x: 0, y: 0, t: 5000 },
      { id: 2, x: 0, y: 0, t: 5300 },
      { id: 3, x: 0, y: 0, t: 5500 },
    ];
    expect(tapRhythm(list)).toBe(250);
    expect(tapRhythm(list.slice(0, 1))).toBeNull();
  });

  test("side of the screen", () => {
    expect(tapSide(taps([250, 260, 240]), 300)).toBe("right");
    expect(tapSide(taps([30, 60, 40]), 300)).toBe("left");
    expect(tapSide(taps([150, 140, 160]), 300)).toBe("middle");
    expect(tapSide(taps([250]), 300)).toBeNull();
    expect(touchGuess(taps([250, 260, 240]), 300, 1).label).toContain("right thumb");
    expect(touchGuess([], 300, 3).label).toBe("3 fingers at once");
  });
});

describe("helpers and data", () => {
  test("clock labels", () => {
    expect(clockLabel(0)).toBe("12:00 am");
    expect(clockLabel(7 * 60 + 30)).toBe("7:30 am");
    expect(clockLabel(12 * 60)).toBe("12:00 pm");
    expect(clockLabel(23 * 60 + 15)).toBe("11:15 pm");
    expect(clockLabel(25 * 60)).toBe("1:00 am");
  });

  test("signed numbers use a real minus sign", () => {
    expect(signed(-12.4)).toBe("−12");
    expect(signed(8)).toBe("8");
  });

  test("limited history", () => {
    expect(pushLimited([1, 2, 3], 4, 3)).toEqual([2, 3, 4]);
    expect(pushLimited([], 1, 3)).toEqual([1]);
  });

  test("eight experiments, the ones you can see and feel first, each with 2 or 3 inferences", () => {
    expect(EXPERIMENTS.map((e) => e.id)).toEqual(["motion", "camera", "microphone", "touch", "gps", "light", "battery", "connection"]);
    for (const e of EXPERIMENTS) {
      expect(e.inferences.length).toBeGreaterThanOrEqual(2);
      expect(e.inferences.length).toBeLessThanOrEqual(3);
    }
  });

  test("quiz has one right answer each, not always first", () => {
    expect(QUIZ_QUESTIONS.length).toBe(5);
    for (const q of QUIZ_QUESTIONS) expect(q.options.filter((o) => o.correct).length).toBe(1);
    expect(new Set(QUIZ_QUESTIONS.map(correctIndex)).size).toBeGreaterThan(1);
    const perfect = QUIZ_QUESTIONS.map(correctIndex);
    expect(quizScore(perfect)).toBe(5);
    expect(quizScore([null, null, null, null, null])).toBe(0);
  });

  test("copy has no exclamation marks, dashes, emoji or words in capitals", () => {
    const text = JSON.stringify([EXPERIMENTS, QUIZ_QUESTIONS]);
    expect(text).not.toMatch(/[!–—]/);
    expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
    // Acronyms that are names (GPS, MEMS, IISJ) are fine; shouted words are not.
    const shouted = (text.match(/[A-Z]{2,}/g) ?? []).filter((w) => !["GPS", "MEMS", "IISJ"].includes(w));
    expect(shouted).toEqual([]);
  });

  test("every experiment explains how it works in three steps", () => {
    for (const e of EXPERIMENTS) {
      expect(e.how.measures.length).toBeGreaterThan(20);
      expect(e.how.numbers.length).toBeGreaterThan(20);
      expect(e.how.infers.length).toBeGreaterThan(20);
    }
  });
});
