import { engine } from "../audio/engine";
import { GuitarInstrument } from "../audio/instruments/guitar";
import { playBus } from "../events";
import { chordMidi, PROGRESSIONS } from "../music";
import { settings } from "../settings";
import { Debounce, speedToVelocity, StrumDetector } from "../tracking/gestures";
import type { HandLabel, TrackFrame } from "../tracking/hands";
import { fromReach, strikeThreshold, toReach } from "../tracking/reach";
import { uiScale, type Controller } from "./common";
import { C, font, input, motion, pill, rgba, rr } from "./palette";

export function guitarChords(): string[] {
  const s = settings.get().guitar;
  return (PROGRESSIONS[s.progression] ?? PROGRESSIONS.pop).chords;
}

/** Which hand picks chords and which strums. */
export function guitarRoles(leftHanded = settings.get().tracking.leftHanded): { fret: HandLabel; strum: HandLabel } {
  return leftHanded ? { fret: "Right", strum: "Left" } : { fret: "Left", strum: "Right" };
}

/** Air guitar, copied from the original app: one hand's height picks the chord, the other strums. */
export class GuitarController implements Controller {
  readonly inst = "guitar" as const;
  private gtr: GuitarInstrument;
  private strum = new StrumDetector();
  private fist = new Debounce(70, 120);
  private pinch = new Debounce(50, 100);
  private chordIdx = 0;
  private lastStrum = { t: -1e9, dir: "down" as "down" | "up", muted: false, v: 0 };
  private targets: string[] = [];
  private fretSeen = 0;

  constructor() {
    const ctx = engine.ctx;
    if (!ctx) throw new Error("Audio is not running.");
    this.gtr = new GuitarInstrument(ctx, engine.instFx.input, settings.get().guitar.preset);
  }

  async load(p?: (f: number) => void) {
    await this.gtr.load(p);
    // Every guitar sound is a recording: without them it would play nothing.
    if (!this.gtr.bank.loaded) throw new Error("Guitar recordings did not load.");
  }

  get chord() {
    const c = guitarChords();
    return c[Math.min(this.chordIdx, c.length - 1)];
  }

  update(f: TrackFrame, now: number) {
    const s = settings.get().guitar;
    if (s.preset !== this.gtr.preset) {
      this.gtr.setPreset(s.preset);
      void this.gtr.load();
    }
    const chords = guitarChords();
    const { fret, strum } = guitarRoles();
    const fh = f[fret];
    if (fh) {
      this.fretSeen = now;
      if (s.chordSelect === "height") {
        const y = Math.max(0, Math.min(0.999, toReach(fh.palm).y));
        this.chordIdx = Math.floor(y * chords.length);
      } else {
        const was = this.pinch.value;
        if (this.pinch.update(fh.pinch, now) && !was) this.chordIdx = (this.chordIdx + 1) % chords.length;
      }
    }
    if (this.chordIdx >= chords.length) this.chordIdx = 0;
    const sh = f[strum];
    if (!sh) return;
    const muted = this.fist.update(sh.fist, now);
    const thr = strikeThreshold() * (1.25 - (s.strumSens / 100) * 0.6);
    const st = this.strum.update(sh, now, thr);
    if (st) {
      const v = speedToVelocity(st.speed, thr, 70) * (st.dir === "up" ? 0.85 : 1);
      const chord = this.chord;
      this.gtr.strum(chord, st.dir, v, engine.now, muted, st.speed / thr);
      this.lastStrum = { t: now, dir: st.dir, muted, v };
      playBus.emit({
        t: engine.now,
        inst: "guitar",
        kind: "strum",
        chord,
        dir: st.dir,
        muted,
        vel: v,
        notes: chordMidi(chord).filter((n) => n >= 0),
        hand: strum,
        preset: s.preset,
        speed: st.speed,
      });
    }
  }

