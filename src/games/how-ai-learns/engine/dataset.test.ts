import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DROPPED_CATEGORIES, EXCLUDED_PHOTOS } from "./curation";
import { drawFromPool, parseManifest, splitLibrary, TEST_PER_CATEGORY, type DatasetPhoto } from "./dataset";

const manifestPath = fileURLToPath(new URL("../../../../public/games/how-ai-learns/dataset/manifest.json", import.meta.url));
const manifest = parseManifest(JSON.parse(readFileSync(manifestPath, "utf8")));

function fakePhotos(category: string, n: number): DatasetPhoto[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `${category}_${String(i).padStart(3, "0")}`,
    category,
    label: category,
    file: `${category}/${i}.jpg`,
    width: 100,
    height: 100,
    title: `${category} ${i}`,
    author: null,
    license: "CC0",
    licenseUrl: null,
    sourceUrl: "https://example.org",
  }));
}

/** Seeded RNG for repeatable "Add 10 from the library" draws. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("the shipped library", () => {
  test("has complete categories with licences", () => {
    expect(manifest.categories.length).toBeGreaterThanOrEqual(2);
    for (const c of manifest.categories) {
      const photos = manifest.photos.filter((p) => p.category === c.id);
      expect(photos.length).toBe(c.count);
      expect(photos.length).toBeGreaterThanOrEqual(24);
      expect(photos.some((p) => p.id === c.cover)).toBe(true);
      expect(DROPPED_CATEGORIES[c.id]).toBeUndefined();
    }
    for (const p of manifest.photos) expect(EXCLUDED_PHOTOS.has(p.id)).toBe(false);
    for (const p of manifest.photos) {
      expect(p.license.length).toBeGreaterThan(0);
      expect(p.sourceUrl).toStartWith("https://commons.wikimedia.org/");
    }
    expect(new Set(manifest.photos.map((p) => p.id)).size).toBe(manifest.photos.length);
  });

  test("the test split never overlaps the example pool", () => {
    const { pool, test: held } = splitLibrary(manifest.photos);
    for (const c of manifest.categories) {
      const poolIds = new Set((pool.get(c.id) ?? []).map((p) => p.id));
      const testIds = (held.get(c.id) ?? []).map((p) => p.id);
      expect(testIds.length).toBe(TEST_PER_CATEGORY);
      for (const id of testIds) expect(poolIds.has(id)).toBe(false);
      expect(poolIds.size + testIds.length).toBe(c.count);
    }
  });

  test("adding every library photo as an example never adds a test photo", () => {
    const { pool, test: held } = splitLibrary(manifest.photos);
    const testIds = new Set([...held.values()].flat().map((p) => p.id));
    const random = rng(7);
    for (const c of manifest.categories) {
      const taken = new Set<string>();
      // Press "Add 10 from the library" until it runs out.
      for (let press = 0; press < 10; press++) {
        for (const p of drawFromPool(pool.get(c.id) ?? [], taken, 10, random)) {
          expect(taken.has(p.id)).toBe(false);
          taken.add(p.id);
        }
      }
      expect(taken.size).toBe((pool.get(c.id) ?? []).length);
      for (const id of taken) expect(testIds.has(id)).toBe(false);
    }
  });

  test("the split is the same for every visitor and every manifest order", () => {
    const a = splitLibrary(manifest.photos);
    const b = splitLibrary([...manifest.photos].reverse());
    for (const c of manifest.categories) {
      expect((b.test.get(c.id) ?? []).map((p) => p.id)).toEqual((a.test.get(c.id) ?? []).map((p) => p.id));
    }
  });
});

describe("splitLibrary edge cases", () => {
  test("a small category keeps at least half its photos for examples", () => {
    const { pool, test: held } = splitLibrary(fakePhotos("tiny", 4));
    expect(held.get("tiny")?.length).toBe(2);
    expect(pool.get("tiny")?.length).toBe(2);
    const one = splitLibrary(fakePhotos("one", 1));
    expect(one.test.get("one")?.length).toBe(0);
    expect(one.pool.get("one")?.length).toBe(1);
  });
});

describe("drawFromPool", () => {
  const pool = fakePhotos("pens", 25);

  test("skips photos already taken and returns at most count", () => {
    const taken = new Set(pool.slice(0, 20).map((p) => p.id));
    const drawn = drawFromPool(pool, taken, 10, rng(1));
    expect(drawn.length).toBe(5);
    for (const p of drawn) expect(taken.has(p.id)).toBe(false);
  });

  test("returns distinct photos", () => {
    const drawn = drawFromPool(pool, new Set(), 10, rng(2));
    expect(new Set(drawn.map((p) => p.id)).size).toBe(10);
  });

  test("an empty pool gives nothing", () => {
    expect(drawFromPool([], new Set(), 10)).toEqual([]);
  });
});
