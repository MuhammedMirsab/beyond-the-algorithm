/**
 * The small last layer the visitor trains on top of MobileNet's numbers.
 * Copied from the original trainTransferClassifier / predictWithClassifier
 * (dedupe, seeded stratified split, Dense 128 -> Dropout -> softmax, Adam,
 * per-epoch progress, centroids and the open-set cutoff), with these fixes:
 *
 * - The open-set cutoff uses leave-one-out similarities (see step 4).
 *
 * - Works on embeddings, so photos are read once and cached by the caller.
 * - Never throws for a group with fewer than 3 examples (see split.ts).
 * - Every tensor is disposed, also when training fails or is cancelled;
 *   the caller disposes a replaced model with disposeClassifier().
 * - No invented numbers: the original added 11.5 ms to every latency.
 *
 * TF.js is passed in (`tf`), so this file never imports it at module scope
 * and the browser can load it lazily.
 */

import type * as TF from "@tensorflow/tfjs";
import { decide, NONE_LABEL, rankCandidates, similarityCutoffFrom, type Candidate, type Decision } from "./rules";
import { DEFAULT_HOLD_OUT, dedupe, stratifiedSplit, type HoldOut } from "./split";
import { centroid, cosineSimilarity, leaveOneOutSimilarities } from "./vectors";

export type Tf = typeof TF;

export interface Example {
  /** Photo id: library id or a camera photo id. */
  id: string;
  label: string;
  /** L2-normalised embedding. */
  embedding: Float32Array;
}

export interface EpochLog {
  epoch: number;
  totalEpochs: number;
  /** Share of training examples it labels right, 0 to 1. */
  accuracy: number;
  loss: number;
  /** Share of validation examples it labels right, when there are any. */
  valAccuracy: number | null;
}

export interface TrainOptions {
  epochs?: number;
  learningRate?: number;
  batchSize?: number;
  /** Share held out from the examples. The original used 15% + 15%. */
  holdOut?: HoldOut;
  /** Seed for the starting weights, so the same examples train the same way. */
  seed?: number;
  /** Awaited, so the browser can paint each epoch before the next one. */
  onEpoch?: (log: EpochLog) => void | Promise<void>;
  /** Checked after every epoch; true stops training and throws TrainingCancelled. */
  shouldStop?: () => boolean;
}

export interface Classifier {
  head: TF.Sequential;
  labels: string[];
  embeddingDim: number;
  /** One normalised "average example" per label, same order as labels. */
  centroids: Float32Array[];
  similarityCutoff: number;
  history: EpochLog[];
  counts: { train: number; val: number; test: number; duplicatesRemoved: number };
  /** Accuracy on the held-out part of the examples, if any was held out. */
  testAccuracy: number | null;
}

export class TrainingCancelled extends Error {
  constructor() {
    super("Training was cancelled");
    this.name = "TrainingCancelled";
  }
}

/**
 * The original's 24 epochs and batch 16, with its "Fast" learning rate
 * (0.003 instead of 0.0015). Checked on the real library with
 * scripts/check-model.ts (held-out photos, threshold 70%):
 * - Pen vs cup, 10 examples each: 100% right at both rates.
 * - Pen vs cup, 3 each: 70% right, 30% "I don't know" at both rates.
 * - Pen, cup and keys, 5 each: 78% right at 0.003 vs 53% at 0.0015 (the
 *   rest "I don't know"; 0 wrong either way).
 */
export const TRAINING_DEFAULTS = {
  epochs: 24,
  learningRate: 0.003,
  batchSize: 16,
  seed: 7,
} as const;

function toTensors(tf: Tf, items: Example[], labels: string[], dim: number) {
  const xFlat = new Float32Array(items.length * dim);
  const yIdx = new Int32Array(items.length);
  items.forEach((it, i) => {
    xFlat.set(it.embedding, i * dim);
    yIdx[i] = labels.indexOf(it.label);
  });
  const x = tf.tensor2d(xFlat, [items.length, dim]);
  const y = tf.tidy(() => tf.oneHot(tf.tensor1d(yIdx, "int32"), labels.length));
  return { x, y };
}

function buildHead(tf: Tf, dim: number, classes: number, seed: number): TF.Sequential {
  const head = tf.sequential();
  head.add(
    tf.layers.dense({
      units: 128,
      activation: "relu",
      inputShape: [dim],
      kernelRegularizer: tf.regularizers.l2({ l2: 1e-4 }),
      kernelInitializer: tf.initializers.glorotUniform({ seed }),
    }),
  );
  head.add(tf.layers.dropout({ rate: 0.25, seed: seed + 1 }));
  head.add(
    tf.layers.dense({
      units: classes,
      activation: "softmax",
      kernelInitializer: tf.initializers.glorotUniform({ seed: seed + 2 }),
    }),
  );
  return head;
}

