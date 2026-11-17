/** Hand-landmark geometry and the debounced, hysteretic pinch detector. */

export interface Landmark {
  x: number;
  y: number;
  z?: number;
}

/** MediaPipe hand landmark indices. */
export const LM = {
  WRIST: 0,
  THUMB_TIP: 4,
  INDEX_MCP: 5,
  INDEX_PIP: 6,
  INDEX_TIP: 8,
  MIDDLE_MCP: 9,
  MIDDLE_PIP: 10,
  MIDDLE_TIP: 12,
  RING_MCP: 13,
  RING_PIP: 14,
  RING_TIP: 16,
  PINKY_MCP: 17,
  PINKY_PIP: 18,
  PINKY_TIP: 20,
} as const;

/** Distance in an isotropic space (normalised x is stretched by the video aspect). */
function dist(a: Landmark, b: Landmark, aspect: number): number {
  return Math.hypot((a.x - b.x) * aspect, a.y - b.y);
}

/**
 * Thumb-tip to index-tip distance divided by palm size, so the same pinch
 * reads the same whether the hand is near the camera or far away.
 * Palm size uses wrist→middle-MCP and index-MCP→pinky-MCP, whichever is larger,
 * which stays stable when the hand rotates.
 */
export function pinchRatio(lm: Landmark[], aspect: number): number {
  return dist(lm[LM.THUMB_TIP], lm[LM.INDEX_TIP], aspect) / palmSize(lm, aspect);
}

/** Palm length (wrist to middle knuckle), robust to rotation. */
export function palmSize(lm: Landmark[], aspect: number): number {
  return Math.max(
    dist(lm[LM.WRIST], lm[LM.MIDDLE_MCP], aspect),
    dist(lm[LM.INDEX_MCP], lm[LM.PINKY_MCP], aspect) * 1.25,
    1e-4,
  );
}

const FINGERS: [number, number, number][] = [
  [LM.INDEX_MCP, LM.INDEX_PIP, LM.INDEX_TIP],
  [LM.MIDDLE_MCP, LM.MIDDLE_PIP, LM.MIDDLE_TIP],
  [LM.RING_MCP, LM.RING_PIP, LM.RING_TIP],
  [LM.PINKY_MCP, LM.PINKY_PIP, LM.PINKY_TIP],
];

/**
 * Open palm: all four fingers straight (tip clearly further from the wrist
 * than its middle joint, and well away from the knuckle). A pointing hand
 * has middle/ring/pinky curled, so it never counts.
 */
export function isOpenPalm(lm: Landmark[], aspect: number): boolean {
  const palm = palmSize(lm, aspect);
  const wrist = lm[LM.WRIST];
  return FINGERS.every(([mcp, pip, tip]) => {
    const tipD = dist(wrist, lm[tip], aspect);
    return tipD > dist(wrist, lm[pip], aspect) * 1.08 && dist(lm[mcp], lm[tip], aspect) > palm * 0.42;
  });
}

/** Mean of wrist and knuckles: the middle of the palm. */
export function palmCenter(lm: Landmark[]): { x: number; y: number } {
  const ids = [LM.WRIST, LM.INDEX_MCP, LM.MIDDLE_MCP, LM.RING_MCP, LM.PINKY_MCP, LM.MIDDLE_MCP];
  let x = 0;
  let y = 0;
  for (const i of ids) {
    x += lm[i].x;
    y += lm[i].y;
  }
  return { x: x / ids.length, y: y / ids.length };
}

/** A boolean that only changes after the new value has held for a while. */
export class Debounced {
  value = false;
  private candidateSince: number | null = null;
  private onMs: number;
  private offMs: number;

  constructor(onMs: number, offMs: number) {
    this.onMs = onMs;
    this.offMs = offMs;
  }

  reset() {
    this.value = false;
    this.candidateSince = null;
  }

  /** Returns true when the value flipped on this frame. */
  update(raw: boolean, tMs: number): boolean {
    if (raw === this.value) {
      this.candidateSince = null;
      return false;
    }
    this.candidateSince ??= tMs;
    if (tMs - this.candidateSince >= (raw ? this.onMs : this.offMs)) {
      this.value = raw;
      this.candidateSince = null;
      return true;
    }
    return false;
  }
}

export interface PinchConfig {
  /** Ratio below which an open hand becomes pinched. */
  enter: number;
  /** Ratio above which a pinched hand opens again (> enter: hysteresis). */
  exit: number;
  /** How long a new state must hold before it is accepted. */
  debounceMs: number;
}

export class PinchDetector {
  pinched = false;
  private candidate: boolean | null = null;
  private candidateSince = 0;
  config: PinchConfig;

  constructor(config: PinchConfig) {
    this.config = config;
  }

  reset() {
    this.pinched = false;
    this.candidate = null;
  }

  /** Returns true when the debounced state flipped on this frame. */
  update(ratio: number, tMs: number): boolean {
    const { enter, exit, debounceMs } = this.config;
    const raw = this.pinched ? ratio < exit : ratio < enter;
    if (raw === this.pinched) {
      this.candidate = null;
      return false;
    }
    if (this.candidate !== raw) {
      this.candidate = raw;
      this.candidateSince = tMs;
    }
    if (tMs - this.candidateSince >= debounceMs) {
      this.pinched = raw;
      this.candidate = null;
      return true;
    }
    return false;
  }
}

/** Bone connections for drawing the hand skeleton. */
export const HAND_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
];
