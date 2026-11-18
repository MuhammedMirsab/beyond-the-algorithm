import { describe, expect, test } from "bun:test";
import {
  approachAngle,
  compassHeading,
  cssMatrix3d,
  eulerFromTilt,
  followFactor,
  headingName,
  IDENTITY,
  matrixFromQuat,
  pointingHeading,
  quatFromMatrix,
  rotationMatrix,
  roundEuler,
  slerp,
  twinMatrix,
  webkitHeading,
  wrapDegrees,
  type Mat3,
} from "./orientation";

function expectMatrix(actual: Mat3, expected: readonly number[]) {
  actual.forEach((v, i) => expect(v).toBeCloseTo(expected[i], 6));
}

/** Where a device axis ends up in earth (or view) terms: a column of the matrix. */
const column = (m: Mat3, c: number) => [m[c], m[3 + c], m[6 + c]];

describe("device orientation", () => {
  test("lying flat, top to the north, is no rotation", () => {
    expectMatrix(rotationMatrix({ alpha: 0, beta: 0, gamma: 0 }), IDENTITY);
  });

  test("beta stands the phone up: its top points at the sky", () => {
    const m = rotationMatrix({ alpha: 0, beta: 90, gamma: 0 });
    column(m, 1).forEach((v, i) => expect(v).toBeCloseTo([0, 0, 1][i], 6));
  });

  test("positive gamma dips the right side", () => {
    const m = rotationMatrix({ alpha: 0, beta: 0, gamma: 30 });
    expect(column(m, 0)[2]).toBeLessThan(0);
  });

  test("the matrix is a pure rotation", () => {
    const m = rotationMatrix({ alpha: 123, beta: -40, gamma: 17 });
    const det = m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6]);
    expect(det).toBeCloseTo(1, 6);
  });
});

describe("compass", () => {
  test("a flat phone points where its top points", () => {
    expect(compassHeading({ alpha: 0, beta: 0, gamma: 0 })).toBeCloseTo(0, 6);
    // Alpha turns anticlockwise seen from above, so 90 is west.
    expect(compassHeading({ alpha: 90, beta: 0, gamma: 0 })).toBeCloseTo(270, 6);
    expect(compassHeading({ alpha: 270, beta: 0, gamma: 0 })).toBeCloseTo(90, 6);
  });

  test("an upright phone points where its back points, like a camera", () => {
    expect(compassHeading({ alpha: 0, beta: 90, gamma: 0 })).toBeCloseTo(0, 6);
    expect(compassHeading({ alpha: 0, beta: 45, gamma: 0 })).toBeCloseTo(0, 6);
  });

  test("a phone with no clear direction has no heading", () => {
    expect(pointingHeading(rotationMatrix({ alpha: 0, beta: 90, gamma: 90 }))).not.toBeNull();
    // Top tipped 45° towards the floor: its top and its back point opposite ways, so neither wins.
    expect(pointingHeading(rotationMatrix({ alpha: 0, beta: -45, gamma: 0 }))).toBeNull();
  });

  test("iOS headings are used only when real", () => {
    expect(webkitHeading(312.4)).toBeCloseTo(312.4, 6);
    expect(webkitHeading(-1)).toBeNull();
    expect(webkitHeading(undefined)).toBeNull();
    expect(webkitHeading(Number.NaN)).toBeNull();
  });

  test("names", () => {
    expect(headingName(0)).toBe("North");
    expect(headingName(312)).toBe("Northwest");
    expect(headingName(359)).toBe("North");
    expect(headingName(-90)).toBe("West");
    expect(wrapDegrees(-30)).toBe(330);
    expect(wrapDegrees(725)).toBe(5);
  });
});

