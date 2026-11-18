import { dist, type Vec2 } from "./geometry";
import { FRAME_POINTS, LM, POINTS_PER_HAND, type FrameState, type TrackedHand } from "./gesture";

const TAU = Math.PI * 2;

const HAND_CONNECTIONS: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

interface Ripple {
  at: Vec2;
  t0: number;
  color: string;
}

export interface OverlayParams {
  state: FrameState;
  lensName: string;
  accent: string;
  time: number;
  /** "AI view": every landmark, the corner numbers and the points readout. */
  showSkeleton: boolean;
  /** Face points the Cartoon lens is using (shown in AI view). */
  face: Vec2[];
  /** prefers-reduced-motion: ripples fade in place instead of expanding. */
  reducedMotion: boolean;
}

export function rgba(hex: string, alpha: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * AI view's readout along the frame's top edge: the frame is 4 of the 42
 * points the model found. (The original showed a blinking "REC" timecode
 * here, but nothing is ever recorded.) Sentence case, like all text.
 */
export const POINTS_LABEL = `${FRAME_POINTS} of ${POINTS_PER_HAND * 2} points`;

/** Reads a next/font family variable set on <html>, with a fallback stack. */
function fontFamily(variable: string, fallback: string) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  return value ? `${value}, ${fallback}` : fallback;
}

/**
 * Crisp 2D chrome drawn above the WebGL layer at full device resolution:
 * fingertip guides, viewfinder corner brackets, the filter's name riding the
 * top edge of the frame and pinch ripples. AI view adds every landmark, the
 * landmark numbers of the four corners and the "4 of 42 points" readout.
 */
