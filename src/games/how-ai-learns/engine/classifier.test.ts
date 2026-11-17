import { beforeAll, describe, expect, test } from "bun:test";
import * as tf from "@tensorflow/tfjs";
import { disposeClassifier, predictEmbedding, trainClassifier, TrainingCancelled, type Example } from "./classifier";
import { l2Normalize } from "./vectors";

const DIM = 64;

/** Fake "embeddings": two clusters around different directions, like pens and cups. */
function cluster(label: string, center: number, n: number, seed: number): Example[] {
  let s = seed;
  const noise = () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296 - 0.5;
  };
  return Array.from({ length: n }, (_, i) => {
    const v = new Float32Array(DIM);
    for (let d = 0; d < DIM; d++) v[d] = Math.max(0, (d % 4 === center ? 1 : 0.1) + noise() * 0.3);
    return { id: `${label}${i}`, label, embedding: l2Normalize(v) };
  });
}

beforeAll(async () => {
  await tf.setBackend("cpu");
  await tf.ready();
});

describe("trainClassifier", () => {
  test("learns two groups and frees every tensor it made", async () => {
    const before = tf.memory().numTensors;
    const examples = [...cluster("Pen", 0, 8, 1), ...cluster("Cup", 2, 8, 2)];
    const epochs: number[] = [];
    const model = await trainClassifier(tf, examples, {
      holdOut: { val: 0, test: 0 },
      epochs: 30,
      learningRate: 0.01,
      onEpoch: (log) => {
        epochs.push(log.epoch);
      },
    });
    expect(model.labels).toEqual(["Cup", "Pen"]);
    expect(epochs).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
    expect(model.history.at(-1)?.accuracy).toBe(1);
    expect(model.counts).toEqual({ train: 16, val: 0, test: 0, duplicatesRemoved: 0 });

    const pen = cluster("Pen", 0, 1, 99)[0];
    const { decision } = await predictEmbedding(tf, model, pen.embedding, 0.6);
    expect(decision.answer).toBe("Pen");

    disposeClassifier(model);
    expect(tf.memory().numTensors).toBe(before);
  });

  test("a group with only 2 examples trains (the original threw)", async () => {
    const before = tf.memory().numTensors;
    const examples = [...cluster("Pen", 0, 2, 3), ...cluster("Cup", 2, 6, 4)];
    const model = await trainClassifier(tf, examples, { epochs: 5 });
    expect(model.counts.train + model.counts.val + model.counts.test).toBe(8);
    disposeClassifier(model);
    expect(tf.memory().numTensors).toBe(before);
  });

  test("drops duplicates before splitting", async () => {
    const pens = cluster("Pen", 0, 4, 5);
    const model = await trainClassifier(tf, [...pens, ...pens, ...cluster("Cup", 2, 4, 6)], {
      holdOut: { val: 0, test: 0 },
      epochs: 2,
    });
    expect(model.counts.duplicatesRemoved).toBe(4);
    expect(model.counts.train).toBe(8);
    disposeClassifier(model);
  });

  test("needs two groups", async () => {
    await expect(trainClassifier(tf, cluster("Pen", 0, 5, 7))).rejects.toThrow();
  });

  test("stops when asked, leaving no tensors behind", async () => {
    const before = tf.memory().numTensors;
    let rounds = 0;
    const run = trainClassifier(tf, [...cluster("Pen", 0, 6, 8), ...cluster("Cup", 2, 6, 9)], {
      epochs: 20,
      onEpoch: () => {
        rounds++;
      },
      shouldStop: () => rounds >= 3,
    });
    await expect(run).rejects.toBeInstanceOf(TrainingCancelled);
    expect(rounds).toBe(3);
    expect(tf.memory().numTensors).toBe(before);
  });

  test("training again and disposing does not grow memory", async () => {
    const before = tf.memory().numTensors;
    for (let i = 0; i < 3; i++) {
      const model = await trainClassifier(tf, [...cluster("Pen", 0, 5, 10 + i), ...cluster("Cup", 2, 5, 20 + i)], {
        holdOut: { val: 0, test: 0 },
        epochs: 3,
      });
      await predictEmbedding(tf, model, model.centroids[0], 0.7);
      disposeClassifier(model);
    }
    expect(tf.memory().numTensors).toBe(before);
  });
});
