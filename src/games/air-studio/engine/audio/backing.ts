import { CHORD_SHAPES, midiToFreq, NOTE_NAMES } from "../music";
import { settings } from "../settings";
import { engine } from "./engine";
import { DrumKit } from "./instruments/drums";
import { GuitarInstrument } from "./instruments/guitar";
import { PianoInstrument } from "./instruments/piano";
import { BANKS } from "./samples";
import { transport } from "./transport";

/**
 * Procedural backing bands, copied from the original app. Patterns are one
 * bar of steps (16 for 4/4, 12 for 3/4), generated live so they follow the
 * tempo exactly and loop without a seam.
 *
 * Drums: x hit, o soft hit. Bass: R root, 3 third, 5 fifth, 6 sixth, 7 flat
 * seventh, 8 octave, W walking. Comp: x stab, h hold the bar, a arpeggio
 * note, d and u guitar down and up strums.
 */
export interface BackingStyle {
  id: string;
  genre: string;
  desc: string;
  bpm: number;
  sig: "4/4" | "3/4";
  swing: number;
  chords: string[];
  drums?: "acoustic" | "electronic";
  pattern: Record<string, string>;
  bass?: string;
  comp?: { inst: "piano" | "electric" | "organ" | "pad" | "guitar"; pat: string };
}

export const BACKING_STYLES: BackingStyle[] = [
  {
    id: "pop", genre: "Pop", desc: "Bright and steady, on C, G, Am and F", bpm: 100, sig: "4/4", swing: 0,
    chords: ["C", "G", "Am", "F"], drums: "acoustic",
    pattern: { kick: "x-----x-x-------", snare: "----x-------x---", hhc: "x-o-x-o-x-o-x-o-" },
    bass: "R-----R-R---5---", comp: { inst: "piano", pat: "x-----x---x---x-" },
  },
  {
    id: "rock", genre: "Rock", desc: "Driving drums and a muted, distorted guitar", bpm: 124, sig: "4/4", swing: 0,
    chords: ["A5", "D5", "E5", "D5"], drums: "acoustic",
    pattern: { kick: "x-----x-x-x-----", snare: "----x-------x---", hhc: "x-x-x-x-x-x-x-x-", crash: "x---------------" },
    bass: "R-R-R-R-R-R-R-R-", comp: { inst: "guitar", pat: "d-d-d-d-d-d-d-d-" },
  },
  {
    id: "jazz", genre: "Jazz", desc: "Swing with a walking bass line", bpm: 132, sig: "4/4", swing: 0.33,
    chords: ["Dm7", "G7", "Cmaj7", "A7"], drums: "acoustic",
    pattern: { ride: "x---x-x-x---x-x-", hhc: "----x-------x---", kick: "o---------------" },
    bass: "W---W---W---W---", comp: { inst: "electric", pat: "------x-----x---" },
  },
  {
    id: "blues", genre: "Blues", desc: "A twelve-bar shuffle in A", bpm: 92, sig: "4/4", swing: 0.33,
    chords: ["A7", "A7", "A7", "A7", "D7", "D7", "A7", "A7", "E7", "D7", "A7", "E7"], drums: "acoustic",
    pattern: { kick: "x-------x-------", snare: "----x-------x---", ride: "x-x-x-x-x-x-x-x-" },
    bass: "R-3-5-6-8-6-5-3-", comp: { inst: "piano", pat: "--x---x---x---x-" },
  },
  {
    id: "electronic", genre: "Electronic", desc: "A kick on every beat, 808 drums and pads", bpm: 124, sig: "4/4", swing: 0,
    chords: ["Am", "F", "C", "G"], drums: "electronic",
    pattern: { kick: "x---x---x---x---", clap: "----x-------x---", hho: "--x---x---x---x-", hhc: "x-x-x-x-x-x-x-x-" },
    bass: "--R---R---R---R-", comp: { inst: "pad", pat: "h---------------" },
  },
  {
    id: "classical", genre: "Classical", desc: "Flowing piano in three beats a bar", bpm: 84, sig: "3/4", swing: 0,
    chords: ["C", "G", "Am", "Em", "F", "C", "F", "G"],
    pattern: {}, bass: "R-----------", comp: { inst: "piano", pat: "a-a-a-a-a-a-" },
  },
  {
    id: "hiphop", genre: "Hip-hop", desc: "Laid-back drums and electric piano", bpm: 88, sig: "4/4", swing: 0.18,
    chords: ["Am7", "Dm7", "Fmaj7", "E7"], drums: "acoustic",
    pattern: { kick: "x-------x-x-----", snare: "----x-------x---", hhc: "x-o-x-o-x-o-x-oo" },
    bass: "R------R--R-----", comp: { inst: "electric", pat: "x-------x-------" },
  },
  {
    id: "ambient", genre: "Ambient", desc: "Slow pads and bass, no drums", bpm: 64, sig: "4/4", swing: 0,
    chords: ["Cmaj7", "Am7", "Fmaj7", "G"],
    pattern: {}, bass: "R---------------", comp: { inst: "pad", pat: "h---------------" },
  },
];

