import { REST_BETA, type Tilt } from "./tilt";

/**
 * Which way the phone faces, in 3D, from the browser's DeviceOrientationEvent
 * (alpha, beta, gamma: the W3C's intrinsic Z-X'-Y'' rotation). Used for the
 * 3D twin on the booth screen, which turns exactly like the phone in the
 * visitor's hand, and for the compass. Pure maths, no DOM.
 *
 * Frames: the earth frame is x east, y north, z up. The device frame is x to
 * the right of the screen, y up the screen, z out of the screen.
 */

export interface Euler {
  /** Degrees around z, 0 to 360. */
  alpha: number;
  /** Degrees around x, -180 to 180: 0 lying flat, 90 standing up facing you. */
  beta: number;
  /** Degrees around y, -90 to 90: positive when the right side dips. */
  gamma: number;
}

/** A 3 x 3 matrix, row by row. */
export type Mat3 = readonly [number, number, number, number, number, number, number, number, number];
/** A unit quaternion: x, y, z, w. */
export type Quat = readonly [number, number, number, number];

const RAD = Math.PI / 180;

export const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

function multiply(a: Mat3, b: Mat3): Mat3 {
  const out: number[] = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) out.push(a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c]);
  }
  return out as unknown as Mat3;
}

/** Device to earth: Rz(alpha) Rx(beta) Ry(gamma). */
export function rotationMatrix({ alpha, beta, gamma }: Euler): Mat3 {
  const [ca, sa] = [Math.cos(alpha * RAD), Math.sin(alpha * RAD)];
  const [cb, sb] = [Math.cos(beta * RAD), Math.sin(beta * RAD)];
  const [cg, sg] = [Math.cos(gamma * RAD), Math.sin(gamma * RAD)];
  const rz: Mat3 = [ca, -sa, 0, sa, ca, 0, 0, 0, 1];
  const rx: Mat3 = [1, 0, 0, 0, cb, -sb, 0, sb, cb];
  const ry: Mat3 = [cg, 0, sg, 0, 1, 0, -sg, 0, cg];
  return multiply(multiply(rz, rx), ry);
}

/** 0 to 360. */
export function wrapDegrees(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/**
 * The compass direction the phone "points", in degrees clockwise from north:
 * where its top points when it lies flat, where its back points when it
 * stands up (like a camera). Null when it points straight up or down.
 */
export function pointingHeading(m: Mat3): number | null {
  // Columns 1 and 2 of the matrix are the device's y (top) and z (screen) axes in earth terms.
  const x = m[1] - m[2];
  const y = m[4] - m[5];
  if (Math.hypot(x, y) < 0.05) return null;
  return wrapDegrees(Math.atan2(x, y) / RAD);
}

/** Compass heading from an orientation reading that is relative to north. */
export function compassHeading(e: Euler): number | null {
  return pointingHeading(rotationMatrix(e));
}

/** iOS gives `webkitCompassHeading` directly; it is -1 or missing when there's no fix. */
export function webkitHeading(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? wrapDegrees(value) : null;
}

const NAMES = ["North", "Northeast", "East", "Southeast", "South", "Southwest", "West", "Northwest"];

/** "Northwest" for 312°. */
export function headingName(deg: number): string {
  return NAMES[Math.round(wrapDegrees(deg) / 45) % 8];
}

/**
 * The twin's rotation in CSS space (x right, y down, z towards the viewer),
 * seen from where the visitor's eyes are: looking forward along `yaw` (the
 * heading the visitor faced when the twin was centred) and down by `lookDown`
 * degrees. A phone held to read, tipped back 45° and facing the visitor,
 * comes out as the identity: the twin faces the room square on.
 */
export function twinMatrix(device: Mat3, yaw: number, lookDown = REST_BETA): Mat3 {
  const [sy, cy] = [Math.sin(yaw * RAD), Math.cos(yaw * RAD)];
  const [sd, cd] = [Math.sin(lookDown * RAD), Math.cos(lookDown * RAD)];
  // The viewer's right, up and towards-the-viewer axes, in earth terms.
  const right = [cy, -sy, 0];
  const up = [sd * sy, sd * cy, cd];
  const back = [-cd * sy, -cd * cy, sd];
  const view: Mat3 = [right[0], right[1], right[2], -up[0], -up[1], -up[2], back[0], back[1], back[2]];
  // The twin's own CSS axes (y down) as device axes (y up).
  const flip: Mat3 = [1, 0, 0, 0, -1, 0, 0, 0, 1];
  return multiply(multiply(view, device), flip);
}

/** `matrix3d()` for a rotation (CSS lists the matrix column by column). */
export function cssMatrix3d(m: Mat3): string {
  const f = (v: number) => (Math.abs(v) < 1e-6 ? "0" : v.toFixed(5));
  return `matrix3d(${f(m[0])},${f(m[3])},${f(m[6])},0,${f(m[1])},${f(m[4])},${f(m[7])},0,${f(m[2])},${f(m[5])},${f(m[8])},0,0,0,0,1)`;
}

/* ── Quaternions, for smooth motion between readings ──────────────── */

export function quatFromMatrix(m: Mat3): Quat {
  const [m00, m01, m02, m10, m11, m12, m20, m21, m22] = m;
  const trace = m00 + m11 + m22;
  let x: number;
  let y: number;
  let z: number;
  let w: number;
  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2;
    w = s / 4;
    x = (m21 - m12) / s;
    y = (m02 - m20) / s;
    z = (m10 - m01) / s;
  } else if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
    w = (m21 - m12) / s;
    x = s / 4;
    y = (m01 + m10) / s;
    z = (m02 + m20) / s;
  } else if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
    w = (m02 - m20) / s;
    x = (m01 + m10) / s;
    y = s / 4;
    z = (m12 + m21) / s;
  } else {
    const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
    w = (m10 - m01) / s;
    x = (m02 + m20) / s;
    y = (m12 + m21) / s;
    z = s / 4;
  }
  const n = Math.hypot(x, y, z, w) || 1;
  return [x / n, y / n, z / n, w / n];
}

