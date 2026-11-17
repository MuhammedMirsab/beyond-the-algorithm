import { parseNote } from "../music";

/**
 * Recorded samples, loaded lazily per instrument (copied from the original
 * app). Files live in public/games/air-studio/samples. Decoded buffers are
 * kept for the whole page visit: they hold no visitor data, and the next
 * visitor's piano then starts at once.
 */

export const SAMPLE_BASE = "/games/air-studio/samples/";

const bufferCache = new Map<string, Promise<AudioBuffer | null>>();
let decodeCtx: BaseAudioContext | null = null;

/** The running context decodes; with none (or after it closed) an offline one does. */
export const setDecodeContext = (c: BaseAudioContext | null) => {
  decodeCtx = c;
};

export function loadBuffer(url: string): Promise<AudioBuffer | null> {
  let p = bufferCache.get(url);
  if (!p) {
    p = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status}`);
        return r.arrayBuffer();
      })
      .then((ab) => {
        const ctx = decodeCtx && !(decodeCtx instanceof AudioContext && decodeCtx.state === "closed") ? decodeCtx : new OfflineAudioContext(2, 1, 48000);
        return ctx.decodeAudioData(ab);
      })
      .catch((e: unknown) => {
        console.warn("[air-studio] sample load failed", url, e);
        // Forget the failure, so the next load tries again.
        bufferCache.delete(url);
        return null;
      });
    bufferCache.set(url, p);
  }
  return p;
}

export class SampleBank {
  private map = new Map<number, AudioBuffer>();
  private keys: number[] = [];
  loaded = false;
  failed = false;
  private loading: Promise<void> | null = null;

  constructor(private files: { midi: number; url: string }[]) {}

  get size() {
    return this.files.length;
  }

  load(onProgress?: (f: number) => void): Promise<void> {
    if (this.loading) return this.loading;
    let done = 0;
    const loading = Promise.all(
      this.files.map(async (f) => {
        const b = await loadBuffer(f.url);
        if (b) this.map.set(f.midi, b);
        done++;
        onProgress?.(done / this.files.length);
      }),
    ).then(() => {
      this.keys = [...this.map.keys()].sort((a, b) => a - b);
      this.loaded = this.keys.length > 0;
      this.failed = this.keys.length < this.files.length;
      // Some files failed: let a later load fill the gaps.
      if (this.failed) this.loading = null;
    });
    this.loading = loading;
    return loading;
  }

  /** The nearest sample and the playback rate that tunes it to `midi`. */
  pick(midi: number): { buffer: AudioBuffer; rate: number } | null {
    if (!this.keys.length) return null;
    let best = this.keys[0];
    for (const k of this.keys) if (Math.abs(k - midi) < Math.abs(best - midi)) best = k;
    const buffer = this.map.get(best);
    return buffer ? { buffer, rate: Math.pow(2, (midi - best) / 12) } : null;
  }
}

const pianoNotes = (() => {
  const out: string[] = ["A0"];
  for (let o = 1; o <= 7; o++) for (const n of ["C", "Ds", "Fs", "A"]) out.push(n + o);
  out.push("C8");
  return out;
})();

export const BANKS = {
  pianoLoud: new SampleBank(pianoNotes.map((n) => ({ midi: parseNote(n), url: `${SAMPLE_BASE}piano/${n}v8.mp3` }))),
  pianoSoft: new SampleBank(pianoNotes.map((n) => ({ midi: parseNote(n), url: `${SAMPLE_BASE}piano/${n}v4.mp3` }))),
  guitarAcoustic: new SampleBank(
    ["A2", "A3", "A4", "As2", "As3", "As4", "B2", "B3", "B4", "C3", "C4", "C5", "Cs3", "Cs4", "Cs5", "D2", "D3", "D4", "D5", "Ds2", "Ds3", "Ds4",
      "E2", "E3", "E4", "F2", "F3", "F4", "Fs2", "Fs3", "Fs4", "G2", "G3", "G4", "Gs2", "Gs3", "Gs4"]
      .map((n) => ({ midi: parseNote(n), url: `${SAMPLE_BASE}guitar-acoustic/${n}.mp3` })),
  ),
  guitarElectric: new SampleBank(
    ["A2", "A3", "A4", "A5", "C3", "C4", "C5", "C6", "Cs2", "Ds3", "Ds4", "Ds5", "E2", "Fs2", "Fs3", "Fs4", "Fs5"]
      .map((n) => ({ midi: parseNote(n), url: `${SAMPLE_BASE}guitar-electric/${n}.mp3` })),
  ),
  bass: new SampleBank(
    ["As1", "As2", "As3", "As4", "Cs1", "Cs2", "Cs3", "Cs4", "Cs5", "E1", "E2", "E3", "E4", "G1", "G2", "G3", "G4"]
      .map((n) => ({ midi: parseNote(n), url: `${SAMPLE_BASE}bass-electric/${n}.mp3` })),
  ),
};

export const TR808: Record<string, string> = Object.fromEntries(
  ["kick", "snare", "hhc", "hho", "crash", "ride", "tomh", "tomm", "toml", "clap", "cowbell", "rim", "clave", "maracas", "congah", "congal"]
    .map((k) => [k, `${SAMPLE_BASE}tr808/${k}.wav`]),
);
