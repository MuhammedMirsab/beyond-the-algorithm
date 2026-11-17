/**
 * On-device handwriting recognition for AIRWRITE.
 *
 *  strokes ─► segment into letters (by horizontal overlap) and words (by gaps)
 *          ─► $P point-cloud match of each letter against the shape library
 *          ─► word decoding: numbers vs letters, then the word list to settle
 *             look-alike letters, plus an honest confidence score.
 *
 * Runs in a few milliseconds, entirely in the browser.
 */
import { cloudMatch, toCloud, type CloudPoint, type StrokeXY, type XY } from "./pdollar";
import { DIGIT_TO_LETTER, LETTER_TO_DIGIT, TEMPLATES } from "./templates";
import { wordsOfLength } from "./lexicon";

export interface CharScore {
  char: string;
  d: number;
}

export interface Recognition {
  text: string;
  confidence: number;
  alternatives: string[];
  kind: "text" | "unreadable";
  ms: number;
}

interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface Group extends Box {
  strokes: StrokeXY[];
}

/** $P distance bands, calibrated on distorted samples (see recognize.test.ts). */
// Distorted letters: median 0.79, p90 1.18. Random scribbles: p5 1.36, median 1.83.
const D_GOOD = 0.8;
const D_BAD = 1.6;
/** A dictionary word is accepted if it costs at most this much more than the raw best reading. */
const LEXICON_ACCEPT = 1.22;
const ALIAS_PENALTY = 1.1;
const LOWER_ONLY = new Set(["a", "b", "d", "e", "f", "g", "h", "i", "m", "n", "q", "r", "t", "y"]);

// ── Templates ─────────────────────────────────────────────────
let library: { char: string; cloud: CloudPoint[] }[] | null = null;
/** Rebuild template clouds (after changing normalisation settings). */
export function resetLibrary() {
  library = null;
}
function templates() {
  library ??= Object.entries(TEMPLATES).flatMap(([char, variants]) =>
    variants.map((v) => ({ char, cloud: toCloud(v) })),
  );
  return library;
}

/** Best distance per character class, most similar first. */
export function classify(strokes: StrokeXY[]): CharScore[] {
  const cloud = toCloud(strokes);
  if (!cloud.length) return [];
  const best = new Map<string, number>();
  for (const t of templates()) {
    const d = cloudMatch(cloud, t.cloud);
    if (d < (best.get(t.char) ?? Infinity)) best.set(t.char, d);
  }
  return [...best].map(([char, d]) => ({ char, d })).sort((a, b) => a.d - b.d);
}

// ── Segmentation ──────────────────────────────────────────────
function boxOf(s: StrokeXY): Box {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of s) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  return { minX, minY, maxX, maxY };
}

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

function mergeInto(g: Group, other: Box & { strokes: StrokeXY[] }) {
  g.minX = Math.min(g.minX, other.minX);
  g.minY = Math.min(g.minY, other.minY);
  g.maxX = Math.max(g.maxX, other.maxX);
  g.maxY = Math.max(g.maxY, other.maxY);
  g.strokes.push(...other.strokes);
}

