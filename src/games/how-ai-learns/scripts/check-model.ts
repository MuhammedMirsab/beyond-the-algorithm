/**
 * Checks a MobileNet variant on the real library, the way the game uses it.
 * Runs in Bun on TF.js's CPU backend (slower than a browser, same numbers).
 *
 *   bun .../check-model.ts embed <modelDir> <out.json>
 *       Embeds every library photo with the model in <modelDir>.
 *   bun .../check-model.ts compare <a.json> <b.json>
 *       Largest difference between two embedding files (pruned vs full model).
 *   bun .../check-model.ts eval <embeddings.json> [--runs 10] [--ks 3,5,10] [--scenarios 0,3] [--epochs] [--lr] [--batch]
 *       Simulates visitors: k library examples per group, train the real
 *       classifier, test on the held-out photos, and try photos of other
 *       things to see whether it says "I don't know".
 *   bun .../check-model.ts similarities <embeddings.json> [--runs 30]
 *       Cosine similarity of new photos and of other things to the average
 *       example, and how many each candidate cutoff would reject.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { disposeClassifier, scoreEmbedding, trainClassifier, TRAINING_DEFAULTS, type Example } from "../engine/classifier";
import { drawFromPool, parseManifest, splitLibrary, type DatasetPhoto } from "../engine/dataset";
import { decide, outcomeOf, tally, type Outcome } from "../engine/rules";
import { centroid, cosineSimilarity } from "../engine/vectors";
import { extractEmbedding, loadFeatureExtractor, loadTf } from "../engine/vision";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, "../../../..");
const datasetDir = join(appRoot, "public/games/how-ai-learns/dataset");

const [command, ...rest] = process.argv.slice(2);
const option = (name: string, fallback: number) => {
  const i = rest.indexOf(name);
  return i >= 0 ? Number(rest[i + 1]) : fallback;
};

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const manifest = parseManifest(JSON.parse(readFileSync(join(datasetDir, "manifest.json"), "utf8")));

async function embedAll(modelDir: string, outFile: string) {
  const dir = resolve(modelDir);
  const fetchFn = async (url: string) => new Response(Bun.file(join(dir, url.replace("model://", ""))));
  const tf = await loadTf();
  console.log(`Backend: ${tf.getBackend()}`);
  let t0 = performance.now();
  await loadFeatureExtractor({ modelUrl: "model://model.json", fetchFn });
  console.log(`Model loaded in ${((performance.now() - t0) / 1000).toFixed(1)} s`);

  const out: Record<string, number[]> = {};
  // --limit n: only the first n photos of each category (quick comparisons).
  const limit = option("--limit", Infinity);
  const seen = new Map<string, number>();
  const photos = manifest.photos.filter((p) => {
    const n = (seen.get(p.category) ?? 0) + 1;
    seen.set(p.category, n);
    return n <= limit;
  });
  t0 = performance.now();
  for (const [i, photo] of photos.entries()) {
    const { data, info } = await sharp(join(datasetDir, photo.file)).rotate().removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const pixels = tf.tensor3d(Int32Array.from(data), [info.height, info.width, 3], "int32");
    try {
      out[photo.id] = Array.from(await extractEmbedding(pixels));
    } finally {
      pixels.dispose();
    }
    if ((i + 1) % 50 === 0) console.log(`  ${i + 1} of ${photos.length}`);
  }
  const ms = performance.now() - t0;
  console.log(`Embedded ${photos.length} photos in ${(ms / 1000).toFixed(1)} s (${(ms / photos.length).toFixed(0)} ms each on CPU)`);
  console.log(`Tensors left in memory: ${tf.memory().numTensors}`);
  writeFileSync(outFile, JSON.stringify(out));
}

function compare(a: string, b: string) {
  const ea = JSON.parse(readFileSync(a, "utf8")) as Record<string, number[]>;
  const eb = JSON.parse(readFileSync(b, "utf8")) as Record<string, number[]>;
  let max = 0;
  let n = 0;
  for (const [id, va] of Object.entries(ea)) {
    const vb = eb[id];
    if (!vb) continue;
    n++;
    for (let i = 0; i < va.length; i++) max = Math.max(max, Math.abs(va[i] - vb[i]));
  }
  console.log(`Compared ${n} photos: largest difference ${max.toExponential(2)}`);
}

interface Scenario {
  name: string;
  groups: string[];
}

const SCENARIOS: Scenario[] = [
  { name: "Pen vs Cup (default)", groups: ["pens", "cups"] },
  { name: "Cup vs Water bottle", groups: ["cups", "water-bottles"] },
  { name: "Computer mouse vs Mobile phone", groups: ["computer-mice", "mobile-phones"] },
  { name: "Pen vs Cup vs Keys", groups: ["pens", "cups", "keys"] },
];

const pct = (x: number) => `${(x * 100).toFixed(0)}%`;

async function evaluate(file: string) {
  const embeddings = JSON.parse(readFileSync(file, "utf8")) as Record<string, number[]>;
  const vec = (id: string) => Float32Array.from(embeddings[id]);
  const tf = await loadTf();
  const runs = option("--runs", 10);
  const epochs = option("--epochs", TRAINING_DEFAULTS.epochs);
  const learningRate = option("--lr", TRAINING_DEFAULTS.learningRate);
  const batchSize = option("--batch", TRAINING_DEFAULTS.batchSize);
  const listOption = (name: string, fallback: number[]) => {
    const i = rest.indexOf(name);
    return i >= 0 ? rest[i + 1].split(",").map(Number) : fallback;
  };
  const ks = listOption("--ks", [3, 5, 10, 20]);
  const scenarios = listOption("--scenarios", SCENARIOS.map((_, i) => i)).map((i) => SCENARIOS[i]);
  const thresholds = [0.5, 0.6, 0.7, 0.8, 0.9];
  const { pool, test } = splitLibrary(manifest.photos);
  console.log(`Backend ${tf.getBackend()}, ${runs} runs, epochs ${epochs}, lr ${learningRate}, batch ${batchSize}`);

  for (const scenario of scenarios) {
    console.log(`\n${scenario.name}`);
    const testPhotos = scenario.groups.flatMap((g) => test.get(g) ?? []);
    const others: DatasetPhoto[] = manifest.photos.filter((p) => !scenario.groups.includes(p.category));
    for (const k of ks) {
      const started = performance.now();
      const rng = mulberry32(1000 + k);
      const argmax: number[] = [];
      const outcomesAt = new Map<number, Outcome[]>(thresholds.map((t) => [t, []]));
      const topProbs: number[] = [];
      const inSims: number[] = [];
      const otherOutcomes: Outcome[] = [];
      const otherReasons = new Map<string, number>();
      const otherSims: number[] = [];
      const cutoffs: number[] = [];
      const finalAcc: number[] = [];
      const times: number[] = [];
      for (let r = 0; r < runs; r++) {
        const examples: Example[] = scenario.groups.flatMap((g) =>
          drawFromPool(pool.get(g) ?? [], new Set(), k, rng).map((p) => ({ id: p.id, label: p.label, embedding: vec(p.id) })),
        );
        const t0 = performance.now();
        const classifier = await trainClassifier(tf, examples, { holdOut: { val: 0, test: 0 }, epochs, learningRate, batchSize });
        times.push(performance.now() - t0);
        cutoffs.push(classifier.similarityCutoff);
        finalAcc.push(classifier.history.at(-1)?.accuracy ?? 0);
        let correct = 0;
        for (const photo of testPhotos) {
          const candidates = await scoreEmbedding(tf, classifier, vec(photo.id));
          if (candidates[0].label === photo.label) correct++;
          topProbs.push(candidates[0].probability);
          inSims.push(candidates[0].similarity);
          for (const t of thresholds) {
            const decision = decide(candidates, { threshold: t, similarityCutoff: classifier.similarityCutoff });
            outcomesAt.get(t)?.push(outcomeOf(decision, photo.label));
          }
        }
        argmax.push(correct / testPhotos.length);
        // Photos of things it was never taught: 16 random ones per run.
        const sample = drawFromPool(others, new Set(), Math.min(others.length, 16), rng);
        for (const photo of sample) {
          const candidates = await scoreEmbedding(tf, classifier, vec(photo.id));
          const decision = decide(candidates, { threshold: 0.7, similarityCutoff: classifier.similarityCutoff });
          otherOutcomes.push(outcomeOf(decision, photo.label));
          otherSims.push(candidates[0].similarity);
          const key = decision.reason ?? "answered";
          otherReasons.set(key, (otherReasons.get(key) ?? 0) + 1);
        }
        disposeClassifier(classifier);
      }
      const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
      const sorted = [...topProbs].sort((a, b) => a - b);
      const line = thresholds
        .map((t) => {
          const s = tally(outcomesAt.get(t) ?? []);
          return `@${t}: ${pct(s.right / s.total)} right ${pct(s.wrong / s.total)} wrong ${pct(s.unknown / s.total)} unsure`;
        })
        .join(" | ");
      const o = tally(otherOutcomes);
      console.log(
        `  k=${String(k).padStart(2)}: test accuracy ${pct(mean(argmax))} (min ${pct(Math.min(...argmax))}), ` +
          `final train acc ${pct(mean(finalAcc))}, top prob median ${sorted[Math.floor(sorted.length / 2)].toFixed(2)} ` +
          `p10 ${sorted[Math.floor(sorted.length / 10)].toFixed(2)}, cutoff ${mean(cutoffs).toFixed(3)}, ` +
          `sim in ${mean(inSims).toFixed(3)} vs other ${mean(otherSims).toFixed(3)}, train ${mean(times).toFixed(0)} ms ` +
          `(${((performance.now() - started) / 1000).toFixed(0)} s for ${runs} runs)`,
      );
      console.log(`         ${line}`);
      console.log(
        `         other things @0.7: ${pct(o.unknown / o.total)} "I don't know" ` +
          `(${[...otherReasons].map(([k2, v]) => `${k2} ${v}`).join(", ")})`,
      );
    }
  }
  console.log(`\nTensors left in memory: ${tf.memory().numTensors}`);
}

/**
 * How far new photos sit from the average example (cosine similarity), with
 * no TF.js: the numbers behind the "doesn’t look like its examples" rule.
 */
