/**
 * The game's screens and data as one reducer. Pure: no TF.js, no DOM.
 * Heavy things (tensors, the embedding cache, blob URLs) live in session.ts.
 */

import type { EpochLog } from "../engine/classifier";
import type { DatasetPhoto } from "../engine/dataset";
import type { TrainMap } from "../engine/projection";
import { decide, DEFAULT_THRESHOLD, NONE_LABEL, outcomeOf, tally, type Candidate, type Tally } from "../engine/rules";

export type StepId = "intro" | "pick" | "examples" | "train" | "test" | "results";

/** The four steps the visitor works through, for the step counter. */
export const PLAY_STEPS: StepId[] = ["pick", "examples", "train", "test"];

/**
 * One thing the visitor teaches. They name it themselves and show it to the
 * camera; a library category is the backup for when they have nothing to show.
 */
export interface Group {
  id: string;
  /** What the visitor typed. The model answers with it. */
  name: string;
  /** Library category whose photos it may use, e.g. "pens". */
  library: string | null;
}

/** The built-in group: the empty background, or photos of other things. */
export const NONE_GROUP = "none";
export const NAME_MAX = 24;

const GROUP_IDS = ["g1", "g2", "g3"];
const emptyGroup = (id: string): Group => ({ id, name: "", library: null });
export const DEFAULT_GROUPS: Group[] = [emptyGroup("g1"), emptyGroup("g2")];
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
  /** The group it belongs to (a group id or NONE_GROUP). */
  category: string;
  /** Group name when it was added; training uses the group's current name. */
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
  /** The examples on a flat map (null with too few different photos). */
  map: TrainMap | null;
  /** Numbers (weights) in the last layer that training adjusted, counted from the model. */
  weights: number;
}

export type TrainState =
  | { phase: "idle" }
  | { phase: "model" }
  | { phase: "reading"; done: number; total: number; current: { photo: ExamplePhoto; embedding: Float32Array } | null }
  | { phase: "practising"; history: EpochLog[]; total: number; map: TrainMap | null }
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
  groups: Group[];
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
  groups: DEFAULT_GROUPS,
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
  | { type: "rename"; id: string; name: string }
  /** A tapped idea: fills the first empty name, or clears the name if a group already has it. */
  | { type: "toggle-name"; name: string }
  | { type: "add-group" }
  | { type: "remove-group"; id: string }
  | { type: "use-library"; category: string; label: string }
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

    case "rename":
      return {
        ...state,
        groups: state.groups.map((g) => (g.id === action.id ? { ...g, name: action.name.slice(0, NAME_MAX) } : g)),
      };

    case "toggle-name": {
      const wanted = action.name.trim().toLowerCase();
      const owner = state.groups.find((g) => g.name.trim().toLowerCase() === wanted);
      const target = owner ?? state.groups.find((g) => !g.name.trim());
      if (!target) return state;
      const name = owner ? "" : action.name.slice(0, NAME_MAX);
      return { ...state, groups: state.groups.map((g) => (g.id === target.id ? { ...g, name } : g)) };
    }

    case "add-group": {
      if (state.groups.length >= MAX_GROUPS) return state;
      const id = GROUP_IDS.find((gid) => !state.groups.some((g) => g.id === gid));
      return id ? { ...state, groups: [...state.groups, emptyGroup(id)] } : state;
    }

    case "remove-group": {
      if (state.groups.length <= MIN_GROUPS) return state;
      const examples = { ...state.examples };
      delete examples[action.id];
      return { ...state, groups: state.groups.filter((g) => g.id !== action.id), examples };
    }

    case "use-library":
      return assignLibrary(state, action.category, action.label);

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
        // Taught with the camera: test with the camera. Library photos only: test on new library photos.
        testMode: state.groups.every((g) => g.library) ? "photos" : "camera",
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

/** Library photos a group added come out when it stops using that category. */
function dropLibraryPhotos(examples: Record<string, ExamplePhoto[]>, id: string) {
  return { ...examples, [id]: (examples[id] ?? []).filter((p) => p.kind !== "library") };
}

/**
 * Tapping a library category: a group that already uses it lets it go;
 * otherwise it goes to the first group with no name yet, then a new group,
 * then the first group without library photos (taking the category's name).
 */
function assignLibrary(state: GameState, category: string, label: string): GameState {
  const owner = state.groups.find((g) => g.library === category);
  if (owner) {
    return {
      ...state,
      groups: state.groups.map((g) => (g.id === owner.id ? { ...g, library: null } : g)),
      examples: dropLibraryPhotos(state.examples, owner.id),
    };
  }
  let groups = state.groups;
  let target = groups.find((g) => !g.library && !g.name.trim());
  if (!target && groups.length < MAX_GROUPS) {
    const id = GROUP_IDS.find((gid) => !groups.some((g) => g.id === gid));
    if (id) {
      target = emptyGroup(id);
      groups = [...groups, target];
    }
  }
  target ??= groups.find((g) => !g.library);
  if (!target) return state;
  const id = target.id;
  const keepName = target.name.trim() !== "";
  return {
    ...state,
    groups: groups.map((g) => (g.id === id ? { ...g, library: category, name: keepName ? g.name : label } : g)),
  };
}

/* ── Derived data ───────────────────────────────────────────────── */

/** Why the names can't be used yet, or null when they can. */
export function namesProblem(groups: Group[]): string | null {
  const names = groups.map((g) => g.name.trim().toLowerCase());
  if (names.some((n) => !n)) return groups.length === 2 ? "Name both things first." : "Name all three things first.";
  if (names.includes(NONE_LABEL.toLowerCase())) return `“${NONE_LABEL}” is already one of its groups. Pick another name.`;
  if (new Set(names).size !== names.length) return "Give each thing a different name.";
  return null;
}

/** The groups the model learns, in order: the visitor's, then "No object". */
export function trainingGroups(groups: Group[]): { id: string; label: string }[] {
  return [...groups.map((g) => ({ id: g.id, label: g.name.trim() })), { id: NONE_GROUP, label: NONE_LABEL }];
}

/** Library photos of the categories no group uses: the "No object" backup. */
export function otherThingsPool(groups: Group[], pool: Map<string, DatasetPhoto[]>): DatasetPhoto[] {
  const used = new Set(groups.map((g) => g.library));
  return [...pool.entries()].filter(([category]) => !used.has(category)).flatMap(([, photos]) => photos);
}

/** The name of the group a library test photo should get. */
export function truthFor(groups: Group[], photo: DatasetPhoto): string {
  return groups.find((g) => g.library === photo.category)?.name.trim() ?? photo.label;
}

/** The held-out photos for the groups that use the library, one of each group in turn. */
export function testPhotosFor(groups: Group[], test: Map<string, DatasetPhoto[]>): DatasetPhoto[] {
  const lists = groups.flatMap((g) => (g.library ? [test.get(g.library) ?? []] : []));
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
export function perGroupCounts(examples: { label: string }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of examples) out[e.label] = (out[e.label] ?? 0) + 1;
  return out;
}
