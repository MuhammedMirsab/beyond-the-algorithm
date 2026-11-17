/**
 * The model the visitor trains. Ported from the original actionClassifier.js.
 *
 * Training keeps every example and averages each move's examples into one
 * pattern. Predicting compares the new numbers with the best 3 examples and
 * the pattern of each move, picks the closest, and answers "not sure" when
 * nothing is close enough. A 10-frame vote stops the answer flickering.
 *
 * Changes from the original:
 * - Examples are centred before comparing (the average of all examples is
 *   subtracted). Raw vectors are dominated by the parts of the body that
 *   never change, so every pose matched every move at 0.9 or more and the
 *   0.65 threshold could never say "not sure".
 * - Movement checks (wave, clap, walk) only apply when the visitor's own
 *   examples showed that movement, so a threshold that doesn't fit someone
 *   can't make a move impossible to recognise.
 * - No name-based score bonus for "open" or "fist": the answer depends on the
 *   examples only. No made-up scores for rejected frames.
 * - Dropped: object classification, localStorage save and load (examples are
 *   never stored), webcam capture helpers, TensorFlow buffers.
 */
import { classTraits, type ClassTraits } from "./traits";
import type { TemporalMotion } from "./features";

export const DEFAULT_REJECTION_THRESHOLD = 0.65;
/** Frames in the vote that steadies the answer. */
export const VOTE_WINDOW = 10;
/** The winner needs at least this share of the confidence. */
const MIN_WIN_SHARE = 0.56;
/** How many of the most alike examples count. */
const TOP_K = 3;
/** How sharply alike-ness turns into a confidence split. */
const SHARPNESS = 6;

export interface MoveClass {
  id: string;
  name: string;
}

export interface ClassifierExample {
  /** 44 numbers from extractFeatureVector(). */
  features: readonly number[];
  /** What analyzeTemporalMotion() found while the example was recorded. */
  motion?: TemporalMotion;
}

export type PredictionStatus = "recognized" | "unknown" | "no_person" | "not_enough_info" | "not_trained";

/** Why an "unknown" answer is unknown. */
export type UnsureReason = "no_hand" | "no_match" | "too_close" | "no_motion" | "unsteady";

export interface ClassScore {
  id: string;
  name: string;
  /** How alike the frame is to this move: best 3 examples and the averaged pattern, 0 to 1. */
  match: number;
  /** The single most alike example, 0 to 1. */
  closest: number;
  /** Share of the confidence, 0 to 1. All moves add up to 1. */
  share: number;
}

export interface Prediction {
  status: PredictionStatus;
  /** The recognised move, when status is "recognized". */
  classId: string | null;
  /** The move the frame looks most like, even when unsure. */
  closestId: string | null;
  /** How alike the frame is to the recognised (or closest) move, 0 to 1. */
  match: number;
  scores: ClassScore[];
  reason: UnsureReason | null;
}

export interface PredictInput {
  /** 44 numbers for this frame, or null without a person. */
  features: readonly number[] | null;
  hasPerson: boolean;
  isFaceOnly: boolean;
  hasHands: boolean;
  /** analyzeTemporalMotion() of the last 1.5 seconds. */
  motion: TemporalMotion;
}

export type TrainResult =
  | { success: true; classes: string[]; totalSamples: number }
  | { success: false; message: string };

interface Trained {
  mean: number[];
  /** Centred, unit-length examples per move. */
  vectors: Map<string, number[][]>;
  /** Centred, unit-length average per move. */
  centroids: Map<string, number[]>;
  /** Moves whose examples showed their movement, so testing checks for it too. */
  needsMotion: Set<string>;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function dot(a: readonly number[], b: readonly number[]) {
  let sum = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) sum += a[i] * b[i];
  return sum;
}

function unit(values: readonly number[]): number[] {
  const norm = Math.sqrt(dot(values, values));
  return norm > 1e-9 ? values.map((v) => v / norm) : values.map(() => 0);
}

function subtract(a: readonly number[], b: readonly number[]) {
  return a.map((v, i) => v - (b[i] ?? 0));
}

function average(vectors: readonly (readonly number[])[], length: number) {
  const sum = new Array<number>(length).fill(0);
  for (const v of vectors) for (let i = 0; i < length; i++) sum[i] += v[i] ?? 0;
  return sum.map((v) => v / Math.max(1, vectors.length));
}

