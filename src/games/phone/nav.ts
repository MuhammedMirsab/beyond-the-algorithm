import type { SensorId } from "@/components/art/sensor-art";
import { EXPERIMENTS } from "./data/experiments";

/**
 * Where the visitor is in the game. The phone sends this to the booth screen,
 * which shows the same screen; the laptop sends it back to a phone that
 * reloaded. It crosses between devices, so it is checked field by field.
 */

export type Screen =
  | { name: "intro" }
  | { name: "lab" }
  | { name: "experiment"; id: SensorId }
  | { name: "quiz" }
  | { name: "takeaway"; score: number };

/** For each sensor the visitor tried: the latest guess, the reading behind it, and whether it was their real sensor. */
export interface Insight {
  label: string;
  reading: string | null;
  live: boolean;
}

export type Insights = Partial<Record<SensorId, Insight>>;

export interface Nav {
  screen: Screen;
  tested: SensorId[];
  /** Counts screen changes, so readings from an earlier screen are never shown on a later one. */
  visit: number;
  insights: Insights;
}

const IDS = new Set<string>(EXPERIMENTS.map((e) => e.id));

export function isSensorId(value: unknown): value is SensorId {
  return typeof value === "string" && IDS.has(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseScreen(value: unknown): Screen | null {
  if (!isRecord(value)) return null;
  switch (value.name) {
    case "intro":
    case "lab":
    case "quiz":
      return { name: value.name };
    case "experiment":
      return isSensorId(value.id) ? { name: "experiment", id: value.id } : null;
    case "takeaway": {
      const score = Number(value.score);
      return Number.isInteger(score) && score >= 0 && score <= 99 ? { name: "takeaway", score } : null;
    }
    default:
      return null;
  }
}

export function parseNav(value: unknown): Nav | null {
  if (!isRecord(value)) return null;
  const screen = parseScreen(value.screen);
  if (!screen) return null;
  const tested = Array.isArray(value.tested) ? [...new Set(value.tested.filter(isSensorId))] : [];
  const visit = Number(value.visit);
  const insights: Insights = {};
  if (isRecord(value.insights)) {
    for (const [id, entry] of Object.entries(value.insights)) {
      if (!isSensorId(id) || !isRecord(entry) || typeof entry.label !== "string") continue;
      insights[id] = {
        label: entry.label.slice(0, 80),
        reading: typeof entry.reading === "string" ? entry.reading.slice(0, 80) : null,
        live: entry.live === true,
      };
    }
  }
  return { screen, tested, visit: Number.isInteger(visit) && visit >= 0 ? visit : 0, insights };
}

/** One history entry per screen on a phone, so the back gesture moves back through the game. */
export interface HistoryEntry {
  id: string;
  screen: Screen;
}

export function readHistoryEntry(state: unknown): HistoryEntry | null {
  if (!isRecord(state) || !isRecord(state.phoneGame)) return null;
  const { id, screen } = state.phoneGame;
  const parsed = parseScreen(screen);
  return typeof id === "string" && parsed ? { id, screen: parsed } : null;
}