export function matrixFromQuat([x, y, z, w]: Quat): Mat3 {
  return [
    1 - 2 * (y * y + z * z),
    2 * (x * y - z * w),
    2 * (x * z + y * w),
    2 * (x * y + z * w),
    1 - 2 * (x * x + z * z),
    2 * (y * z - x * w),
    2 * (x * z - y * w),
    2 * (y * z + x * w),
    1 - 2 * (x * x + y * y),
  ];
}

/** Spherical interpolation, the short way round. `t` 0 gives `a`, 1 gives `b`. */
export function slerp(a: Quat, b: Quat, t: number): Quat {
  let [bx, by, bz, bw] = b;
  let dot = a[0] * bx + a[1] * by + a[2] * bz + a[3] * bw;
  if (dot < 0) {
    [bx, by, bz, bw] = [-bx, -by, -bz, -bw];
    dot = -dot;
  }
  if (dot > 0.9995) {
    const q: Quat = [a[0] + (bx - a[0]) * t, a[1] + (by - a[1]) * t, a[2] + (bz - a[2]) * t, a[3] + (bw - a[3]) * t];
    const n = Math.hypot(...q) || 1;
    return [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
  }
  const theta = Math.acos(Math.min(1, dot));
  const sin = Math.sin(theta);
  const wa = Math.sin((1 - t) * theta) / sin;
  const wb = Math.sin(t * theta) / sin;
  return [a[0] * wa + bx * wb, a[1] * wa + by * wb, a[2] * wa + bz * wb, a[3] * wa + bw * wb];
}

/** How far to move towards the target this frame, for a smoothing time constant of `tau` ms. */
export function followFactor(dtMs: number, tauMs: number): number {
  if (tauMs <= 0) return 1;
  return 1 - Math.exp(-Math.max(0, dtMs) / tauMs);
}

/** Moves an angle towards a target the short way round (for the compass ring). */
export function approachAngle(from: number, to: number, t: number): number {
  const delta = ((to - from + 540) % 360) - 180;
  return wrapDegrees(from + delta * t);
}

/* ── The simulation ───────────────────────────────────────────────── */

/** The simulated phone's tilt as an orientation reading, facing north (yaw 0). */
export function eulerFromTilt(tilt: Tilt): Euler {
  return { alpha: 0, beta: REST_BETA + tilt.pitch, gamma: tilt.roll };
}

/** An orientation reading that came from another device: three finite numbers, or it isn't used. */
export function isEuler(value: unknown): value is Euler {
  if (typeof value !== "object" || value === null) return false;
  const e = value as Record<string, unknown>;
  return [e.alpha, e.beta, e.gamma].every((v) => typeof v === "number" && Number.isFinite(v));
}

/** Rounded for sending: half a degree is finer than anyone can see on the twin. */
export function roundEuler(e: Euler): Euler {
  const r = (v: number) => Math.round(v * 2) / 2;
  return { alpha: r(e.alpha), beta: r(e.beta), gamma: r(e.gamma) };
}