function similarities(file: string) {
  const embeddings = JSON.parse(readFileSync(file, "utf8")) as Record<string, number[]>;
  const vec = (id: string) => Float32Array.from(embeddings[id]);
  const { pool, test } = splitLibrary(manifest.photos);
  const draws = option("--runs", 30);
  const q = (xs: number[], f: number) => {
    const s = [...xs].sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.max(0, Math.floor(f * (s.length - 1))))];
  };
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
  for (const scenario of SCENARIOS) {
    console.log(`
${scenario.name}`);
    for (const k of [3, 5, 10, 20]) {
      const rng = mulberry32(77 + k);
      const self: number[] = [];
      const loo: number[] = [];
      const inDist: number[] = [];
      const ood: number[] = [];
      for (let r = 0; r < draws; r++) {
        const groups = scenario.groups.map((g) => drawFromPool(pool.get(g) ?? [], new Set(), k, rng).map((p) => vec(p.id)));
        const dim = groups[0][0].length;
        const cents = groups.map((g) => centroid(g, dim));
        groups.forEach((g, gi) => {
          for (const [i, v] of g.entries()) {
            self.push(cosineSimilarity(v, cents[gi]));
            if (g.length > 1) loo.push(cosineSimilarity(v, centroid(g.filter((_, j) => j !== i), dim)));
          }
        });
        scenario.groups.forEach((g, gi) => {
          for (const p of test.get(g) ?? []) inDist.push(cosineSimilarity(vec(p.id), cents[gi]));
        });
        for (const p of manifest.photos.filter((x) => !scenario.groups.includes(x.category))) {
          ood.push(Math.max(...cents.map((c) => cosineSimilarity(vec(p.id), c))));
        }
      }
      const original = Math.max(0.42, Math.min(0.68, mean(self) * 0.72));
      const rate = (xs: number[], cut: number) => `${((xs.filter((x) => x < cut).length / xs.length) * 100).toFixed(0)}%`;
      console.log(
        `  k=${String(k).padStart(2)}: self ${mean(self).toFixed(3)} loo ${mean(loo).toFixed(3)} | new photos mean ${mean(inDist).toFixed(3)} p5 ${q(inDist, 0.05).toFixed(3)} p10 ${q(inDist, 0.1).toFixed(3)} | other things mean ${mean(ood).toFixed(3)} p50 ${q(ood, 0.5).toFixed(3)} p90 ${q(ood, 0.9).toFixed(3)}`,
      );
      for (const cut of [original, 0.42, 0.45, 0.48, 0.5]) {
        console.log(`         cutoff ${cut.toFixed(3)}${cut === original ? " (original rule)" : ""}: rejects ${rate(inDist, cut)} of new photos, ${rate(ood, cut)} of other things`);
      }
    }
  }
}

if (command === "embed") await embedAll(rest[0], rest[1]);
else if (command === "compare") compare(rest[0], rest[1]);
else if (command === "eval") await evaluate(rest[0]);
else if (command === "similarities") similarities(rest[0]);
else console.log("Usage: check-model.ts embed <modelDir> <out.json> | compare <a.json> <b.json> | eval <embeddings.json>");
