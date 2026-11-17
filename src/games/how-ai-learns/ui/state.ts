/**
 * The game's screens and data as one reducer. Pure: no TF.js, no DOM.
 * Heavy things (tensors, the embedding cache, blob URLs) live in session.ts.
 */

import type { EpochLog } from "../engine/classifier";
import type { DatasetPhoto } from "../engine/dataset";
import { decide, DEFAULT_THRESHOLD, outcomeOf, tally, type Candidate, type Tally } from "../engine/rules";

export type StepId = "intro" | "pick" | "examples" | "train" | "test" | "results";

/** The four steps the visitor works through, for the step counter. */
export const PLAY_STEPS: StepId[] = ["pick", "examples", "train", "test"];

export const DEFAULT_PICK = ["pens", "cups"];
export const MIN_GROUPS = 2;
export const MAX_GROUPS = 3;
/** Examples per group before the Train button works. */
export const MIN_EXAMPLES = 5;
/** Examples per group, all sources together. */
export const MAX_EXAMPLES = 40;
export const LIBRARY_BATCH = 10;
export const EXPERIMENT_EXAMPLES = 3;

export interface ExamplePhoto {
  id: string;
  category: string;
  /** Category label, e.g. "Pen". */
  label: string;
  url: string;
  kind: "library" | "camera";
  title: string;
}

export interface TrainedRun {
  /** Labels in the model's order. */
  labels: string[];
  centroids: Float32Array[];
  similarityCutoff: number;
  history: EpochLog[];
  /** Examples per group label. */
  perGroup: Record<string, number>;
  examples: number;
  /** Reading photos plus practising, after the model was loaded. */
  seconds: number;
  /** One example and its numbers, for the "photos become numbers" visual. */
  sample: { photo: ExamplePhoto; embedding: Float32Array } | null;
}

export type TrainState =
  | { phase: "idle" }
  | { phase: "model" }
  | { phase: "reading"; done: number; total: number; current: { photo: ExamplePhoto; embedding: Float32Array } | null }
  | { phase: "practising"; history: EpochLog[]; total: number }
  | { phase: "done"; run: TrainedRun }
  | { phase: "error"; message: string };

export interface TestResult {
  truth: string;
  candidates: Candidate[];
}

export interface PreviousRun {
  perGroup: Record<string, number>;
  similarityCutoff: number;
  results: Record<string, TestResult>;
}

export interface GameState {
  step: StepId;
  picked: string[];
  examples: Record<string, ExamplePhoto[]>;
  train: TrainState;
  /** Test photo id → what the model said. Filled in the background after training. */
  results: Record<string, TestResult>;
  /** Test photo ids that could not be loaded or scored. */
  failed: string[];
  /** Test photos whose result the visitor has opened. */
  revealed: string[];
  selected: string | null;
  threshold: number;
  testMode: "photos" | "camera";
  /** The group whose camera is open on the examples step. */
  capture: string | null;
  /** This visitor has seen the camera explanation; later camera buttons start it directly. */
  cameraWelcomed: boolean;
  /** The run before this one, for "train again and compare". */
  previous: PreviousRun | null;
}

export const initialState: GameState = {
  step: "intro",
  picked: DEFAULT_PICK,
  examples: {},
  train: { phase: "idle" },
  results: {},
  failed: [],
  revealed: [],
  selected: null,
  threshold: DEFAULT_THRESHOLD,
  testMode: "photos",
  capture: null,
  cameraWelcomed: false,
  previous: null,
};

export type Action =
  | { type: "go"; step: StepId }
  | { type: "toggle-pick"; id: string }
  | { type: "add-examples"; category: string; photos: ExamplePhoto[] }
  | { type: "remove-example"; category: string; id: string }
  | { type: "keep-first"; count: number }
  | { type: "train-start" }
  | { type: "train"; train: TrainState }
  | { type: "train-epoch"; log: EpochLog }
  | { type: "test-result"; id: string; result: TestResult }
  | { type: "test-failed"; id: string }
  | { type: "capture"; category: string | null }
  | { type: "camera-welcomed" }
  | { type: "select-test"; id: string }
  | { type: "reveal-all" }
  | { type: "threshold"; value: number }
  | { type: "test-mode"; mode: "photos" | "camera" }
  | { type: "reset" };