  draw(g: CanvasRenderingContext2D, w: number, h: number, now: number) {
    const chords = guitarChords();
    const s = settings.get().guitar;
    const lefty = settings.get().tracking.leftHanded;
    const u = uiScale(h);
    const r0 = fromReach({ x: 0, y: 0 });
    const r1 = fromReach({ x: 1, y: 1 });
    // The chord column, on the fretting hand's side.
    const colX0 = (lefty ? r0.x + (r1.x - r0.x) * 0.68 : r0.x) * w;
    const colW = (r1.x - r0.x) * 0.32 * w;
    const top = r0.y * h;
    const bot = r1.y * h;
    const sh = (bot - top) / chords.length;
    chords.forEach((c, i) => {
      const y = top + i * sh;
      const active = i === this.chordIdx;
      rr(g, colX0 + 3, y + 3, colW - 6, sh - 6, 10);
      g.fillStyle = active ? rgba(C.game, 0.5) : rgba(C.canvas, 0.5);
      g.fill();
      g.lineWidth = active ? 2 : 1;
      g.strokeStyle = active ? rgba(C.game) : rgba(C.fg, 0.28);
      g.stroke();
      if (this.targets.includes(c)) {
        rr(g, colX0 + 3, y + 3, colW - 6, sh - 6, 10);
        g.lineWidth = 3;
        g.strokeStyle = rgba(C.fg);
        g.stroke();
        pill(g, "Play", colX0 + colW - 34 * u, y + 20 * u, 11 * u, C.fg, C.canvas);
      }
      g.fillStyle = rgba(C.fg);
      g.font = font(700, Math.max(16, Math.min(30, sh / 3)) * u);
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(c, colX0 + colW / 2, y + sh / 2);
      g.textBaseline = "alphabetic";
    });
    // Six strings across the strum zone.
    const sx0 = (lefty ? r0.x : r0.x + (r1.x - r0.x) * 0.42) * w;
    const sx1 = (lefty ? r0.x + (r1.x - r0.x) * 0.58 : r1.x) * w;
    const midY = (top + bot) / 2;
    const gapY = Math.min(34, (bot - top) / 9) * u;
    const age = (now - this.lastStrum.t) / 1000;
    const ring = age < 1.2 && !this.lastStrum.muted ? this.lastStrum.v * Math.exp(-age * 4) : 0;
    for (let i = 0; i < 6; i++) {
      const y = midY - gapY * 2.5 + i * gapY;
      const amp = motion.reduced ? 0 : 5 * ring;
      // Lower strings are wound: warmer and thicker. A strum brightens them.
      g.strokeStyle = i < 3 ? rgba(C.game, 0.55 + 0.45 * ring) : rgba(C.fg, 0.55 + 0.45 * ring);
      g.lineWidth = 3 - i * 0.35;
      g.beginPath();
      for (let x = sx0; x <= sx1; x += 8) {
        const k = (x - sx0) / (sx1 - sx0);
        g.lineTo(x, y + amp * Math.sin(k * Math.PI) * Math.sin(now / 18 + i));
      }
      g.stroke();
    }
    g.textAlign = "center";
    g.font = font(600, 13 * u);
    g.fillStyle = rgba(C.fg, 0.85);
    g.fillText("Strum here, down or up", (sx0 + sx1) / 2, midY - gapY * 3.4);
    if (age < 0.5) {
      g.globalAlpha = Math.min(1, (0.5 - age) / 0.15);
      pill(g, `${this.lastStrum.dir === "down" ? "Down" : "Up"}${this.lastStrum.muted ? " · muted" : ""}`, (sx0 + sx1) / 2, midY + gapY * 3.6, 13 * u, C.game, C.gameInk);
      g.globalAlpha = 1;
    }
    const fret = guitarRoles(lefty).fret.toLowerCase();
    // With the mouse, the how-to-play line at the top says which keys move the hand.
    const missing = input.mouse ? null : `Show your ${fret} hand here`;
    const fretHint = now - this.fretSeen > 800 ? missing : s.chordSelect === "pinch" && !input.mouse ? "Pinch for the next chord" : null;
    if (fretHint) {
      // A pill with its own background, centred on the chord column, so it never sits on a chord's label.
      pill(g, fretHint, colX0 + colW / 2, (top + bot) / 2, 12 * u, C.canvas, C.fg);
    }
  }

  setTargets(k: string[]) {
    this.targets = k;
  }

  label(k: string) {
    return k;
  }

  readout() {
    return this.chord;
  }

  panic() {
    this.gtr.damp();
  }

  dispose() {
    this.gtr.damp();
  }
}
