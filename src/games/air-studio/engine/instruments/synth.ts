import { engine } from "../audio/engine";
import { SynthVoice } from "../audio/instruments/synth";
import { playBus } from "../events";
import { noteName, scaleNotes, uid } from "../music";
import { settings } from "../settings";
import { Debounce } from "../tracking/gestures";
import type { HandLabel, TrackFrame } from "../tracking/hands";
import { fromReach, toReach } from "../tracking/reach";
import { handColor, uiScale, type Controller } from "./common";
import { DROPOUT_GRACE_MS } from "./piano";
import { C, font, rgba, rr } from "./palette";

interface VState {
  voice: SynthVoice;
  noteId: string | null;
  midi: number;
  pitch: number;
  mod: number;
  bright: number;
  level: number;
}

/**
 * Theremin-style synth, copied from the original app. Simple mode: two
 * voices, one per hand. Advanced mode: the right hand plays and the left
 * hand controls volume (height) and wobble (sideways).
 */
export class SynthController implements Controller {
  readonly inst = "synth" as const;
  private v: Partial<Record<HandLabel, VState>> = {};
  private gate = { Left: new Debounce(60, 90), Right: new Debounce(60, 90) };
  private lastSeen = { Left: 0, Right: 0 };
  private targets: string[] = [];
  private current = "";
  private ctrl = { volume: 0.8, mod: 0 };

  async load(onProgress?: (f: number) => void) {
    // Fully synthesised: nothing to download.
    onProgress?.(1);
  }

  private range() {
    const s = settings.get().synth;
    const lo = 12 * (s.octave + 1) + s.key;
    return { lo, hi: lo + 12 * s.range, scale: scaleNotes(s.key, s.scale, lo, lo + 12 * s.range) };
  }

  private voiceFor(l: HandLabel): VState {
    let st = this.v[l];
    if (!st) {
      const ctx = engine.ctx;
      if (!ctx) throw new Error("Audio is not running.");
      st = { voice: new SynthVoice(ctx, engine.instFx.input, settings.get().synth), noteId: null, midi: 0, pitch: 60, mod: 0, bright: 0.5, level: 0.8 };
      this.v[l] = st;
    }
    return st;
  }

  private endNote(st: VState) {
    if (st.noteId) {
      playBus.emitRelease({ id: st.noteId, t: engine.now });
      st.noteId = null;
    }
  }

  private startNote(st: VState, l: HandLabel) {
    st.noteId = uid();
    playBus.emit({ t: engine.now, inst: "synth", kind: "note", midi: st.midi, notes: [st.midi], vel: st.level, id: st.noteId, hand: l, preset: settings.get().synth.preset });
  }

  update(f: TrackFrame, now: number) {
    const s = settings.get().synth;
    const { lo, hi, scale } = this.range();
    const players: HandLabel[] = s.level === "simple" ? ["Left", "Right"] : ["Right"];
    // Advanced: the left hand is a controller (height = volume, sideways = wobble).
    if (s.level === "advanced") {
      const lh = f.Left;
      if (lh) {
        const r = toReach(lh.palm);
        this.ctrl.volume = Math.max(0, Math.min(1, 1 - r.y));
        this.ctrl.mod = Math.max(0, Math.min(1, r.x * 1.6));
      }
      const left = this.v.Left;
      if (left) {
        left.voice.noteOff();
        this.endNote(left);
      }
    } else {
      this.ctrl.volume = 0.85;
      this.ctrl.mod = 0;
    }

    for (const l of players) {
      const h = f[l];
      const st = this.voiceFor(l);
      st.voice.apply(s);
      if (!h) {
        if (st.voice.gate && now - this.lastSeen[l] > DROPOUT_GRACE_MS) {
          st.voice.noteOff();
          this.endNote(st);
        }
        continue;
      }
      this.lastSeen[l] = now;
      const r = toReach(l === "Right" || s.level === "simple" ? h.tip : h.palm);
      const x = Math.max(0, Math.min(1, r.x));
      const y = Math.max(0, Math.min(1, r.y));
      let pitch = lo + x * (hi - lo);
      if (s.quantize && scale.length) {
        const idx = Math.min(scale.length - 1, Math.floor(x * scale.length));
        pitch = scale[idx];
      }
      const midi = Math.round(pitch);
      const height = 1 - y;
      st.mod = st.mod * 0.85 + Math.min(1, h.speed / 4) * 0.15;
      const mod = Math.min(1, st.mod * s.motionMod * 2 + this.ctrl.mod);
      st.bright = s.yAxis === "filter" ? height : 0.85;
      st.level = (s.yAxis === "volume" ? height : 0.85) * this.ctrl.volume;
      st.pitch = pitch;
      st.voice.set(pitch, st.bright, st.level, mod);
      const open = this.gate[l].update(h.extended >= 2 && !h.fist, now);
      if (open && !st.voice.gate) {
        st.voice.noteOn(0.8);
        st.midi = midi;
        this.startNote(st, l);
      } else if (!open && st.voice.gate) {
        st.voice.noteOff();
        this.endNote(st);
      } else if (open && midi !== st.midi) {
        // The pitch moved to a new note: log it as a new event (legato in the audio).
        this.endNote(st);
        st.midi = midi;
        this.startNote(st, l);
      }
      if (open) this.current = noteName(midi);
    }
  }