describe("the 3D twin", () => {
  test("a phone held to read, facing the visitor, faces the room square on", () => {
    const held = rotationMatrix({ alpha: 0, beta: 45, gamma: 0 });
    expectMatrix(twinMatrix(held, 0), IDENTITY);
  });

  test("it doesn't matter which way the visitor faces, only how they hold it", () => {
    const held = rotationMatrix({ alpha: 120, beta: 45, gamma: 0 });
    const yaw = compassHeading({ alpha: 120, beta: 45, gamma: 0 }) ?? 0;
    expectMatrix(twinMatrix(held, yaw), IDENTITY);
  });

  test("tipping the right side down turns the twin the same way", () => {
    const m = twinMatrix(rotationMatrix({ alpha: 0, beta: 45, gamma: 30 }), 0);
    // The twin's right edge moves away from the viewer (negative z in CSS).
    expect(column(m, 0)[2]).toBeLessThan(0);
  });

  test("standing the phone up shows its top edge coming towards the viewer", () => {
    const m = twinMatrix(rotationMatrix({ alpha: 0, beta: 90, gamma: 0 }), 0);
    // CSS y points down, so the top of the twin is -y; it comes forward (positive z).
    expect(-column(m, 1)[2]).toBeGreaterThan(0.5);
  });

  test("css matrix3d lists columns", () => {
    expect(cssMatrix3d(IDENTITY)).toBe("matrix3d(1.00000,0,0,0,0,1.00000,0,0,0,0,1.00000,0,0,0,0,1)");
  });
});

describe("smoothing", () => {
  test("quaternions round-trip through matrices", () => {
    for (const e of [
      { alpha: 0, beta: 0, gamma: 0 },
      { alpha: 200, beta: 80, gamma: -30 },
      { alpha: 10, beta: -170, gamma: 89 },
      { alpha: 359, beta: 179, gamma: -89 },
    ]) {
      const m = rotationMatrix(e);
      expectMatrix(matrixFromQuat(quatFromMatrix(m)), m);
    }
  });

  test("slerp goes from one rotation to the other", () => {
    const a = quatFromMatrix(rotationMatrix({ alpha: 0, beta: 10, gamma: 0 }));
    const b = quatFromMatrix(rotationMatrix({ alpha: 0, beta: 70, gamma: 0 }));
    expectMatrix(matrixFromQuat(slerp(a, b, 0)), matrixFromQuat(a));
    expectMatrix(matrixFromQuat(slerp(a, b, 1)), matrixFromQuat(b));
    expectMatrix(matrixFromQuat(slerp(a, b, 0.5)), rotationMatrix({ alpha: 0, beta: 40, gamma: 0 }));
  });

  test("slerp takes the short way round", () => {
    const a = quatFromMatrix(rotationMatrix({ alpha: 350, beta: 0, gamma: 0 }));
    const b = quatFromMatrix(rotationMatrix({ alpha: 10, beta: 0, gamma: 0 }));
    expect(compassHeading({ alpha: 0, beta: 0, gamma: 0 })).toBeCloseTo(0, 6);
    expectMatrix(matrixFromQuat(slerp(a, b, 0.5)), IDENTITY);
  });

  test("follow factor grows with time and never overshoots", () => {
    expect(followFactor(0, 80)).toBe(0);
    expect(followFactor(16, 80)).toBeGreaterThan(0.15);
    expect(followFactor(10_000, 80)).toBeCloseTo(1, 6);
    expect(followFactor(16, 0)).toBe(1);
  });

  test("compass ring turns the short way round", () => {
    expect(approachAngle(350, 10, 0.5)).toBeCloseTo(0, 6);
    expect(approachAngle(10, 350, 0.5)).toBeCloseTo(0, 6);
    expect(approachAngle(90, 180, 1)).toBeCloseTo(180, 6);
  });
});

describe("simulation", () => {
  test("the level simulation sits at the reading angle", () => {
    expect(eulerFromTilt({ pitch: 0, roll: 0 })).toEqual({ alpha: 0, beta: 45, gamma: 0 });
    expect(eulerFromTilt({ pitch: -40, roll: 20 })).toEqual({ alpha: 0, beta: 5, gamma: 20 });
  });

  test("readings are rounded to half a degree for sending", () => {
    expect(roundEuler({ alpha: 12.26, beta: -3.74, gamma: 0.1 })).toEqual({ alpha: 12.5, beta: -3.5, gamma: 0 });
  });
});