const motionSeen = (motion: TemporalMotion | undefined, kind: ClassTraits["motion"]) =>
  kind === "wave" ? !!motion?.isWaving : kind === "clap" ? !!motion?.isClapping : kind === "walk" ? !!motion?.isWalking : false;

export class ActionClassifier {
  rejectionThreshold = DEFAULT_REJECTION_THRESHOLD;
  private classes: MoveClass[] = [];
  private traits = new Map<string, ClassTraits>();
  private dataset = new Map<string, ClassifierExample[]>();
  private trained: Trained | null = null;
  private history: Prediction[] = [];

  setRejectionThreshold(value: number) {
    this.rejectionThreshold = clamp(value, 0.45, 0.9);
  }

  /** Forget everything: moves, examples, the trained model and the vote. */
  reset() {
    this.classes = [];
    this.traits.clear();
    this.dataset.clear();
    this.trained = null;
    this.history = [];
  }

  setClasses(classes: readonly MoveClass[]) {
    this.reset();
    this.classes = classes.map((c) => ({ ...c }));
    for (const c of this.classes) {
      this.traits.set(c.id, classTraits(c.name));
      this.dataset.set(c.id, []);
    }
  }

  get isTrained() {
    return this.trained !== null;
  }

  exampleCount(classId?: string) {
    if (classId) return this.dataset.get(classId)?.length ?? 0;
    let total = 0;
    for (const list of this.dataset.values()) total += list.length;
    return total;
  }

  addExample(classId: string, example: ClassifierExample): boolean {
    const list = this.dataset.get(classId);
    if (!list || example.features.length === 0) return false;
    const length = list[0]?.features.length ?? this.firstLength();
    if (length !== null && example.features.length !== length) return false;
    list.push({ features: [...example.features], motion: example.motion });
    return true;
  }

  private firstLength(): number | null {
    for (const list of this.dataset.values()) if (list.length) return list[0].features.length;
    return null;
  }

  train(): TrainResult {
    const active = this.classes.filter((c) => (this.dataset.get(c.id)?.length ?? 0) > 0);
    if (active.length < 2) return { success: false, message: "Need at least 2 moves with examples" };

    const all = active.flatMap((c) => this.dataset.get(c.id) ?? []);
    const length = all[0].features.length;
    const mean = average(
      all.map((e) => e.features),
      length,
    );

    const vectors = new Map<string, number[][]>();
    const centroids = new Map<string, number[]>();
    const needsMotion = new Set<string>();
    for (const c of active) {
      const examples = this.dataset.get(c.id) ?? [];
      const centred = examples.map((e) => subtract(e.features, mean));
      vectors.set(c.id, centred.map(unit));
      centroids.set(c.id, unit(average(centred, length)));

      const kind = this.traits.get(c.id)?.motion ?? null;
      if (kind) {
        const seen = examples.filter((e) => motionSeen(e.motion, kind)).length;
        if (seen * 2 >= examples.length) needsMotion.add(c.id);
      }
    }

    this.trained = { mean, vectors, centroids, needsMotion };
    this.history = [];
    return { success: true, classes: active.map((c) => c.name), totalSamples: all.length };
  }