const QUAL: [string, number[]][] = [
  ["maj7", [0, 4, 7, 11]],
  ["m7", [0, 3, 7, 10]],
  ["7", [0, 4, 7, 10]],
  ["sus4", [0, 5, 7]],
  ["sus2", [0, 2, 7]],
  ["5", [0, 7, 12]],
  ["m", [0, 3, 7]],
  ["", [0, 4, 7]],
];

/** Root pitch class and chord tones (semitones above the root) of a chord symbol. */
export function parseChord(sym: string): { root: number; tones: number[] } {
  const m = /^([A-G])(#|b)?(.*)$/.exec(sym);
  if (!m) return { root: 0, tones: [0, 4, 7] };
  let root = NOTE_NAMES.indexOf(m[1]);
  if (m[2] === "#") root++;
  if (m[2] === "b") root--;
  root = (root + 12) % 12;
  const q = QUAL.find(([k]) => m[3] === k) ?? QUAL[QUAL.length - 1];
  return { root, tones: q[1] };
}

/** Close voicing of a chord around `center`. */
export function voice(root: number, tones: number[], center = 60): number[] {
  return tones
    .map((t) => {
      let n = root + t + 48;
      while (n < center - 6) n += 12;
      while (n > center + 7) n -= 12;
      return n;
    })
    .sort((a, b) => a - b);
}

/** The bass note of a chord root: E1 to D#2. */
export const bassRootOf = (root: number) => 28 + ((root - 4 + 12) % 12);

export type BackingNote =
  | { kind: "drum"; piece: string; vel: number; t: number }
  | { kind: "bass"; midi: number; vel: number; t: number; dur: number }
  | { kind: "keys"; notes: number[]; vel: number; t: number; dur: number }
  | { kind: "pad"; notes: number[]; t: number; dur: number }
  | { kind: "strum"; chord: string; dir: "down" | "up"; vel: number; t: number };

export interface StepOptions {
  loop: boolean;
  /** Position in the arpeggio, carried from step to step. */
  arpIndex: number;
  /** For the small velocity variation on drums (Math.random live). */
  random: () => number;
}

/**
 * Everything a style plays on one step. Pure: the band schedules the result,
 * tests read it.
 */
export function backingStep(style: BackingStyle, step: number, time: number, sd: number, opts: StepOptions): { notes: BackingNote[]; arpIndex: number } {
  const notes: BackingNote[] = [];
  let arpIndex = opts.arpIndex;
  if (step < 0) return { notes, arpIndex };
  const spb = style.sig === "3/4" ? 12 : 16;
  const loopBars = style.chords.length;
  const bar = Math.floor(step / spb);
  if (!opts.loop && bar >= loopBars) return { notes, arpIndex };
  const i = step % spb;
  const chord = style.chords[bar % loopBars];
  const { root, tones } = parseChord(chord);
  // Swing: delay the off-beat eighths.
  let t = time;
  if (style.swing > 0 && i % 4 === 2) t += style.swing * sd * 2 * 0.5;
  const ch = (s: string | undefined) => (s ? s[i] : "-");

  for (const [piece, pat] of Object.entries(style.pattern)) {
    const c = ch(pat);
    if (c === "x" || c === "o") {
      const id = piece === "clap" ? (style.drums === "electronic" ? "eClap" : "clap") : piece;
      notes.push({ kind: "drum", piece: id, vel: (c === "x" ? 0.85 : 0.45) * (0.92 + opts.random() * 0.08), t });
    }
  }

  const b = ch(style.bass);
  if (style.bass && b !== "-") {
    const bassRoot = bassRootOf(root);
    const steps: Record<string, number> = { R: 0, "3": tones[1], "5": 7, "6": 9, "7": 10, "8": 12 };
    let n = bassRoot + (steps[b] ?? 0);
    if (b === "W") {
      const beat = Math.floor(i / 4);
      const nextRoot = bassRootOf(parseChord(style.chords[(bar + 1) % loopBars]).root);
      n = [bassRoot, bassRoot + tones[1], bassRoot + 7, nextRoot + (nextRoot > bassRoot + 7 ? -1 : 1)][beat];
    }
    const len = b === "R" && style.bass.replace(/-/g, "").length === 1 ? sd * spb * 0.95 : sd * 3.2;
    notes.push({ kind: "bass", midi: n, vel: 0.8, t, dur: len });
  }

  const comp = style.comp;
  const cc = comp ? ch(comp.pat) : "-";
  if (comp && cc !== "-") {
    const voiced = voice(root, tones, comp.inst === "pad" ? 62 : 64);
    if (comp.inst === "guitar") {
      if (CHORD_SHAPES[chord]) notes.push({ kind: "strum", chord, dir: cc === "u" ? "up" : "down", vel: 0.55, t });
    } else if (comp.inst === "pad") {
      notes.push({ kind: "pad", notes: voiced, t, dur: sd * spb });
    } else if (cc === "a") {
      const arp = [voiced[0] - 12, ...voiced, voiced[1] + 12];
      const pattern = [0, 1, 2, 3, 2, 1];
      const n = arp[Math.min(arp.length - 1, pattern[arpIndex++ % pattern.length])];
      notes.push({ kind: "keys", notes: [n], vel: 0.45, t, dur: sd * 3 });
    } else {
      let nextHit = 1;
      while (nextHit < spb && comp.pat[(i + nextHit) % spb] === "-") nextHit++;
      const dur = cc === "h" ? sd * spb : Math.min(sd * nextHit, sd * 6) * 0.9;
      notes.push({ kind: "keys", notes: voiced, vel: 0.42, t, dur });
    }
  }
  return { notes, arpIndex };
}

export const styleById = (id: string) => BACKING_STYLES.find((b) => b.id === id) ?? BACKING_STYLES[0];

/** A band that follows the shared transport. */
class BackingBand {
  style: BackingStyle = styleById(settings.get().backing.style);
  playing = false;
  private drums: DrumKit | null = null;
  private keys: PianoInstrument | null = null;
  private guitar: GuitarInstrument | null = null;
  private unsub: (() => void) | null = null;
  private arpIdx = 0;
  /** Context the instruments were built on (they die with it). */
  private builtFor: BaseAudioContext | null = null;

  select(id: string) {
    this.style = styleById(id);
    settings.update("backing", { style: this.style.id });
    settings.update("metronome", { bpm: this.style.bpm, sig: this.style.sig });
  }

  async prepare() {
    const ctx = await engine.ensure();
    if (this.builtFor !== ctx) {
      this.drums = null;
      this.keys = null;
      this.guitar = null;
      this.builtFor = ctx;
    }
    const out = engine.backingFx.input;
    if (!this.drums) this.drums = new DrumKit(ctx, out, "acoustic");
    if (!this.keys) this.keys = new PianoInstrument(ctx, out, "acoustic");
    if (!this.guitar) this.guitar = new GuitarInstrument(ctx, out, "distorted");
    const st = this.style;
    await Promise.all([
      this.drums.setPack(st.drums === "electronic" ? "electronic" : "acoustic"),
      BANKS.bass.load(),
      st.comp?.inst === "piano" ? this.keys.load() : Promise.resolve(),
      st.comp?.inst === "guitar" ? this.guitar.load() : Promise.resolve(),
    ]);
    this.keys.setPreset(st.comp?.inst === "electric" ? "electric" : st.comp?.inst === "organ" ? "organ" : "acoustic");
  }

  /** Attach to the transport. Call before transport.start(). */
  async attach() {
    await this.prepare();
    this.unsub?.();
    this.playing = true;
    this.arpIdx = 0;
    this.unsub = transport.onStep((step, time, sd) => this.onStep(step, time, sd));
  }

  detach() {
    this.unsub?.();
    this.unsub = null;
    this.playing = false;
    this.guitar?.damp(engine.now);
  }

  /** Forget the instruments (the audio context is closing). */
  reset() {
    this.detach();
    this.drums = null;
    this.keys = null;
    this.guitar = null;
    this.builtFor = null;
    this.style = styleById(settings.get().backing.style);
  }

  private onStep(step: number, time: number, sd: number) {
    const { notes, arpIndex } = backingStep(this.style, step, time, sd, {
      loop: settings.get().backing.loop,
      arpIndex: this.arpIdx,
      random: Math.random,
    });
    this.arpIdx = arpIndex;
    for (const n of notes) {
      switch (n.kind) {
        case "drum":
          this.drums?.play(n.piece, n.vel, n.t);
          break;
        case "bass":
          this.bassNote(n.midi, n.vel, n.t, n.dur);
          break;
        case "keys":
          if (this.keys) for (const m of n.notes) this.keys.noteOn(m, n.vel, n.t).stop(n.t + n.dur);
          break;
        case "pad":
          this.pad(n.notes, n.t, n.dur);
          break;
        case "strum":
          this.guitar?.strum(n.chord, n.dir, n.vel, n.t, true, 1.5);
          break;
      }
    }
  }

  private bassNote(midi: number, vel: number, when: number, dur: number) {
    const p = BANKS.bass.pick(midi);
    const ctx = engine.ctx;
    if (!p || !ctx) return;
    const s = ctx.createBufferSource();
    s.buffer = p.buffer;
    s.playbackRate.value = p.rate;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vel * 0.95, when);
    g.gain.setTargetAtTime(0, when + dur, 0.04);
    s.connect(g).connect(engine.backingFx.input);
    s.start(when);
    s.stop(when + dur + 0.4);
  }

  private pad(notes: number[], when: number, dur: number) {
    const ctx = engine.ctx;
    if (!ctx) return;
    const g = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1400;
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(0.09, when + Math.min(0.6, dur * 0.3));
    g.gain.setValueAtTime(0.09, when + dur - 0.05);
    g.gain.setTargetAtTime(0, when + dur - 0.05, 0.35);
    lp.connect(g).connect(engine.backingFx.input);
    for (const n of notes) {
      for (const d of [-9, 9]) {
        const o = ctx.createOscillator();
        o.type = "sawtooth";
        o.frequency.value = midiToFreq(n);
        o.detune.value = d;
        o.connect(lp);
        o.start(when);
        o.stop(when + dur + 2);
      }
    }
  }
}

export const backing = new BackingBand();
