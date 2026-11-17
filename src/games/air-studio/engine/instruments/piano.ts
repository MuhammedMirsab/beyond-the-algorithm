import { engine } from "../audio/engine";
import { PianoInstrument, type Voice } from "../audio/instruments/piano";
import { playBus } from "../events";
import { diatonicTriad, isBlack, noteName, scaleNotes, uid } from "../music";
import { settings } from "../settings";
import { Debounce, speedToVelocity, StrikeDetector } from "../tracking/gestures";
import type { Hand, HandLabel, TrackFrame } from "../tracking/hands";
import { fromReach, strikeThreshold, toReach } from "../tracking/reach";
import { uiScale, type Controller } from "./common";
import { C, font, pill, rgba, rr } from "./palette";

interface Press {
  zone: number;
  voices: Voice[];
  id: string;
  t: number;
  vel: number;
}

/** Keys on screen: one octave of the scale for beginners, one or two octaves locked to a scale for advanced. */
export function pianoNotes(): number[] {
  const s = settings.get().piano;
  const base = 12 * (s.octave + 1) + s.key;
  if (s.level === "beginner") return scaleNotes(s.key, s.scale === "chromatic" ? "major" : s.scale, base, base + 12);
  return scaleNotes(s.key, s.scale, base, base + 12 * s.octaves);
}

/** A hand that vanishes for less than this keeps its key down (tracking drop-outs). */
export const DROPOUT_GRACE_MS = 160;

/** Air piano, copied from the original app: dip below the key line (or tap) to play. */
export class PianoController implements Controller {
  readonly inst = "piano" as const;
  private piano: PianoInstrument;
  private notes: number[] = [];
  private press: Record<HandLabel, Press | null> = { Left: null, Right: null };
  private lastSeen: Record<HandLabel, number> = { Left: 0, Right: 0 };
  private strike = { Left: new StrikeDetector(90), Right: new StrikeDetector(90) };
  private fist = { Left: new Debounce(), Right: new Debounce() };
  private pinch = { Left: new Debounce(60, 120), Right: new Debounce(60, 120) };
  private sustained: { voices: Voice[]; id: string }[] = [];
  private sustainOn = false;
  private targets: string[] = [];
  private flashes = new Map<number, number>();
  private current = "";
  private sig = "";

  constructor() {
    const ctx = engine.ctx;
    if (!ctx) throw new Error("Audio is not running.");
    this.piano = new PianoInstrument(ctx, engine.instFx.input, settings.get().piano.preset);
    this.sync();
  }

  load(p?: (f: number) => void) {
    return this.piano.load(p);
  }

  private sync() {
    const s = settings.get().piano;
    const sig = [s.level, s.octave, s.octaves, s.scale, s.key].join("|");
    if (sig !== this.sig) {
      this.sig = sig;
      this.panic();
      this.notes = pianoNotes();
    }
    if (s.preset !== this.piano.preset) {
      this.piano.setPreset(s.preset);
      void this.piano.load();
    }
  }

  private zoneAt(x: number): number {
    const r = toReach({ x, y: 0 }).x;
    return Math.max(0, Math.min(this.notes.length - 1, Math.floor(r * this.notes.length)));
  }

  private chordFor(m: number): number[] {
    const s = settings.get().piano;
    if (s.chordAssist === "triad") return diatonicTriad(m, s.key, s.scale === "chromatic" ? "major" : s.scale);
    if (s.chordAssist === "power") return [m, m + 7, m + 12];
    return [m];
  }

  private noteOn(label: HandLabel, zone: number, vel: number, now: number, speed: number) {
    const m = this.notes[zone];
    const notes = this.chordFor(m);
    const id = uid();
    const voices = notes.map((n) => this.piano.noteOn(n, vel));
    this.press[label] = { zone, voices, id, t: now, vel };
    this.flashes.set(zone, now);
    this.current = notes.length > 1 ? notes.map(noteName).join(" ") : noteName(m);
    playBus.emit({ t: engine.now, inst: "piano", kind: "note", midi: m, notes, vel, id, hand: label, preset: this.piano.preset, speed });
  }

