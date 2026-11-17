/**
 * Builds the game's photo library from the original app's dataset.
 *
 *   bun src/games/how-ai-learns/scripts/build-dataset.ts [sourceDataDir] [--authors]
 *
 * sourceDataDir defaults to ../see-how-ai-learns/.data next to this app.
 *
 * Rules:
 * - Only photos listed in the original dataset-manifest.json are considered,
 *   and only if the file on disk matches the manifest's SHA-256. Anything else
 *   has an unknown licence and is never shipped.
 * - Only categories with at least MIN_PER_CATEGORY such photos are kept.
 * - Up to PER_CATEGORY photos per category, best quality score first.
 * - --authors asks the Wikimedia Commons API for each photo's author (the
 *   original manifest has none). Without it, credits link to the source page.
 *
 * Writes public/games/how-ai-learns/dataset/<category>/<id>.jpg and
 * public/games/how-ai-learns/dataset/manifest.json. The folder is rebuilt
 * from scratch every run.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BUILT_IN_CATEGORIES, pluralFromSlug } from "../engine/categories";
import type { DatasetCategory, DatasetManifest, DatasetPhoto } from "../engine/dataset";

const PER_CATEGORY = 30;
const MIN_PER_CATEGORY = 30;

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, "../../../..");
const args = process.argv.slice(2);
const wantAuthors = args.includes("--authors");
const sourceDir = resolve(args.find((a) => !a.startsWith("--")) ?? join(appRoot, "../see-how-ai-learns/.data"));
const outDir = join(appRoot, "public/games/how-ai-learns/dataset");

interface SourceEntry {
  imageId: string;
  categorySlug: string;
  categoryName: string;
  title: string;
  storagePath: string;
  source: string;
  sourceUrl: string;
  license: string;
  sha256: string;
  qualityScore: number;
}

function isSourceEntry(value: unknown): value is SourceEntry {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.imageId === "string" &&
    typeof v.categorySlug === "string" &&
    typeof v.categoryName === "string" &&
    typeof v.title === "string" &&
    typeof v.storagePath === "string" &&
    typeof v.sourceUrl === "string" &&
    typeof v.license === "string" &&
    typeof v.sha256 === "string" &&
    typeof v.qualityScore === "number"
  );
}

/** Width and height from a JPEG's start-of-frame marker. */
function jpegSize(buf: Uint8Array): { width: number; height: number } | null {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = buf[i + 1];
    if (marker === 0xff) {
      i++;
      continue;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      i += 2;
      continue;
    }
    const length = (buf[i + 2] << 8) | buf[i + 3];
    const isFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isFrame) {
      return { height: (buf[i + 5] << 8) | buf[i + 6], width: (buf[i + 7] << 8) | buf[i + 8] };
    }
    i += 2 + length;
  }
  return null;
}

/** "CC BY-SA 3.0 de" → https://creativecommons.org/licenses/by-sa/3.0/de/ */
function licenseUrl(license: string): string | null {
  const l = license.trim();
  if (/^cc0\b/i.test(l)) return "https://creativecommons.org/publicdomain/zero/1.0/";
  const m = /^CC (BY(?:-SA)?) (\d\.\d)(?: ([a-z]{2}))?$/i.exec(l);
  if (!m) return null;
  const port = m[3] ? `${m[3].toLowerCase()}/` : "";
  return `https://creativecommons.org/licenses/${m[1].toLowerCase()}/${m[2]}/${port}`;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/** Plain-text author names from Commons extmetadata (Artist is HTML). */
async function fetchAuthors(photos: DatasetPhoto[]): Promise<{ authors: Map<string, string>; licenseMismatches: string[] }> {
  const authors = new Map<string, string>();
  const licenseMismatches: string[] = [];
  const titleOf = (url: string) => {
    const m = /\/wiki\/(File:.+)$/.exec(url);
    return m ? decodeURIComponent(m[1]).replace(/_/g, " ") : null;
  };
  const byTitle = new Map<string, DatasetPhoto>();
  for (const p of photos) {
    const t = titleOf(p.sourceUrl);
    if (t) byTitle.set(t, p);
  }
  const titles = [...byTitle.keys()];
  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50);
    const url =
      "https://commons.wikimedia.org/w/api.php?action=query&format=json&formatversion=2&prop=imageinfo" +
      "&iiprop=extmetadata&iiextmetadatafilter=Artist%7CLicenseShortName&titles=" +
      encodeURIComponent(batch.join("|"));
    const res = await fetch(url, { headers: { "User-Agent": "beyond-the-algorithm-dataset-builder/1.0" } });
    if (!res.ok) throw new Error(`Commons API answered ${res.status}`);
    const json = (await res.json()) as {
      query?: {
        normalized?: { from: string; to: string }[];
        pages?: { title: string; imageinfo?: { extmetadata?: Record<string, { value?: string }> }[] }[];
      };
    };
    const back = new Map<string, string>();
    for (const n of json.query?.normalized ?? []) back.set(n.to, n.from);
    for (const page of json.query?.pages ?? []) {
      const photo = byTitle.get(page.title) ?? byTitle.get(back.get(page.title) ?? "");
      const meta = page.imageinfo?.[0]?.extmetadata;
      if (!photo || !meta) continue;
      const artist = meta.Artist?.value;
      if (artist) {
        let name = decodeEntities(artist.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
        if (name.length > 80) name = `${name.slice(0, 79).trimEnd()}…`;
        if (name) authors.set(photo.id, name);
      }
      const short = meta.LicenseShortName?.value;
      if (short && decodeEntities(short).trim().toLowerCase() !== photo.license.toLowerCase()) {
        licenseMismatches.push(`${photo.id}: manifest "${photo.license}", Commons "${decodeEntities(short).trim()}"`);
      }
    }
  }
  return { authors, licenseMismatches };
}