/** Splits strokes into words, each a list of letter groups, left to right. */
export function segment(strokes: StrokeXY[]): Group[][] {
  const items = strokes
    .filter((s) => s.length > 0)
    .map((s) => ({ ...boxOf(s), strokes: [s] }))
    .sort((a, b) => a.minX - b.minX);
  if (!items.length) return [];

  const all = items.reduce((b, s) => ({
    ...b,
    minY: Math.min(b.minY, s.minY),
    maxY: Math.max(b.maxY, s.maxY),
  }));
  const strokeHeights = items.map((s) => Math.max(s.maxY - s.minY, s.maxX - s.minX));
  const lineH = Math.max(median(strokeHeights), (all.maxY - all.minY) * 0.5, 1);
  const pad = lineH * 0.06;

  // Strokes belong to the same letter if their horizontal extents overlap,
  // or if one starts/ends right on the other (the two halves of a Y, a K's arms).
  const touchDist = lineH * 0.09;
  const segDist = ([px, py]: XY, [ax, ay]: XY, [bx, by]: XY) => {
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
    return Math.hypot(ax + t * dx - px, ay + t * dy - py);
  };
  // Does an endpoint of `s` land on (any segment of) one of `others`?
  const touches = (s: StrokeXY, others: StrokeXY[]) => {
    const ends = [s[0], s[s.length - 1]];
    for (const o of others)
      for (const e of ends) {
        if (o.length === 1 && Math.hypot(o[0][0] - e[0], o[0][1] - e[1]) < touchDist) return true;
        for (let i = 1; i < o.length; i++) if (segDist(e, o[i - 1], o[i]) < touchDist) return true;
      }
    return false;
  };
  let groups: Group[] = [];
  for (const s of items) {
    const hits = groups.filter((g) => {
      // Pad both ranges so perfectly vertical strokes on a letter's edge still count.
      const overlap = Math.min(s.maxX, g.maxX) + pad - (Math.max(s.minX, g.minX) - pad);
      if (overlap <= 0) return false;
      const narrow = Math.min(s.maxX - s.minX, g.maxX - g.minX);
      if (overlap >= 0.3 * narrow - 1e-9) return true;
      return touches(s.strokes[0], g.strokes) || g.strokes.some((gs) => touches(gs, s.strokes));
    });
    if (!hits.length) {
      groups.push({ ...s, strokes: [...s.strokes] });
      continue;
    }
    const [first, ...rest] = hits;
    mergeInto(first, s);
    for (const g of rest) mergeInto(first, g);
    groups = groups.filter((g) => !rest.includes(g));
  }

  // Tiny fragments (dots, short ticks) join the nearest letter.
  const tiny = (g: Group) => Math.max(g.maxX - g.minX, g.maxY - g.minY) < lineH * 0.22;
  for (const g of groups.filter(tiny)) {
    if (groups.length < 2) break;
    const cx = (g.minX + g.maxX) / 2;
    let best: Group | null = null;
    let bestD = Infinity;
    for (const o of groups) {
      if (o === g || tiny(o)) continue;
      const d = Math.max(0, o.minX - cx, cx - o.maxX);
      if (d < bestD) {
        bestD = d;
        best = o;
      }
    }
    if (best && bestD < lineH * 0.45) {
      mergeInto(best, g);
      groups = groups.filter((o) => o !== g);
    }
  }

  groups.sort((a, b) => a.minX - b.minX);

  // Word breaks: gaps clearly wider than the usual letter spacing.
  const gaps = groups.slice(1).map((g, i) => g.minX - groups[i].maxX);
  const letterH = median(groups.map((g) => g.maxY - g.minY)) || lineH;
  const threshold = gaps.length >= 2 ? Math.max(letterH * 0.5, median(gaps) * 1.8) : letterH * 0.6;
  const words: Group[][] = [[groups[0]]];
  for (let i = 1; i < groups.length; i++) {
    if (gaps[i - 1] > threshold) words.push([]);
    words[words.length - 1].push(groups[i]);
  }
  return words;
}

// ── Decoding ──────────────────────────────────────────────────
const isDigit = (c: string) => c >= "0" && c <= "9";

function letterCost(scores: CharScore[], letter: string): number {
  let best = Infinity;
  for (const { char, d } of scores) {
    if (char.toUpperCase() === letter) best = Math.min(best, d);
    else if (isDigit(char) && DIGIT_TO_LETTER[char] === letter) best = Math.min(best, d * ALIAS_PENALTY);
  }
  return best;
}

function digitCost(scores: CharScore[], digit: string): number {
  let best = Infinity;
  for (const { char, d } of scores) {
    if (char === digit) best = Math.min(best, d);
    else if (!isDigit(char) && LETTER_TO_DIGIT[char.toUpperCase()] === digit) best = Math.min(best, d * ALIAS_PENALTY);
  }
  return best;
}

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const DIGITS = "0123456789".split("");

interface Pick {
  char: string;
  cost: number;
  runnerUp: string;
  runnerCost: number;
}

function pickFrom(scores: CharScore[], alphabet: string[], cost: (s: CharScore[], c: string) => number): Pick {
  const ranked = alphabet.map((c) => ({ c, d: cost(scores, c) })).sort((a, b) => a.d - b.d);
  return { char: ranked[0].c, cost: ranked[0].d, runnerUp: ranked[1].c, runnerCost: ranked[1].d };
}

/** 0..1 from how clear the winner is and how close it is to a real shape. */
function charConfidence(p: Pick): number {
  const margin = (p.runnerCost - p.cost) / Math.max(p.cost, 0.05);
  const clarity = 1 - Math.exp(-margin * 5);
  const quality = Math.min(1, Math.max(0, (D_BAD - p.cost) / (D_BAD - D_GOOD)));
  return Math.max(0.02, Math.sqrt(clarity * quality));
}

interface WordReading {
  text: string;
  confidence: number;
  alternatives: string[];
  quality: number;
}

