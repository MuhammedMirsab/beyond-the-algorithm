import type { ScaleId } from "./music";

/**
 * One visitor's settings, in memory only (the original app saved them to
 * localStorage; a booth must forget them). Next player calls reset().
 * Defaults are the original app's tuned values.
 */

export type InstrumentId = "piano" | "synth";

export interface FxSettings {
  reverb: number;
  delay: number;
  delayTime: number;
  feedback: number;
  chorus: number;
}

/** The comfortable reach box, in mirrored camera coordinates (0 to 1). */
export interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export type PianoPreset = "acoustic" | "grand" | "electric" | "synth" | "ambient" | "organ";
export type DrumPack = "acoustic" | "vintage" | "electronic";
export type GuitarPreset = "acoustic" | "clean" | "distorted" | "bass";
export type SynthPreset = "warmLead" | "theremin" | "squareBass" | "pad" | "acidLine" | "chipLead";
export type TimeSig = "4/4" | "3/4" | "6/8" | "2/4" | "5/4";

export interface SynthParams {
  level: "simple" | "advanced";
  preset: SynthPreset;
  wave: OscillatorType;
  octave: number;
  range: number;
  quantize: boolean;
  scale: ScaleId;
  key: number;
  yAxis: "filter" | "volume";
  glide: number;
  attack: number;
  release: number;
  cutoff: number;
  resonance: number;
  lfoRate: number;
  vibrato: number;
  detune: number;
  sub: number;
  motionMod: number;
  volume: number;
  fx: FxSettings;
}

export interface Settings {
  tracking: {
    /** 0 to 100: how fast a move must be to count as a hit or strum. */
    sensitivity: number;
    /** 0 to 100: One-Euro smoothing of the landmarks. */
    smoothing: number;
    minConfidence: number;
    showLandmarks: boolean;
    reach: Box;
    /** Camera to sound delay the beat judge allows for. */
    latencyMs: number;
    /** Strum with the left hand; drums mirrored. */
    leftHanded: boolean;
  };
  audio: { master: number; limiter: boolean };
  piano: {
    preset: PianoPreset;
    level: "beginner" | "advanced";
    octave: number;
    octaves: 1 | 2;
    scale: ScaleId;
    key: number;
    chordAssist: "off" | "triad" | "power";
    sustain: "off" | "leftFist" | "rightFist" | "pinch";
    activation: "line" | "tap";
    lineY: number;
    velocitySens: number;
    noteSens: number;
    glide: boolean;
    volume: number;
    fx: FxSettings;
  };
  synth: SynthParams;
  metronome: { bpm: number; sig: TimeSig; volume: number; countIn: number; accent: boolean };
  backing: { style: string; volume: number; loop: boolean; includeInRecording: boolean };
}

const fx = (reverb = 0.2, delay = 0, chorus = 0): FxSettings => ({ reverb, delay, delayTime: 0.33, feedback: 0.3, chorus });

/** Camera to sound delay assumed for a webcam (the original app's default). */
export const CAMERA_LATENCY_MS = 70;

export const DEFAULTS: Settings = {
  tracking: {
    sensitivity: 55,
    smoothing: 50,
    minConfidence: 0.6,
    showLandmarks: true,
    reach: { x0: 0.06, x1: 0.94, y0: 0.08, y1: 0.95 },
    latencyMs: CAMERA_LATENCY_MS,
    leftHanded: false,
  },
  audio: { master: 0.85, limiter: true },
  piano: {
    preset: "acoustic",
    level: "beginner",
    octave: 4,
    octaves: 1,
    scale: "major",
    key: 0,
    chordAssist: "off",
    sustain: "off",
    activation: "line",
    lineY: 0.58,
    velocitySens: 60,
    noteSens: 50,
    glide: true,
    volume: 0.9,
    fx: fx(0.22),
  },
  synth: {
    level: "simple",
    preset: "warmLead",
    wave: "sawtooth",
    octave: 4,
    range: 2,
    quantize: true,
    scale: "minorPent",
    key: 9,
    yAxis: "filter",
    glide: 0.06,
    attack: 0.03,
    release: 0.35,
    cutoff: 0.7,
    resonance: 4,
    lfoRate: 5,
    vibrato: 0.15,
    detune: 8,
    sub: 0.3,
    motionMod: 0.5,
    volume: 0.7,
    fx: fx(0.3, 0.25, 0.2),
  },
  metronome: { bpm: 96, sig: "4/4", volume: 0.6, countIn: 1, accent: true },
  backing: { style: "pop", volume: 0.55, loop: true, includeInRecording: true },
};

export type SettingsPatch = { [K in keyof Settings]?: Partial<Settings[K]> };

let state: Settings = structuredClone(DEFAULTS);
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((fn) => fn());
}

export const settings = {
  get: (): Settings => state,
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
  update<K extends keyof Settings>(section: K, patch: Partial<Settings[K]>) {
    state = { ...state, [section]: { ...state[section], ...patch } };
    emit();
  },
  /** Back to the defaults: Next player, or Reset in Settings. */
  reset() {
    state = structuredClone(DEFAULTS);
    emit();
  },
};

function applySection<K extends keyof Settings>(key: K, values: Partial<Settings[K]>): Partial<Settings[K]> {
  const current = state[key];
  const previous: Partial<Settings[K]> = {};
  for (const name of Object.keys(values) as (keyof Settings[K])[]) previous[name] = current[name];
  settings.update(key, values);
  return previous;
}

/** Applies a patch and returns what it replaced, so the caller can put it back (lessons do this). */
export function applyPatch(patch: SettingsPatch): SettingsPatch {
  const previous: SettingsPatch = {};
  const put = <K extends keyof Settings>(key: K) => {
    const values = patch[key];
    if (values) previous[key] = applySection(key, values);
  };
  for (const key of Object.keys(patch) as (keyof Settings)[]) put(key);
  return previous;
}

export const INSTRUMENT_NAMES: Record<InstrumentId, string> = {
  piano: "Piano",
  synth: "Synth",
};
