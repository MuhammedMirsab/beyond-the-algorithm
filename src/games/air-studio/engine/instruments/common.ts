import { engine } from "../audio/engine";
import { DrumKit, PIECE_LABEL } from "../audio/instruments/drums";
import { playBus } from "../events";
import type { DrumPack, InstrumentId } from "../settings";
import { settings } from "../settings";
import { speedToVelocity, StrikeDetector } from "../tracking/gestures";
import type { Hand, Pt, TrackFrame } from "../tracking/hands";
import { fromReach, strikeThreshold, toReach } from "../tracking/reach";
import { C, fitLabel, font, motion, pill, rgba, rr } from "./palette";

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
    g.strokeStyle = rgba(col);
    g.lineWidth = 2.5;
    g.beginPath();
    g.arc(p.x * w, p.y * h, (hand.fist ? 9 : 13) * u, 0, Math.PI * 2);
    g.stroke();
    if (hand.fist) {
      g.fillStyle = rgba(col);
      g.fill();
    }
    g.font = font(700, 12 * u);
    g.fillStyle = rgba(col);
    g.textAlign = "center";
    g.fillText(hand.label === "Left" ? "L" : "R", p.x * w, p.y * h - 20 * u);
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

/** Pads for drums and percussion. Pads are in play-area space, 0 to 1. */
export abstract class PadController implements Controller {
  abstract readonly inst: InstrumentId;
  protected kit: DrumKit;
  protected pads: Pad[] = [];
  protected det = { Left: new StrikeDetector(), Right: new StrikeDetector() };
  protected flashes = new Map<string, { t: number; v: number }>();
  protected targets: string[] = [];
  protected last = "";
  protected lastHits: { x: number; y: number; t: number; v: number }[] = [];

  constructor(pack: DrumPack) {
    const ctx = engine.ctx;
    if (!ctx) throw new Error("Audio is not running.");
    this.kit = new DrumKit(ctx, engine.instFx.input, pack);
  }

  abstract sensOffset(): number;
  abstract velSens(): number;
  abstract preset(): string;

  load(onProgress?: (f: number) => void) {
    return this.kit.load(onProgress);
  }

  protected padAt(p: Pt): Pad | null {
    const r = toReach(p);
    const x = Math.max(0, Math.min(0.999, r.x));
    const y = Math.max(0, Math.min(0.999, r.y));
    let best: Pad | null = null;
    let bd = Infinity;
    for (const pad of this.pads) {
      if (x >= pad.x && x < pad.x + pad.w && y >= pad.y && y < pad.y + pad.h) return pad;
      const cx = Math.max(pad.x, Math.min(pad.x + pad.w, x));
      const cy = Math.max(pad.y, Math.min(pad.y + pad.h, y));
      const d = Math.hypot(cx - x, cy - y);
      if (d < bd) {
        bd = d;
        best = pad;
      }
    }
    return bd < 0.08 ? best : null;
  }

  trigger(piece: string, vel: number, hand: Hand["label"] | "Sim", now: number, speed?: number) {
    this.kit.play(piece, vel);
    this.flashes.set(piece, { t: now, v: vel });
    this.last = PIECE_LABEL[piece] ?? piece;
    emitHit(this.inst, piece, vel, hand, this.preset(), speed);
  }

  update(f: TrackFrame, now: number) {
    const thr = strikeThreshold(this.sensOffset());
    for (const hand of f.hands) {
      const hit = this.det[hand.label].update(hand, now, thr);
      if (!hit) continue;
      const pad = this.padAt(hit.at);
      if (!pad) continue;
      const v = speedToVelocity(hit.vel, thr, this.velSens());
      this.trigger(pad.id, v, hand.label, now, hit.vel);
      this.lastHits.push({ x: hit.at.x, y: hit.at.y, t: now, v });
      if (this.lastHits.length > 12) this.lastHits.shift();
    }
  }

  draw(g: CanvasRenderingContext2D, w: number, h: number, now: number) {
    const u = uiScale(h);
    const gap = 0.012;
    for (const pad of this.pads) {
      const r = reachRect(pad.x + gap, pad.y + gap, pad.x + pad.w - gap, pad.y + pad.h - gap);
      const x = r.x * w;
      const y = r.y * h;
      const pw = r.w * w;
      const ph = r.h * h;
      const fl = this.flashes.get(pad.id);
      const age = fl ? (now - fl.t) / 1000 : 9;
      const isTarget = this.targets.includes(pad.id);
      rr(g, x, y, pw, ph, 10);
      g.fillStyle = rgba(C.canvas, 0.46);
      g.fill();
      if (fl && age < 0.25) {
        g.fillStyle = rgba(C.game, 0.55 * (1 - age / 0.25) * (0.4 + fl.v * 0.6));
        g.fill();
      }
      g.lineWidth = age < 0.25 ? 2 : 1.25;
      g.strokeStyle = age < 0.25 ? rgba(C.game) : rgba(C.fg, 0.3);
      g.stroke();
      g.fillStyle = rgba(C.fg);
      fitLabel(g, pad.label ?? PIECE_LABEL[pad.id] ?? pad.id, x + pw / 2, y + ph / 2, pw - 12, Math.max(12, Math.min(18, pw / 9)) * u);
      if (isTarget) drawTarget(g, x, y, pw, ph, u, 10);
      // Impact ring (movement: not under reduced motion).
      if (!motion.reduced && age < 0.3) {
        g.strokeStyle = rgba(C.game, 1 - age / 0.3);
        g.lineWidth = 2;
        rr(g, x - age * 30, y - age * 30, pw + age * 60, ph + age * 60, 12);
        g.stroke();
      }
    }
    // Where each hit landed, fading out.
    for (const hm of this.lastHits) {
      const a = (now - hm.t) / 400;
      if (a > 1) continue;
      g.fillStyle = rgba(C.fg, 0.8 * (1 - a));
      g.beginPath();
      g.arc(hm.x * w, hm.y * h, 4 + hm.v * 6, 0, Math.PI * 2);
      g.fill();
    }
  }

  setTargets(keys: string[]) {
    this.targets = keys;
  }

  label(key: string) {
    return PIECE_LABEL[key] ?? key;
  }

  readout() {
    return this.last;
  }

  panic() {
    /* one-shots only */
  }

  dispose() {
    /* voices end by themselves */
  }
}