async function main() {
  const manifestPath = join(sourceDir, "dataset-manifest.json");
  if (!existsSync(manifestPath)) throw new Error(`No dataset-manifest.json in ${sourceDir}`);
  const raw: unknown = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (!Array.isArray(raw)) throw new Error("dataset-manifest.json is not an array");

  const entries = raw.filter(isSourceEntry);
  console.log(`Manifest: ${raw.length} entries, ${entries.length} well formed.`);

  // Only files that exist and match their manifest hash.
  const verified = new Map<string, { entry: SourceEntry; bytes: Buffer; size: { width: number; height: number } }[]>();
  const skipped: string[] = [];
  for (const entry of entries) {
    const file = join(sourceDir, "storage", entry.storagePath);
    if (!existsSync(file)) {
      skipped.push(`${entry.imageId}: missing on disk`);
      continue;
    }
    const bytes = readFileSync(file);
    const hash = createHash("sha256").update(bytes).digest("hex");
    if (hash !== entry.sha256) {
      skipped.push(`${entry.imageId}: file does not match the manifest hash`);
      continue;
    }
    const size = jpegSize(bytes);
    if (!size) {
      skipped.push(`${entry.imageId}: not a readable JPEG`);
      continue;
    }
    const list = verified.get(entry.categorySlug) ?? [];
    list.push({ entry, bytes, size });
    verified.set(entry.categorySlug, list);
  }

  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  const categories: DatasetCategory[] = [];
  const photos: DatasetPhoto[] = [];
  const copies: { path: string; bytes: Buffer }[] = [];
  const report: string[] = [];

  for (const def of BUILT_IN_CATEGORIES) {
    const list = verified.get(def.slug) ?? [];
    const listed = entries.filter((e) => e.categorySlug === def.slug).length;
    if (list.length < MIN_PER_CATEGORY) {
      report.push(`- ${def.slug}: dropped (${list.length} of ${listed} on disk)`);
      continue;
    }
    const chosen = [...list]
      .sort((a, b) => b.entry.qualityScore - a.entry.qualityScore || a.entry.imageId.localeCompare(b.entry.imageId))
      .slice(0, PER_CATEGORY);
    for (const { entry, bytes, size } of chosen) {
      const file = `${def.slug}/${entry.imageId}.jpg`;
      copies.push({ path: join(outDir, file), bytes });
      photos.push({
        id: entry.imageId,
        category: def.slug,
        label: def.name,
        file,
        width: size.width,
        height: size.height,
        title: entry.title.trim(),
        author: null,
        license: entry.license.trim(),
        licenseUrl: licenseUrl(entry.license),
        sourceUrl: entry.sourceUrl,
      });
    }
    categories.push({ id: def.slug, label: def.name, plural: pluralFromSlug(def.slug), count: chosen.length });
    report.push(`- ${def.slug}: ${chosen.length} kept (${list.length} of ${listed} on disk)`);
  }

  if (wantAuthors) {
    try {
      const { authors, licenseMismatches } = await fetchAuthors(photos);
      for (const p of photos) p.author = authors.get(p.id) ?? null;
      console.log(`Authors found for ${authors.size} of ${photos.length} photos.`);
      if (licenseMismatches.length) console.log(`Licence differences (manifest kept):\n  ${licenseMismatches.join("\n  ")}`);
    } catch (error) {
      console.warn(`Could not fetch authors, credits will link to the source page instead: ${String(error)}`);
    }
  }

  let totalBytes = 0;
  for (const { path, bytes } of copies) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, bytes);
    totalBytes += bytes.length;
  }

  const manifest: DatasetManifest = { version: 1, source: "Wikimedia Commons", categories, photos };
  const manifestJson = `${JSON.stringify(manifest)}\n`;
  writeFileSync(join(outDir, "manifest.json"), manifestJson);

  console.log(report.join("\n"));
  if (skipped.length) {
    const reasons = new Map<string, number>();
    for (const s of skipped) {
      const reason = s.split(": ")[1] ?? s;
      reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
    }
    console.log(`Skipped: ${[...reasons].map(([r, n]) => `${n} ${r}`).join(", ")}`);
  }
  const mb = (n: number) => (n / 1024 / 1024).toFixed(2);
  console.log(
    `Wrote ${categories.length} categories, ${photos.length} photos, ${mb(totalBytes)} MB of images ` +
      `+ ${(manifestJson.length / 1024).toFixed(1)} KB manifest to ${outDir}`,
  );
}

await main();