  /** One frame in, one steadied answer out. Call it for every analysed frame. */
  predict(input: PredictInput): Prediction {
    const trained = this.trained;
    if (!trained) return this.empty("not_trained");

    if (!input.hasPerson) return this.smoothAndReturn(this.empty("no_person"));

    // A whole-body move needs the torso in view.
    const needsBody = this.classes.some((c) => this.traits.get(c.id)?.needsBody);
    if (needsBody && input.isFaceOnly) return this.smoothAndReturn(this.empty("not_enough_info"));

    // Hand shapes only: no hand, no answer.
    const handsOnly = this.classes.every((c) => this.traits.get(c.id)?.needsHands);
    if (handsOnly && !input.hasHands) return this.smoothAndReturn({ ...this.empty("unknown"), reason: "no_hand" });

    if (!input.features) return this.smoothAndReturn(this.empty("no_person"));

    const query = unit(subtract(input.features, trained.mean));
    const raw = this.classes.flatMap((c) => {
      const vectors = trained.vectors.get(c.id);
      const centroid = trained.centroids.get(c.id);
      if (!vectors?.length || !centroid) return [];
      const sims = vectors.map((v) => clamp(dot(query, v), -1, 1)).sort((a, b) => b - a);
      const k = Math.min(TOP_K, sims.length);
      const top = sims.slice(0, k).reduce((a, b) => a + b, 0) / k;
      const combined = top * 0.7 + dot(query, centroid) * 0.3;
      return [{ id: c.id, name: c.name, combined, closest: sims[0] }];
    });
    if (raw.length === 0) return this.smoothAndReturn({ ...this.empty("unknown"), reason: "no_match" });

    const exps = raw.map((r) => Math.exp(r.combined * SHARPNESS));
    const total = exps.reduce((a, b) => a + b, 0) || 1;
    const scores: ClassScore[] = raw.map((r, i) => ({
      id: r.id,
      name: r.name,
      match: clamp(r.combined, 0, 1),
      closest: clamp(r.closest, 0, 1),
      share: exps[i] / total,
    }));

    let winner = scores.reduce((best, s) => (s.match > best.match || (s.match === best.match && s.share > best.share) ? s : best));
    const result = (status: PredictionStatus, reason: UnsureReason | null): Prediction => ({
      status,
      classId: status === "recognized" ? winner.id : null,
      closestId: winner.id,
      match: winner.match,
      scores,
      reason,
    });

    // Movement checks: a wave needs waving, a clap needs clapping, a walk needs walking.
    const kind = this.traits.get(winner.id)?.motion ?? null;
    if (kind && trained.needsMotion.has(winner.id) && !motionSeen(input.motion, kind)) {
      // Walking without walking: maybe it's the standing or sitting move.
      const still =
        kind === "walk"
          ? scores.find((s) => s.id !== winner.id && this.traits.get(s.id)?.still && s.closest >= this.rejectionThreshold)
          : undefined;
      if (still) winner = still;
      else return this.smoothAndReturn(result("unknown", "no_motion"));
    }

    // Not close enough to anything it was shown: it says so instead of guessing.
    if (winner.closest < this.rejectionThreshold || winner.match < this.rejectionThreshold) {
      return this.smoothAndReturn(result("unknown", "no_match"));
    }
    // Too close to call between two moves.
    if (scores.length > 1 && winner.share < MIN_WIN_SHARE) {
      return this.smoothAndReturn(result("unknown", "too_close"));
    }
    return this.smoothAndReturn(result("recognized", null));
  }

  private empty(status: PredictionStatus): Prediction {
    return { status, classId: null, closestId: null, match: 0, scores: [], reason: null };
  }

  /** The 10-frame vote: an answer must win at least 4 of the last 10 frames. */
  private smoothAndReturn(current: Prediction): Prediction {
    this.history.push(current);
    if (this.history.length > VOTE_WINDOW) this.history.shift();

    // Absence and "step back" show at once, without waiting for a majority.
    if (this.history.filter((p) => p.status === "no_person").length >= 4) return this.empty("no_person");
    if (this.history.filter((p) => p.status === "not_enough_info").length >= 4) return this.empty("not_enough_info");

    const votes = this.history.filter((p) => p.status === "recognized" && p.classId);
    if (votes.length >= 5) {
      const tally = new Map<string, number[]>();
      for (const v of votes) {
        if (v.classId) tally.set(v.classId, [...(tally.get(v.classId) ?? []), v.match]);
      }
      let leader: string | null = null;
      for (const [id, matches] of tally) {
        if (!leader || matches.length > (tally.get(leader)?.length ?? 0)) leader = id;
      }
      const leaderVotes = leader ? (tally.get(leader) ?? []) : [];
      if (leader && leaderVotes.length >= 4) {
        return {
          ...current,
          status: "recognized",
          classId: leader,
          closestId: leader,
          match: leaderVotes.reduce((a, b) => a + b, 0) / leaderVotes.length,
          reason: null,
        };
      }
    }

    return { ...current, status: "unknown", classId: null, reason: current.reason ?? "unsteady" };
  }
}

/**
 * Feeds the visitor's examples to a fresh model and trains it. Instant: it is
 * one average per move. (Was handleTrainingAnimationComplete in the original.)
 */
export function trainFromExamples(
  classifier: ActionClassifier,
  moves: readonly MoveClass[],
  examples: Readonly<Record<string, readonly ClassifierExample[]>>,
): TrainResult {
  classifier.setClasses(moves);
  for (const move of moves) {
    for (const example of examples[move.id] ?? []) classifier.addExample(move.id, example);
  }
  return classifier.train();
}