const logNumber = (logs: TF.Logs | undefined, ...keys: string[]) => {
  for (const key of keys) {
    const v = logs?.[key];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return null;
};

export async function trainClassifier(tf: Tf, examples: Example[], options: TrainOptions = {}): Promise<Classifier> {
  const epochs = options.epochs ?? TRAINING_DEFAULTS.epochs;
  const learningRate = options.learningRate ?? TRAINING_DEFAULTS.learningRate;
  const seed = options.seed ?? TRAINING_DEFAULTS.seed;
  const holdOut = options.holdOut ?? DEFAULT_HOLD_OUT;

  // 1. Deduplicate before splitting, so no photo is both trained on and held out.
  const { items: unique, removed } = dedupe(examples, (e) => `${e.label}::${e.id}`);
  const labels = Array.from(new Set(unique.map((e) => e.label))).sort();
  if (labels.length < 2) throw new Error("Training needs examples of at least two things.");
  const dim = unique[0].embedding.length;

  // 2. Stratified, seeded split per label.
  const split = stratifiedSplit(unique, (e) => e.label, holdOut);
  const { train, val, test } = split;

  const trainT = toTensors(tf, train, labels, dim);
  const valT = val.length ? toTensors(tf, val, labels, dim) : null;
  const head = buildHead(tf, dim, labels.length, seed);
  const optimizer = tf.train.adam(learningRate);
  head.compile({ optimizer, loss: "categoricalCrossentropy", metrics: ["accuracy"] });

  const history: EpochLog[] = [];
  let cancelled = false;
  try {
    await head.fit(trainT.x, trainT.y, {
      epochs,
      batchSize: Math.max(1, Math.min(options.batchSize ?? TRAINING_DEFAULTS.batchSize, train.length)),
      shuffle: true,
      validationData: valT ? [valT.x, valT.y] : undefined,
      callbacks: {
        onEpochEnd: async (epoch, logs) => {
          const log: EpochLog = {
            epoch: epoch + 1,
            totalEpochs: epochs,
            accuracy: logNumber(logs, "acc", "accuracy") ?? 0,
            loss: logNumber(logs, "loss") ?? 0,
            valAccuracy: valT ? logNumber(logs, "val_acc", "val_accuracy") : null,
          };
          history.push(log);
          await options.onEpoch?.(log);
          if (options.shouldStop?.()) {
            cancelled = true;
            head.stopTraining = true;
          }
        },
      },
    });
    if (cancelled) throw new TrainingCancelled();

    // 3. Held-out test part of the examples, if the caller asked for one.
    let testAccuracy: number | null = null;
    if (test.length) {
      const testT = toTensors(tf, test, labels, dim);
      try {
        const predicted = tf.tidy(() => (head.predict(testT.x) as TF.Tensor).argMax(1));
        const idx = (await predicted.data()) as Int32Array;
        predicted.dispose();
        let correct = 0;
        test.forEach((t, i) => {
          if (labels[idx[i]] === t.label) correct++;
        });
        testAccuracy = correct / test.length;
      } finally {
        testT.x.dispose();
        testT.y.dispose();
      }
    }

    // 4. Centroids and the open-set cutoff, from the training part only.
    const byLabel = labels.map((label) => train.filter((t) => t.label === label).map((t) => t.embedding));
    const centroids = byLabel.map((vectors) => centroid(vectors, dim));
    // How close each example is to the average of the *other* examples: what a
    // new photo of the same thing can expect. (The original compared examples
    // with an average that included themselves, which overstates closeness
    // with few examples and made it refuse most new photos at 3 to 5 each.)
    // The "No object" group is a mix of anything else, so it is left out.
    const intra = byLabel.flatMap((vectors, i) => (labels[i] === NONE_LABEL ? [] : leaveOneOutSimilarities(vectors, dim)));

    return {
      head,
      labels,
      embeddingDim: dim,
      centroids,
      similarityCutoff: similarityCutoffFrom(intra),
      history,
      counts: { train: train.length, val: val.length, test: test.length, duplicatesRemoved: removed },
      testAccuracy,
    };
  } catch (error) {
    head.dispose();
    throw error;
  } finally {
    trainT.x.dispose();
    trainT.y.dispose();
    valT?.x.dispose();
    valT?.y.dispose();
    // Adam keeps its own moment tensors; the model no longer needs them.
    optimizer.dispose();
  }
}

/** Probabilities and similarities for one embedding, highest probability first. */
export async function scoreEmbedding(tf: Tf, classifier: Classifier, embedding: Float32Array): Promise<Candidate[]> {
  const out = tf.tidy(() => classifier.head.predict(tf.tensor2d(embedding, [1, classifier.embeddingDim])) as TF.Tensor);
  let probs: Float32Array;
  try {
    probs = (await out.data()) as Float32Array;
  } finally {
    out.dispose();
  }
  return rankCandidates(
    classifier.labels.map((label, i) => ({
      label,
      probability: probs[i] ?? 0,
      similarity: cosineSimilarity(embedding, classifier.centroids[i]),
    })),
  );
}

export async function predictEmbedding(
  tf: Tf,
  classifier: Classifier,
  embedding: Float32Array,
  threshold: number,
): Promise<{ candidates: Candidate[]; decision: Decision }> {
  const candidates = await scoreEmbedding(tf, classifier, embedding);
  return { candidates, decision: decide(candidates, { threshold, similarityCutoff: classifier.similarityCutoff }) };
}

export function disposeClassifier(classifier: Classifier | null | undefined) {
  if (!classifier) return;
  try {
    classifier.head.dispose();
  } catch {
    // Already disposed.
  }
}
