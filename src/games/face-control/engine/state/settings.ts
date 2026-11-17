import { readJSON, storageKey, writeJSON } from "@/lib/storage";

export type SteerMode = "tilt" | "tilt-turn";

export interface Settings {
  /** Multiplies head tilt before it becomes steering (0.5 = calm, 2 = twitchy). */
  steerSensitivity: number;
  /** Fraction of the steering range treated as "neutral" (0..0.35). */
  deadZone: number;
  /** 1 (needs a wide-open mouth) .. 5 (a small opening is enough). */
  jumpSensitivity: number;
  /** Steer with head tilt only, or tilt plus turning the head. */
  steerMode: SteerMode;
  /** 0 = most responsive, 1 = smoothest. */
  smoothing: number;
  /** Draw the tracked landmarks over the camera preview. */
  showLandmarks: boolean;
  music: boolean;
  sfx: boolean;
  /** 0..1 */
  volume: number;
}

export const DEFAULT_SETTINGS: Settings = {
  steerSensitivity: 1,
  deadZone: 0.14,
  jumpSensitivity: 3,
  steerMode: "tilt",
  smoothing: 0.5,
  showLandmarks: true,
  music: true,
  sfx: true,
  volume: 0.8,
};

export const SETTINGS_KEY = storageKey("face-control", "settings");

const clamp = (v: unknown, lo: number, hi: number, fallback: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;
const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);

/** Validates whatever is in storage so a corrupted entry can never break the controls. */
export function sanitizeSettings(raw: unknown): Settings {
  const d = DEFAULT_SETTINGS;
  if (!raw || typeof raw !== "object") return { ...d };
  const r = raw as Partial<Record<keyof Settings, unknown>>;
  return {
    steerSensitivity: clamp(r.steerSensitivity, 0.5, 2, d.steerSensitivity),
    deadZone: clamp(r.deadZone, 0, 0.35, d.deadZone),
    jumpSensitivity: Math.round(clamp(r.jumpSensitivity, 1, 5, d.jumpSensitivity)),
    steerMode: r.steerMode === "tilt-turn" ? "tilt-turn" : "tilt",
    smoothing: clamp(r.smoothing, 0, 1, d.smoothing),
    showLandmarks: bool(r.showLandmarks, d.showLandmarks),
    music: bool(r.music, d.music),
    sfx: bool(r.sfx, d.sfx),
    volume: clamp(r.volume, 0, 1, d.volume),
  };
}

type Listener = (s: Settings) => void;

/**
 * Settings for the current visitor. Read from storage on first use in the
 * browser (never at import), saved on every change so a reload mid-visit
 * keeps them, and reset to defaults by Next player.
 */
class SettingsStore {
  private value: Settings | null = null;
  private readonly listeners = new Set<Listener>();

  get = (): Settings => {
    if (!this.value) {
      if (typeof window === "undefined") return DEFAULT_SETTINGS;
      this.value = sanitizeSettings(readJSON<unknown>(SETTINGS_KEY, null));
    }
    return this.value;
  };

  set = (patch: Partial<Settings>) => {
    this.value = sanitizeSettings({ ...this.get(), ...patch });
    writeJSON(SETTINGS_KEY, this.value);
    const next = this.value;
    this.listeners.forEach((fn) => fn(next));
  };

  subscribe = (fn: Listener): (() => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
}

export const settings = new SettingsStore();

/** Every setting back to its default (the "Reset to defaults" button and Next player). */
export function resetSettings() {
  settings.set({ ...DEFAULT_SETTINGS });
}