  private noteOff(label: HandLabel) {
    const p = this.press[label];
    if (!p) return;
    this.press[label] = null;
    if (this.sustainOn) {
      this.sustained.push({ voices: p.voices, id: p.id });
      return;
    }
    const t = engine.now;
    p.voices.forEach((v) => v.stop(t));
    playBus.emitRelease({ id: p.id, t });
  }

  private releaseSustain() {
    const t = engine.now;
    for (const s of this.sustained) {
      s.voices.forEach((v) => v.stop(t));
      playBus.emitRelease({ id: s.id, t });
    }
    this.sustained = [];
  }

  update(f: TrackFrame, now: number) {
    this.sync();
    const s = settings.get().piano;
    const lineY = fromReach({ x: 0, y: s.lineY }).y;
    const margin = 0.008 + (1 - s.noteSens / 100) * 0.03;
    const thr = strikeThreshold();

    // Sustain gesture.
    let sus = false;
    for (const h of f.hands) {
      const fist = this.fist[h.label].update(h.fist, now);
      const pinch = this.pinch[h.label].update(h.pinch, now);
      if ((s.sustain === "leftFist" && h.label === "Left" && fist) || (s.sustain === "rightFist" && h.label === "Right" && fist) || (s.sustain === "pinch" && pinch)) sus = true;
    }
    if (sus !== this.sustainOn) {
      this.sustainOn = sus;
      if (!sus) this.releaseSustain();
    }

    for (const label of ["Left", "Right"] as HandLabel[]) {
      const h: Hand | null = f[label];
      if (!h) {
        // A grace period for brief detection drop-outs, then release.
        if (this.press[label] && now - this.lastSeen[label] > DROPOUT_GRACE_MS) this.noteOff(label);
        continue;
      }
      this.lastSeen[label] = now;
      const isSustainHand = (s.sustain === "leftFist" && label === "Left") || (s.sustain === "rightFist" && label === "Right");
      if (isSustainHand && this.fist[label].value) {
        this.noteOff(label);
        continue;
      }
      const zone = this.zoneAt(h.tip.x);
      const p = this.press[label];
      if (s.activation === "line") {
        const below = h.tip.y > lineY + margin;
        const above = h.tip.y < lineY - margin;
        if (!p && below && !h.fresh && h.tipVel.y > thr * 0.15) {
          this.noteOn(label, zone, speedToVelocity(h.tipVel.y, thr * 0.6, s.velocitySens), now, h.tipVel.y);
        } else if (p && above) this.noteOff(label);
        else if (p && s.glide && zone !== p.zone && h.tip.y > lineY) {
          const v = p.vel * 0.85;
          this.noteOff(label);
          this.noteOn(label, zone, v, now, h.tipVel.y);
        }
      } else {
        const hit = this.strike[label].update(h, now, thr * 0.8, true);
        if (hit) {
          if (p) this.noteOff(label);
          this.noteOn(label, this.zoneAt(hit.at.x), speedToVelocity(hit.vel, thr * 0.8, s.velocitySens), now, hit.vel);
        } else if (p && (h.tipVel.y < -thr * 0.5 || now - p.t > 1500)) this.noteOff(label);
      }
    }
  }