export class Overlay {
  private readonly ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private ripples: Ripple[] = [];
  private readonly sans: string;
  private readonly mono: string;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D unavailable");
    this.ctx = ctx;
    // Mona Sans for words people read, Martian Mono for the machine's voice (DESIGN.md §4).
    this.sans = fontFamily("--font-mona", "ui-sans-serif, system-ui, sans-serif");
    this.mono = fontFamily("--font-martian", "ui-monospace, monospace");
  }

  /** Drops pending ripples and frees the backing store. */
  dispose() {
    this.ripples = [];
    this.canvas.width = 0;
    this.canvas.height = 0;
  }

  resize(cssW: number, cssH: number, dpr: number) {
    this.dpr = dpr;
    const w = Math.max(1, Math.round(cssW * dpr));
    const h = Math.max(1, Math.round(cssH * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  ripple(at: Vec2, color: string, t: number) {
    this.ripples.push({ at, t0: t, color });
  }

  draw(p: OverlayParams) {
    const { ctx } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    const { state } = p;
    if (p.showSkeleton) {
      for (const hand of state.hands) this.skeleton(hand);
      this.facePoints(p.face, p.accent);
    }

    const guide = 1 - state.active;
    if (guide > 0.02) for (const hand of state.hands) this.fingertips(hand, guide);

    if (state.active > 0.01 && state.quad.length >= 3) this.frame(state, p);

    if (p.showSkeleton) for (const hand of state.hands) this.cornerNumbers(hand);

    this.drawRipples(p.time, p.reducedMotion);
  }

  private skeleton(hand: TrackedHand) {
    const { ctx } = this;
    ctx.lineWidth = 1.25;
    ctx.strokeStyle = "rgba(255,255,255,0.42)";
    ctx.beginPath();
    for (const [a, b] of HAND_CONNECTIONS) {
      ctx.moveTo(hand.points[a].x, hand.points[a].y);
      ctx.lineTo(hand.points[b].x, hand.points[b].y);
    }
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    for (const pt of hand.points) {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 2, 0, TAU);
      ctx.fill();
    }
  }

  private facePoints(points: Vec2[], accent: string) {
    const { ctx } = this;
    ctx.fillStyle = rgba(accent, 0.9);
    for (const pt of points) {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 3, 0, TAU);
      ctx.fill();
    }
  }

  /** AI view: the landmark number beside each corner fingertip (thumb tip 4, index tip 8). */
  private cornerNumbers(hand: TrackedHand) {
    const { ctx } = this;
    ctx.save();
    ctx.font = `500 11px ${this.mono}`;
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(0,0,0,0.6)";
    ctx.shadowBlur = 4;
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    const side = hand.slot === "left" ? -1 : 1;
    for (const [pt, n] of [
      [hand.thumb, LM.THUMB_TIP],
      [hand.index, LM.INDEX_TIP],
    ] as const) {
      const text = String(n);
      const w = ctx.measureText(text).width;
      ctx.fillText(text, side < 0 ? pt.x - 14 - w : pt.x + 14, pt.y - 10);
    }
    ctx.restore();
  }

  /** Before a frame locks: show the two tips each hand contributes, linked by a hairline. */
  private fingertips(hand: TrackedHand, alpha: number) {
    const { ctx } = this;
    const a = alpha * 0.75;
    ctx.setLineDash([2, 4]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = `rgba(255,255,255,${a * 0.6})`;
    ctx.beginPath();
    ctx.moveTo(hand.thumb.x, hand.thumb.y);
    ctx.lineTo(hand.index.x, hand.index.y);
    ctx.stroke();
    ctx.setLineDash([]);
    for (const pt of [hand.thumb, hand.index]) {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 7, 0, TAU);
      ctx.strokeStyle = `rgba(255,255,255,${a * 0.5})`;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 3, 0, TAU);
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      ctx.fill();
    }
  }

  private frame(state: FrameState, p: OverlayParams) {
    const { ctx } = this;
    const quad = state.quad;
    const n = quad.length;
    const a = state.active;

    // Hairline outline.
    ctx.beginPath();
    quad.forEach((v, i) => (i ? ctx.lineTo(v.x, v.y) : ctx.moveTo(v.x, v.y)));
    ctx.closePath();
    ctx.lineWidth = 1;
    ctx.strokeStyle = `rgba(255,255,255,${0.3 * a})`;
    ctx.stroke();

    // Viewfinder corner brackets along both adjacent edges. When a frame locks
    // they start long and settle into place over a third of a second: the "click".
    const snap = p.reducedMotion || !state.locked ? 1 : easeOut(Math.min(1, state.lockedFor / 0.35));
    const grow = 1 + 0.8 * (1 - snap);
    ctx.lineWidth = 2 + (1 - snap);
    ctx.lineCap = "round";
    ctx.strokeStyle = `rgba(255,255,255,${0.95 * a})`;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const v = quad[i];
      for (const o of [quad[(i + n - 1) % n], quad[(i + 1) % n]]) {
        const len = dist(v, o);
        if (len < 1) continue;
        const L = Math.min(26 * grow, len * 0.24 * grow, len * 0.45);
        ctx.moveTo(v.x, v.y);
        ctx.lineTo(v.x + ((o.x - v.x) / len) * L, v.y + ((o.y - v.y) / len) * L);
      }
    }
    ctx.stroke();

    // Fingertip dots.
    for (const v of quad) {
      ctx.beginPath();
      ctx.arc(v.x, v.y, 10, 0, TAU);
      ctx.fillStyle = `rgba(255,255,255,${0.12 * a})`;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(v.x, v.y, 4.5, 0, TAU);
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = `rgba(0,0,0,${0.3 * a})`;
      ctx.stroke();
    }

    this.label(state, p);
  }

  /** The filter's name (and, in AI view, the points readout), set along the frame's top edge. */
  private label(state: FrameState, p: OverlayParams) {
    const { ctx } = this;
    const quad = state.quad;
    const n = quad.length;
    let best = 0;
    let bestY = Infinity;
    for (let i = 0; i < n; i++) {
      const my = (quad[i].y + quad[(i + 1) % n].y) / 2;
      if (my < bestY) {
        bestY = my;
        best = i;
      }
    }
    let a = quad[best];
    let b = quad[(best + 1) % n];
    if (a.x > b.x) [a, b] = [b, a];
    const len = dist(a, b);
    if (len < 90) return;

    let angle = Math.atan2(b.y - a.y, b.x - a.x);
    if (Math.abs(angle) > 0.7) angle = 0;
    const alpha = state.active;

    ctx.save();
    ctx.translate(a.x, a.y);
    ctx.rotate(angle);
    ctx.textBaseline = "alphabetic";
    ctx.shadowColor = "rgba(0,0,0,0.6)";
    ctx.shadowBlur = 8;

    const y = -13;
    const x0 = 14;
    ctx.fillStyle = rgba(p.accent, alpha);
    ctx.beginPath();
    ctx.arc(x0 + 4, y - 5, 4, 0, TAU);
    ctx.fill();
    ctx.font = `600 15px ${this.sans}`;
    ctx.fillStyle = `rgba(255,255,255,${0.97 * alpha})`;
    ctx.fillText(p.lensName, x0 + 14, y);

    // AI view only, and only when the edge is long enough for both labels with a clear gap.
    if (p.showSkeleton) {
      const nameEnd = x0 + 14 + ctx.measureText(p.lensName).width;
      ctx.font = `500 12px ${this.mono}`;
      const w = ctx.measureText(POINTS_LABEL).width;
      if (len - 14 - w > nameEnd + 28) {
        ctx.fillStyle = `rgba(255,255,255,${0.8 * alpha})`;
        ctx.fillText(POINTS_LABEL, len - 14 - w, y);
      }
    }
    ctx.restore();
  }

  /** Pinch feedback: a ring that grows from the pinch point, or only fades under reduced motion. */
  private drawRipples(t: number, reducedMotion: boolean) {
    const { ctx } = this;
    this.ripples = this.ripples.filter((r) => t - r.t0 < 0.6);
    for (const r of this.ripples) {
      const k = (t - r.t0) / 0.6;
      ctx.beginPath();
      ctx.arc(r.at.x, r.at.y, reducedMotion ? 30 : 8 + 52 * easeOut(k), 0, TAU);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = rgba(r.color, (1 - k) * 0.95);
      ctx.stroke();
    }
  }
}