function decodeWord(groups: Group[]): WordReading {
  const scores = groups.map((g) => classify(g.strokes));
  const best = scores.map((s) => s[0]);
  // A group votes "digit" only if its best digit clearly beats its best letter (I/1, O/0 ties go to letters).
  // Digits that look like letters (0/O, 8/B, 5/S...) must win clearly to count.
  const digitVotes = scores.filter((s) => {
    const digit = s.find((x) => isDigit(x.char));
    const l = s.find((x) => !isDigit(x.char))?.d ?? Infinity;
    if (!digit) return false;
    return digit.d < l * (DIGIT_TO_LETTER[digit.char] ? 0.85 : 0.97);
  }).length;
  const numeric = digitVotes * 2 > groups.length;
  const quality =
    best.reduce((q, b) => q + Math.min(1, Math.max(0, (D_BAD - b.d) / (D_BAD - D_GOOD))), 0) / best.length;

  if (numeric) {
    const picks = scores.map((s) => pickFrom(s, DIGITS, digitCost));
    const text = picks.map((p) => p.char).join("");
    const confs = picks.map(charConfidence);
    const confidence = Math.pow(confs.reduce((a, b) => a * b, 1), 1 / confs.length);
    const worst = confs.indexOf(Math.min(...confs));
    const alt = picks.map((p, i) => (i === worst ? p.runnerUp : p.char)).join("");
    const lettersInstead = scores.map((s) => pickFrom(s, LETTERS, letterCost).char).join("");
    return { text, confidence, alternatives: [alt, lettersInstead], quality };
  }

  const picks = scores.map((s) => pickFrom(s, LETTERS, letterCost));
  const raw = picks.map((p) => p.char).join("");
  const confs = picks.map(charConfidence);
  let confidence = Math.pow(confs.reduce((a, b) => a * b, 1), 1 / confs.length);

  // Dictionary: cheapest word of this length, measured relative to the raw best.
  const ranked = wordsOfLength(groups.length)
    .map((w) => {
      let ratio = 0;
      let worst = 0;
      for (let i = 0; i < w.length; i++) {
        // Floor the denominator: a near-perfect match (d ≈ 0) must not blow up the ratio.
        const r = Math.max(letterCost(scores[i], w[i]), 0.05) / Math.max(picks[i].cost, 0.05);
        ratio += r;
        worst = Math.max(worst, r);
      }
      return { w, mean: ratio / w.length, worst };
    })
    .filter((x) => Number.isFinite(x.mean))
    .sort((a, b) => a.mean - b.mean);

  let text = raw;
  const alternatives: string[] = [];
  const top = ranked[0];
  const isWord = top && top.mean <= LEXICON_ACCEPT && top.worst <= 1.7;

  // Not a word? Every letter may be a digit look-alike (2026 vs ZOZG): if the
  // digit reading fits about as well, it's the more plausible one.
  if (!isWord && groups.length >= 2) {
    const digitPicks = scores.map((s) => pickFrom(s, DIGITS, digitCost));
    const letterSum = picks.reduce((a, p) => a + p.cost, 0);
    const digitSum = digitPicks.reduce((a, p) => a + p.cost, 0);
    if (digitSum <= letterSum) {
      const dConfs = digitPicks.map(charConfidence);
      return {
        text: digitPicks.map((p) => p.char).join(""),
        confidence: Math.pow(dConfs.reduce((a, b) => a * b, 1), 1 / dConfs.length),
        alternatives: [raw],
        quality,
      };
    }
  }

  if (isWord) {
    text = top.w;
    // A dictionary match makes the reading far more trustworthy.
    const fit = Math.min(1, Math.max(0, 1 - (top.mean - 1) / (LEXICON_ACCEPT - 1)));
    confidence = Math.max(confidence, (0.6 + 0.35 * fit) * Math.min(1, quality + 0.25));
    if (raw !== text) alternatives.push(raw);
  }
  for (const r of ranked.slice(0, 4)) if (r.w !== text && r.mean <= LEXICON_ACCEPT * 1.15) alternatives.push(r.w);
  if (text === raw && picks.length) {
    const worst = confs.indexOf(Math.min(...confs));
    alternatives.push(picks.map((p, i) => (i === worst ? p.runnerUp : p.char)).join(""));
  }

  // Keep lowercase if most letters were written in lowercase-only shapes.
  const lowerVotes = best.filter((b) => LOWER_ONLY.has(b.char)).length;
  const lower = lowerVotes * 2 >= groups.length && lowerVotes > 0;
  const fmt = (s: string) => (lower ? s.toLowerCase() : s);
  return { text: fmt(text), confidence, alternatives: alternatives.map(fmt), quality };
}

export interface StrokeInput {
  /** Points in any consistent unit with equal x/y scale (e.g. pixels). */
  points: StrokeXY;
}

export function recognizeStrokes(strokes: StrokeXY[]): Recognition {
  const started = performance.now();
  const words = segment(strokes.filter((s) => s.length > 0));
  if (!words.length) return { text: "", confidence: 0, alternatives: [], kind: "unreadable", ms: 0 };

  const readings = words.map(decodeWord);
  const quality = readings.reduce((q, r) => q + r.quality, 0) / readings.length;
  const text = readings.map((r) => r.text).join(" ");
  const letters = words.reduce((n, w) => n + w.length, 0);
  const confidence = readings.reduce((c, r, i) => c + r.confidence * words[i].length, 0) / letters;

  // Alternatives for the whole line: swap one word at a time for its alternative.
  const alternatives: string[] = [];
  readings.forEach((r, i) => {
    for (const a of r.alternatives) {
      const line = readings.map((x, j) => (j === i ? a : x.text)).join(" ");
      if (line !== text && !alternatives.includes(line)) alternatives.push(line);
    }
  });

  const ms = performance.now() - started;
  if (quality < 0.12) return { text: "", confidence: 0, alternatives: [], kind: "unreadable", ms };
  return { text, confidence: Math.min(1, Math.max(0, confidence)), alternatives: alternatives.slice(0, 3), kind: "text", ms };
}