  draw(g: CanvasRenderingContext2D, w: number, h: number) {
    const s = settings.get().synth;
    const u = uiScale(h);
    const { lo, hi, scale } = this.range();
    const r0 = fromReach({ x: 0, y: 0 });
    const r1 = fromReach({ x: 1, y: 1 });
    const x0 = r0.x * w;
    const x1 = r1.x * w;
    const top = r0.y * h;
    const bot = r1.y * h;
    const tset = new Set(this.targets.map(Number));
    g.textAlign = "center";
    if (s.quantize) {
      const zw = (x1 - x0) / scale.length;
      scale.forEach((m, i) => {
        const x = x0 + i * zw;
        g.fillStyle = i % 2 ? rgba(C.fg, 0.035) : rgba(C.fg, 0.075);
        g.fillRect(x, top, zw, bot - top);
        g.fillStyle = tset.has(m) ? rgba(C.fg) : m % 12 === s.key ? rgba(C.game) : rgba(C.fg, 0.8);
        g.font = font(650, Math.max(11, Math.min(15, zw / 3)) * u);
        g.fillText(noteName(m), x + zw / 2, bot - 12 * u);
      });
    } else {
      for (let m = lo; m <= hi; m++) {
        const x = x0 + ((m - lo) / (hi - lo)) * (x1 - x0);
        g.strokeStyle = m % 12 === s.key ? rgba(C.game, 0.5) : rgba(C.fg, 0.12);
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(x, top);
        g.lineTo(x, bot);
        g.stroke();
        if (m % 12 === s.key) {
          g.fillStyle = rgba(C.game);
          g.font = font(650, 13 * u);
          g.fillText(noteName(m), x, bot - 12 * u);
        }
      }
    }
    // Axis labels: what the two directions do.
    g.fillStyle = rgba(C.fg, 0.85);
    g.font = font(600, 13 * u);
    g.textAlign = "left";
    g.fillText(s.yAxis === "filter" ? "Higher is brighter" : "Higher is louder", x0 + 8, top + 20 * u);
    g.textAlign = "right";
    g.fillText("Further right is a higher note", x1 - 8, top + 20 * u);
    // Voice markers.
    for (const l of ["Left", "Right"] as HandLabel[]) {
      const st = this.v[l];
      if (!st || !st.voice.gate) continue;
      const x = x0 + ((st.pitch - lo) / (hi - lo)) * (x1 - x0);
      const col = handColor(l);
      g.strokeStyle = rgba(col);
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(x, top);
      g.lineTo(x, bot);
      g.stroke();
      g.fillStyle = rgba(col);
      g.font = font(700, 16 * u);
      g.textAlign = "center";
      g.fillText(noteName(st.midi), x, top + 52 * u);
    }
    if (s.level === "advanced") {
      // Left-hand control meters.
      const mw = 150 * u;
      const mh = 92 * u;
      const mx = x0 + 8;
      const my = bot - mh - 40 * u;
      rr(g, mx, my, mw, mh, 10);
      g.fillStyle = rgba(C.canvas, 0.7);
      g.fill();
      g.fillStyle = rgba(C.muted);
      g.font = font(500, 11 * u, "mono");
      g.textAlign = "left";
      g.fillText("LEFT HAND", mx + 12 * u, my + 20 * u);
      g.font = font(600, 13 * u);
      g.fillStyle = rgba(C.fg);
      g.fillText("Volume", mx + 12 * u, my + 46 * u);
      g.fillText("Wobble", mx + 12 * u, my + 74 * u);
      const bx = mx + 72 * u;
      const bw = mw - 84 * u;
      for (const [row, value] of [
        [42, this.ctrl.volume],
        [70, this.ctrl.mod],
      ] as const) {
        g.fillStyle = rgba(C.fg, 0.15);
        g.fillRect(bx, my + (row - 6) * u, bw, 8 * u);
        g.fillStyle = rgba(C.fg);
        g.fillRect(bx, my + (row - 6) * u, bw * value, 8 * u);
      }
    }
  }

  setTargets(k: string[]) {
    this.targets = k;
  }

  label(k: string) {
    return noteName(Number(k));
  }

  readout() {
    return Object.values(this.v).some((s) => s?.voice.gate) ? this.current : "";
  }

  panic() {
    for (const st of Object.values(this.v)) {
      if (!st) continue;
      st.voice.noteOff();
      this.endNote(st);
    }
  }

  dispose() {
    for (const st of Object.values(this.v)) {
      if (!st) continue;
      this.endNote(st);
      st.voice.dispose();
    }
    this.v = {};
  }
}