export function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case "go":
      return { ...state, step: action.step, capture: null };

    case "toggle-pick": {
      const has = state.picked.includes(action.id);
      if (has) return { ...state, picked: state.picked.filter((id) => id !== action.id) };
      if (state.picked.length >= MAX_GROUPS) return state;
      return { ...state, picked: [...state.picked, action.id] };
    }

    case "add-examples": {
      const current = state.examples[action.category] ?? [];
      const ids = new Set(current.map((p) => p.id));
      const room = Math.max(0, MAX_EXAMPLES - current.length);
      const added: ExamplePhoto[] = [];
      for (const p of action.photos) {
        if (ids.has(p.id) || added.length >= room) continue;
        ids.add(p.id);
        added.push(p);
      }
      if (!added.length) return state;
      return { ...state, examples: { ...state.examples, [action.category]: [...current, ...added] } };
    }

    case "remove-example": {
      const current = state.examples[action.category] ?? [];
      return {
        ...state,
        examples: { ...state.examples, [action.category]: current.filter((p) => p.id !== action.id) },
      };
    }

    case "keep-first": {
      const examples: Record<string, ExamplePhoto[]> = {};
      for (const [category, list] of Object.entries(state.examples)) examples[category] = list.slice(0, action.count);
      return { ...state, examples };
    }

    case "train-start": {
      // Keep the finished run so the next one can be compared with it.
      const previous =
        state.train.phase === "done" && Object.keys(state.results).length
          ? { perGroup: state.train.run.perGroup, similarityCutoff: state.train.run.similarityCutoff, results: state.results }
          : state.previous;
      return {
        ...state,
        step: "train",
        train: { phase: "model" },
        results: {},
        failed: [],
        revealed: [],
        capture: null,
        selected: null,
        testMode: "photos",
        previous,
      };
    }

    case "train":
      return { ...state, train: action.train };

    case "train-epoch":
      if (state.train.phase !== "practising") return state;
      return { ...state, train: { ...state.train, history: [...state.train.history, action.log] } };

    case "test-result":
      return { ...state, results: { ...state.results, [action.id]: action.result } };

    case "test-failed":
      return state.failed.includes(action.id) ? state : { ...state, failed: [...state.failed, action.id] };

    case "capture":
      return { ...state, capture: action.category };

    case "camera-welcomed":
      return { ...state, cameraWelcomed: true };

    case "select-test":
      return {
        ...state,
        selected: action.id,
        testMode: "photos",
        revealed: state.revealed.includes(action.id) ? state.revealed : [...state.revealed, action.id],
      };

    case "reveal-all":
      return { ...state, revealed: Object.keys(state.results) };

    case "threshold":
      return { ...state, threshold: action.value };

    case "test-mode":
      return { ...state, testMode: action.mode };

    case "reset":
      return initialState;
  }
}

/* ── Derived data ───────────────────────────────────────────────── */

/** The held-out photos for the picked groups, one of each group in turn. */
export function testPhotosFor(picked: string[], test: Map<string, DatasetPhoto[]>): DatasetPhoto[] {
  const lists = picked.map((category) => test.get(category) ?? []);
  const longest = Math.max(0, ...lists.map((l) => l.length));
  const out: DatasetPhoto[] = [];
  for (let i = 0; i < longest; i++) for (const list of lists) if (list[i]) out.push(list[i]);
  return out;
}

export function tallyResults(results: Record<string, TestResult>, threshold: number, similarityCutoff: number): Tally {
  return tally(
    Object.values(results).map((r) => outcomeOf(decide(r.candidates, { threshold, similarityCutoff }), r.truth)),
  );
}

/** "3 pens, 3 cups" style counts for a run. */
export function perGroupCounts(examples: ExamplePhoto[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of examples) out[e.label] = (out[e.label] ?? 0) + 1;
  return out;
}
