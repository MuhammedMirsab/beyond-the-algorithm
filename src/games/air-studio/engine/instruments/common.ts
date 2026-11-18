import { engine } from "../audio/engine";
import { playBus } from "../events";
import type { InstrumentId } from "../settings";
import { settings } from "../settings";
import type { Hand, TrackFrame } from "../tracking/hands";
import { fromReach } from "../tracking/reach";
import { C, font, pill, rgba, rr } from "./palette";

/** One instrument: gestures in, sound and a canvas overlay out (copied from the original app). */
export interface Controller {
  readonly inst: InstrumentId;
  load(onProgress?: (f: number) => void): Promise<void>;
  update(f: TrackFrame, now: number): void;
  draw(g: CanvasRenderingContext2D, w: number, h: number, now: number): void;
  /** Practice targets: event keys to highlight. */
  setTargets(keys: string[]): void;
  /** A person's name for an event key ("C4", "Snare", "G"). */
  label(key: string): string;
  /** What is sounding now, for the readout ("C4", "G"). */
  readout(): string;
  /** Silence everything that is held. */
  panic(): void;
  dispose(): void;
}

/** Font scale for overlays: grows with the play area so labels read on a projector. */
export function uiScale(h: number) {
  const a = fromReach({ x: 0, y: 0 });
  const b = fromReach({ x: 1, y: 1 });
  const px = (b.y - a.y) * h;
  return Math.max(1, Math.min(1.45, px / 560));
}

const BONES = [
  [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
];

/** The right hand in the game colour, the left in white; letters say which is which too. */
export const handColor = (label: Hand["label"]) => (label === "Left" ? C.fg : C.game);

export function drawHands(g: CanvasRenderingContext2D, f: TrackFrame, w: number, h: number, opts: { point?: "tip" | "palm" } = {}) {
  const showLm = settings.get().tracking.showLandmarks;
  const u = uiScale(h);
  for (const hand of f.hands) {
    const col = handColor(hand.label);
    if (showLm && hand.lm.length === 21) {
      g.strokeStyle = rgba(C.fg, 0.4);
      g.lineWidth = 1.5;
      g.lineCap = "round";
      g.beginPath();
      for (const [a, b] of BONES) {
        g.moveTo(hand.lm[a].x * w, hand.lm[a].y * h);
        g.lineTo(hand.lm[b].x * w, hand.lm[b].y * h);
      }
      g.stroke();
      g.fillStyle = rgba(C.fg, 0.75);
      for (const p of hand.lm) {
        g.beginPath();
        g.arc(p.x * w, p.y * h, 2.2, 0, Math.PI * 2);
        g.fill();
      }
    }
    const p = opts.point === "tip" ? hand.tip : hand.palm;
    const radius = (hand.fist ? 9 : 13) * u;
    // A dark rim under the coloured ring, so it reads over a bright picture.
    g.strokeStyle = rgba(C.canvas, 0.55);
    g.lineWidth = 5.5;
    g.beginPath();
    g.arc(p.x * w, p.y * h, radius, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = rgba(col);
    g.lineWidth = 2.5;
    g.stroke();
    if (hand.fist) {
      g.fillStyle = rgba(col);
      g.fill();
    }
    g.font = font(700, 12 * u);
    g.textAlign = "center";
    g.lineWidth = 3;
    g.strokeStyle = rgba(C.canvas, 0.6);
    g.strokeText(hand.label === "Left" ? "L" : "R", p.x * w, p.y * h - radius - 7 * u);
    g.fillStyle = rgba(col);
    g.fillText(hand.label === "Left" ? "L" : "R", p.x * w, p.y * h - radius - 7 * u);
  }
}

export function reachRect(x0: number, y0: number, x1: number, y1: number) {
  const a = fromReach({ x: x0, y: y0 });
  const b = fromReach({ x: x1, y: y1 });
  return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
}

export function emitHit(inst: InstrumentId, piece: string, vel: number, hand: Hand["label"] | "Sim", preset: string, speed?: number) {
  playBus.emit({ t: engine.now, inst, kind: "hit", piece, vel, hand, preset, speed });
}

/** A target marker: thick white outline plus a "Play" tag. */
export function drawTarget(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, u: number, radius = 8) {
  rr(g, x, y, w, h, radius);
  g.lineWidth = 3;
  g.strokeStyle = rgba(C.fg);
  g.stroke();
  pill(g, "Play", x + w / 2, y - 2 - 9 * u, 11 * u, C.fg, C.canvas);
}

export interface Pad {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  label?: string;
}