  draw(g: CanvasRenderingContext2D, w: number, h: number, now: number) {
    const s = settings.get().piano;
    const u = uiScale(h);
    const r0 = fromReach({ x: 0, y: 0 });
    const r1 = fromReach({ x: 1, y: 1 });
    const x0 = r0.x * w;
    const x1 = r1.x * w;
    const lineY = fromReach({ x: 0, y: s.lineY }).y * h;
    const tapTop = fromReach({ x: 0, y: 0.62 }).y * h;
    const top = s.activation === "line" ? lineY : tapTop;
    const bottom = Math.min(h - 6, r1.y * h);
    const n = this.notes.length;
    const zw = (x1 - x0) / n;
    const active = new Set<number>();
    for (const p of [this.press.Left, this.press.Right]) if (p) active.add(p.zone);
    const targetMidis = new Set(this.targets.map(Number));
    // Column guides above the line: where to hover for each key. Every other column, fading out
    // upwards, so they read as lanes into the keys rather than blocks.
    const guideTop = Math.max(r0.y * h, top - 220 * u);
    const guide = g.createLinearGradient(0, top, 0, guideTop);
    guide.addColorStop(0, rgba(C.fg, 0.07));
    guide.addColorStop(1, rgba(C.fg, 0));
    for (let i = 0; i < n; i++) {
      const m = this.notes[i];
      const x = x0 + i * zw;
      const black = isBlack(m);
      const fl = this.flashes.get(i);
      const age = fl !== undefined ? (now - fl) / 1000 : 9;
      if (i % 2 === 0 && top > guideTop) {
        g.fillStyle = guide;
        g.fillRect(x + 3, guideTop, zw - 6, top - guideTop);
      }
      // Key body.
      rr(g, x + 3, top, zw - 6, bottom - top, 8);
      g.fillStyle = black ? rgba(C.sunken, 0.78) : rgba(C.fg, 0.14);
      g.fill();
      if (active.has(i)) {
        g.fillStyle = rgba(C.game, 0.6);
        g.fill();
      } else if (age < 0.3) {
        g.fillStyle = rgba(C.game, 0.45 * (1 - age / 0.3));
        g.fill();
      }
      g.lineWidth = active.has(i) ? 2 : 1;
      g.strokeStyle = active.has(i) ? rgba(C.game) : rgba(C.fg, 0.28);
      g.stroke();
      const isT = targetMidis.has(m);
      if (isT) {
        rr(g, x + 3, top, zw - 6, bottom - top, 8);
        g.lineWidth = 3;
        g.strokeStyle = rgba(C.fg);
        g.stroke();
        pill(g, "Play", x + zw / 2, top + 18 * u, 11 * u, C.fg, C.canvas);
      }
      // Note name.
      g.textAlign = "center";
      g.fillStyle = active.has(i) ? rgba(C.fg) : black ? rgba(C.muted) : rgba(C.fg, 0.92);
      g.font = font(650, Math.max(11, Math.min(17, zw / 3.2)) * u);
      g.fillText(noteName(m), x + zw / 2, bottom - 14 * u);
    }
    g.textAlign = "left";
    g.font = font(600, 13 * u);
    if (s.activation === "line") {
      g.strokeStyle = rgba(C.game, 0.8);
      g.setLineDash([7, 6]);
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(x0, lineY);
      g.lineTo(x1, lineY);
      g.stroke();
      g.setLineDash([]);
      g.fillStyle = rgba(C.fg, 0.85);
      g.fillText("Dip below the line to play", x0 + 6, lineY - 10 * u);
    } else {
      g.fillStyle = rgba(C.fg, 0.85);
      g.fillText("Tap down over a key to play", x0 + 6, tapTop - 10 * u);
    }
    if (this.sustainOn) {
      g.textAlign = "right";
      g.fillStyle = rgba(C.game);
      g.font = font(700, 13 * u);
      g.fillText("Sustain", x1 - 6, top - 10 * u);
    }
  }

  setTargets(k: string[]) {
    this.targets = k;
  }

  label(k: string) {
    return noteName(Number(k));
  }

  readout() {
    return this.current;
  }

  panic() {
    const t = engine.now;
    for (const l of ["Left", "Right"] as HandLabel[]) {
      const p = this.press[l];
      if (p) {
        p.voices.forEach((v) => v.stop(t));
        playBus.emitRelease({ id: p.id, t });
        this.press[l] = null;
      }
    }
    this.releaseSustain();
  }

  dispose() {
    this.panic();
  }
}
