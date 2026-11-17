import { describe, expect, test } from "bun:test";
import { formatDegrees, formatRatio, formatTime } from "./format";

describe("formatTime", () => {
  test("formats minutes, seconds and tenths", () => {
    expect(formatTime(0)).toBe("0:00.0");
    expect(formatTime(4.04)).toBe("0:04.0");
    expect(formatTime(23.46)).toBe("0:23.5");
    expect(formatTime(61.25)).toBe("1:01.3");
    expect(formatTime(600)).toBe("10:00.0");
  });

  test("never prints 60 seconds (the original printed 0:60.0 for 59.95 to 59.99)", () => {
    for (const s of [59.95, 59.96, 59.97, 59.98, 59.99]) expect(formatTime(s)).toBe("1:00.0");
    expect(formatTime(59.94)).toBe("0:59.9");
    expect(formatTime(119.97)).toBe("2:00.0");
  });

  test("clamps nonsense to zero", () => {
    expect(formatTime(-3)).toBe("0:00.0");
    expect(formatTime(Number.NaN)).toBe("0:00.0");
  });
});

describe("readout formats", () => {
  test("degrees are whole and unsigned", () => {
    expect(formatDegrees(14.6)).toBe("15°");
    expect(formatDegrees(-11.2)).toBe("11°");
  });

  test("ratios have two decimals", () => {
    expect(formatRatio(0.4149)).toBe("0.41");
    expect(formatRatio(0.03)).toBe("0.03");
  });
});
