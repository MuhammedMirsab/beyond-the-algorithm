/**
 * The photo library: the public manifest written by scripts/build-dataset.ts,
 * and the split that keeps test photos out of training.
 *
 * Pure functions only (no DOM, no TF.js), so tests and scripts can use them.
 */

import { shuffleWithSeed } from "./split";

export const DATASET_BASE = "/games/how-ai-learns/dataset";
export const MANIFEST_URL = `${DATASET_BASE}/manifest.json`;

export interface DatasetCategory {
  /** Folder name, e.g. "pens". */
  id: string;
  /** Singular label, e.g. "Pen". */
  label: string;
  /** Plural in words, e.g. "pens". */
  plural: string;
  count: number;
}

export interface DatasetPhoto {
  id: string;
  category: string;
  label: string;
  /** Path inside the dataset folder, e.g. "pens/img_pens_abe4901f.jpg". */
  file: string;
  width: number;
  height: number;
  /** The file's title on Wikimedia Commons. */
  title: string;
  author: string | null;
  license: string;
  licenseUrl: string | null;
  sourceUrl: string;
}

export interface DatasetManifest {
  version: 1;
  source: string;
  categories: DatasetCategory[];
  photos: DatasetPhoto[];
}

export const photoUrl = (photo: Pick<DatasetPhoto, "file">) => `${DATASET_BASE}/${photo.file}`;

/** Narrow unknown JSON to a manifest. Throws with a readable reason. */
export function parseManifest(json: unknown): DatasetManifest {
  if (!json || typeof json !== "object") throw new Error("Manifest is not an object");
  const m = json as Partial<DatasetManifest>;
  if (m.version !== 1 || !Array.isArray(m.categories) || !Array.isArray(m.photos)) {
    throw new Error("Manifest has the wrong shape");
  }
  for (const p of m.photos) {
    if (!p || typeof p.id !== "string" || typeof p.category !== "string" || typeof p.file !== "string") {
      throw new Error("Manifest has a broken photo entry");
    }
  }
  return m as DatasetManifest;
}

/* ── The held-out split ─────────────────────────────────────────── */

/** FNV-1a: a stable 32-bit number for a string. */
export function hashString(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/** Photos per category that are only ever used for testing. */
export const TEST_PER_CATEGORY = 5;
/** Fixed seed: every visitor gets the same test photos, so results compare. */
export const LIBRARY_SEED = 2026;

export interface LibrarySplit {
  /** Photos that can be added as examples. */
  pool: Map<string, DatasetPhoto[]>;
  /** Held-out photos, never used for training. */
  test: Map<string, DatasetPhoto[]>;
}

/**
 * Per category, a seeded shuffle; the first TEST_PER_CATEGORY photos become
 * the test set and the rest the example pool. Disjoint by construction.
 * A category too small to spare test photos gets none (and keeps its pool).
 */
export function splitLibrary(
  photos: DatasetPhoto[],
  { testPerCategory = TEST_PER_CATEGORY, seed = LIBRARY_SEED }: { testPerCategory?: number; seed?: number } = {},
): LibrarySplit {
  const byCategory = new Map<string, DatasetPhoto[]>();
  for (const photo of photos) {
    const list = byCategory.get(photo.category) ?? [];
    list.push(photo);
    byCategory.set(photo.category, list);
  }

  const pool = new Map<string, DatasetPhoto[]>();
  const test = new Map<string, DatasetPhoto[]>();
  for (const [category, list] of byCategory) {
    // Sort first, and seed by category name, so the split never depends on manifest order.
    const sorted = [...list].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const shuffled = shuffleWithSeed(sorted, (seed + hashString(category)) >>> 0);
    // Keep at least half of a small category for examples.
    const n = Math.min(testPerCategory, Math.floor(shuffled.length / 2));
    test.set(category, shuffled.slice(0, n));
    pool.set(category, shuffled.slice(n));
  }
  return { pool, test };
}

/**
 * "Add 10 from the library": up to `count` random photos from the pool that
 * are not already examples. Never touches the test set.
 */
export function drawFromPool(
  pool: DatasetPhoto[],
  taken: ReadonlySet<string>,
  count: number,
  random: () => number = Math.random,
): DatasetPhoto[] {
  const available = pool.filter((p) => !taken.has(p.id));
  // Fisher-Yates on a copy, only as far as we need.
  const out = [...available];
  const n = Math.min(count, out.length);
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(random() * (out.length - i));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out.slice(0, n);
}
