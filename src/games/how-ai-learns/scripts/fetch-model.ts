/**
 * Downloads a MobileNet v2 graph model (TF.js format, from TF Hub / Kaggle)
 * so the game never loads it from a CDN on the day.
 *
 *   bun src/games/how-ai-learns/scripts/fetch-model.ts [--alpha 0.5|1.0] [--out <dir>] [--embedding-only]
 *
 * --out defaults to public/games/how-ai-learns/model (rebuilt from scratch).
 *
 * --embedding-only drops the 1,001-class ImageNet layer that sits after the
 * pooled 1,280 numbers. The game only reads those numbers (the "embedding"),
 * and that one layer is 5 MB of the download. The pruned graph's output is
 * the pooling node itself, so @tensorflow-models/mobilenet's warm-up predict()
 * and infer(img, true) both keep working; classify() would not, and the game
 * never calls it. scripts/check-model.ts verifies the embeddings match the
 * full model exactly.
 */

import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, "../../../..");

const args = process.argv.slice(2);
const option = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const alpha = option("--alpha") ?? "0.5";
const outDir = resolve(option("--out") ?? join(appRoot, "public/games/how-ai-learns/model"));
const embeddingOnly = args.includes("--embedding-only");

const HANDLES: Record<string, string> = {
  "0.5": "https://tfhub.dev/google/imagenet/mobilenet_v2_050_224/classification/2",
  "1.0": "https://tfhub.dev/google/imagenet/mobilenet_v2_100_224/classification/2",
};
const EMBEDDING_NODE = "module_apply_default/MobilenetV2/Logits/AvgPool";
const LOGITS_PREFIX = "module_apply_default/MobilenetV2/Logits/";
const SHARD_BYTES = 4 * 1024 * 1024;

interface WeightEntry {
  name: string;
  shape: number[];
  dtype: string;
  quantization?: unknown;
}
interface ModelJson {
  format?: string;
  generatedBy?: string;
  convertedBy?: string;
  modelTopology: { node: { name: string; op: string; input?: string[] }[]; [key: string]: unknown };
  weightsManifest: { paths: string[]; weights: WeightEntry[] }[];
  [key: string]: unknown;
}

async function get(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`${res.status} for ${url}`);
  return res.arrayBuffer();
}

function bytesOf(w: WeightEntry): number {
  if (w.quantization) throw new Error(`Quantized weight ${w.name} is not supported by the pruner`);
  const n = w.shape.reduce((a, b) => a * b, 1);
  if (w.dtype === "float32" || w.dtype === "int32") return n * 4;
  throw new Error(`Unexpected dtype ${w.dtype} for ${w.name}`);
}

async function main() {
  const handle = HANDLES[alpha];
  if (!handle) throw new Error(`--alpha must be one of ${Object.keys(HANDLES).join(", ")}`);

  console.log(`Downloading MobileNet v2 alpha ${alpha} from ${handle}`);
  const json = JSON.parse(new TextDecoder().decode(await get(`${handle}/model.json?tfjs-format=file`))) as ModelJson;
  if (json.format !== "graph-model") throw new Error(`Unexpected model format ${String(json.format)}`);
  if (!json.modelTopology.node.some((n) => n.name === EMBEDDING_NODE)) throw new Error("Embedding node is missing");

  // All shards in manifest order make one contiguous buffer per group.
  const groups: { entries: WeightEntry[]; buffer: Uint8Array }[] = [];
  let downloaded = 0;
  for (const group of json.weightsManifest) {
    const parts: Uint8Array[] = [];
    for (const path of group.paths) {
      const part = new Uint8Array(await get(`${handle}/${path}?tfjs-format=file`));
      parts.push(part);
      downloaded += part.byteLength;
    }
    const total = parts.reduce((a, p) => a + p.byteLength, 0);
    const expected = group.weights.reduce((a, w) => a + bytesOf(w), 0);
    if (total !== expected) throw new Error(`Weight bytes ${total} do not match the manifest (${expected})`);
    const buffer = new Uint8Array(total);
    let offset = 0;
    for (const p of parts) {
      buffer.set(p, offset);
      offset += p.byteLength;
    }
    groups.push({ entries: group.weights, buffer });
  }
  console.log(`Downloaded ${(downloaded / 1024 / 1024).toFixed(2)} MB of weights`);

  let nodes = json.modelTopology.node;
  if (embeddingOnly) {
    // Keep only what the embedding node depends on (walk its inputs back to
    // the image placeholder). Everything else is the ImageNet classifier.
    const byName = new Map(nodes.map((n) => [n.name, n]));
    const clean = (input: string) => input.replace(/^\^/, "").split(":")[0];
    const keep = new Set<string>();
    const stack = [EMBEDDING_NODE];
    while (stack.length) {
      const name = stack.pop();
      if (name === undefined || keep.has(name)) continue;
      keep.add(name);
      for (const input of byName.get(name)?.input ?? []) stack.push(clean(input));
    }
    const dropped = nodes.filter((n) => !keep.has(n.name)).map((n) => n.name);
    if (dropped.some((name) => !name.includes(LOGITS_PREFIX.replace("module_apply_default/", "")))) {
      throw new Error(`Pruning would drop nodes outside the classifier: ${dropped.join(", ")}`);
    }
    nodes = nodes.filter((n) => keep.has(n.name));
    console.log(`Dropped ${dropped.length} nodes after the embedding: ${dropped.join(", ")}`);
  }
  const constNames = new Set(nodes.filter((n) => n.op === "Const").map((n) => n.name));

  // Re-pack the kept weights, in manifest order, into <= 4 MB shards.
  const keptEntries: WeightEntry[] = [];
  const keptParts: Uint8Array[] = [];
  for (const group of groups) {
    let offset = 0;
    for (const entry of group.entries) {
      const size = bytesOf(entry);
      if (!embeddingOnly || constNames.has(entry.name)) {
        keptEntries.push(entry);
        keptParts.push(group.buffer.subarray(offset, offset + size));
      }
      offset += size;
    }
  }
  const keptBytes = keptParts.reduce((a, p) => a + p.byteLength, 0);
  const packed = new Uint8Array(keptBytes);
  let at = 0;
  for (const p of keptParts) {
    packed.set(p, at);
    at += p.byteLength;
  }
  const shardCount = Math.max(1, Math.ceil(keptBytes / SHARD_BYTES));
  const paths = Array.from({ length: shardCount }, (_, i) => `group1-shard${i + 1}of${shardCount}.bin`);

  const out: ModelJson = {
    ...json,
    modelTopology: { ...json.modelTopology, node: nodes },
    weightsManifest: [{ paths, weights: keptEntries }],
  };

  if (existsSync(outDir)) rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "model.json"), JSON.stringify(out));
  paths.forEach((path, i) => writeFileSync(join(outDir, path), packed.subarray(i * SHARD_BYTES, (i + 1) * SHARD_BYTES)));
  console.log(
    `Wrote model.json + ${shardCount} shard(s), ${(keptBytes / 1024 / 1024).toFixed(2)} MB of weights ` +
      `(${keptEntries.length} tensors) to ${outDir}`,
  );
}

await main();
