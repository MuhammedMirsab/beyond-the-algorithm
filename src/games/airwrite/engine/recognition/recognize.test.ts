import { describe, expect, it, setDefaultTimeout } from "bun:test";

setDefaultTimeout(120_000);
import { classify, recognizeStrokes, segment } from "./recognize";
import { TEMPLATES } from "./templates";
import type { StrokeXY } from "./pdollar";

/** Deterministic PRNG so the test is stable. */
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

/** Densify a polyline so wobble applies smoothly along it. */
function densify(s: StrokeXY, step = 3): StrokeXY {
  const out: StrokeXY = [s[0]];
  for (let i = 1; i < s.length; i++) {
    const [x0, y0] = s[i - 1];
    const [x1, y1] = s[i];
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / step));
    for (let k = 1; k <= n; k++) out.push([x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n]);
  }
  return out;
}

/** Air-writing style distortion: slant, stretch, shaky low-frequency wobble, random stroke order/direction. */
function distort(strokes: StrokeXY[], r: () => number, amount = 1): StrokeXY[] {
  const rot = (r() - 0.5) * 0.4 * amount;
  const shear = (r() - 0.5) * 0.4 * amount;
  const sx = 1 + (r() - 0.5) * 0.5 * amount;
  const sy = 1 + (r() - 0.5) * 0.3 * amount;
  const phase = r() * 10;
  const wob = 3.5 * amount;
  const out = strokes.map((s) => {
    let pts = densify(s).map(([x, y], i): [number, number] => {
      const nx = x + Math.sin(i * 0.35 + phase) * wob + (r() - 0.5) * 1.2;
      const ny = y + Math.cos(i * 0.3 + phase * 1.3) * wob + (r() - 0.5) * 1.2;
      const xx = (nx + shear * ny) * sx;
      const yy = ny * sy;
      return [xx * Math.cos(rot) - yy * Math.sin(rot), xx * Math.sin(rot) + yy * Math.cos(rot)];
    });
    if (r() < 0.5) pts = pts.reverse();
    return pts;
  });
  return out.sort(() => r() - 0.5);
}

/** Lay out characters left to right as one line of writing (scaled to ~200px letters). */
function write(text: string, r: () => number, amount = 0.8): StrokeXY[] {
  const strokes: StrokeXY[] = [];
  let x = 0;
  for (const ch of text) {
    if (ch === " ") {
      x += 160;
      continue;
    }
    const variants = TEMPLATES[ch];
    const v = variants[Math.floor(r() * variants.length)];
    const d = distort(v, r, amount);
    let minX = Infinity;
    for (const s of d) for (const [px] of s) minX = Math.min(minX, px);
    const dy = (r() - 0.5) * 10;
    const shaped = d.map((s) => s.map(([px, py]): [number, number] => [x + (px - minX) * 2, py * 2 + dy]));
    let maxX = -Infinity;
    for (const s of shaped) for (const [px] of s) maxX = Math.max(maxX, px);
    strokes.push(...shaped);
    x = maxX + 50 + r() * 30;
  }
  return strokes;
}

const CHARS = Object.keys(TEMPLATES);
const sameLetter = (a: string, b: string) => a.toUpperCase() === b.toUpperCase();
const LOOKALIKE: Record<string, string[]> = {
  O: ["0", "D", "Q"], "0": ["O", "D"], I: ["1", "l", "i"], "1": ["I", "i"], S: ["5"], "5": ["S"], Z: ["2"], "2": ["Z"],
  B: ["8"], "8": ["B"], G: ["6", "C"], "6": ["G", "b"], "9": ["q", "g"], q: ["9", "g"], g: ["9", "q"], C: ["G"],
  U: ["V"], V: ["U"], i: ["I", "1"], t: ["T", "f"], y: ["Y"], n: ["h"], h: ["n"], D: ["O"], a: ["d", "q"],
};

describe("letter classifier", () => {
  it("reads distorted letters and digits", () => {
    const r = rng(42);
    let exact = 0;
    let fair = 0;
    let total = 0;
    const misses: string[] = [];
    for (const ch of CHARS) {
      for (let k = 0; k < 12; k++) {
        const variants = TEMPLATES[ch];
        const sample = distort(variants[k % variants.length], r, 0.9);
        const top = classify(sample)[0].char;
        total++;
        if (top === ch || sameLetter(top, ch)) exact++;
        if (top === ch || sameLetter(top, ch) || LOOKALIKE[ch]?.includes(top)) fair++;
        else misses.push(`${ch}->${top}`);
      }
    }
    console.log(`classifier: exact ${(exact / total * 100).toFixed(1)}%, incl. look-alikes ${(fair / total * 100).toFixed(1)}%`);
    console.log("misses:", misses.join(" "));
    expect(fair / total, `exact ${exact}/${total}; misses ${misses.join(" ")}`).toBeGreaterThan(0.9);
  });

  it("reports distance bands for calibration", () => {
    const r = rng(7);
    const own: number[] = [];
    const other: number[] = [];
    for (const ch of CHARS) {
      const s = classify(distort(TEMPLATES[ch][0], r, 0.9));
      own.push(s.find((x) => x.char === ch)!.d);
      other.push(s.find((x) => x.char !== ch && !sameLetter(x.char, ch) && !LOOKALIKE[ch]?.includes(x.char))!.d);
    }
    const q = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.floor(p * (xs.length - 1))];
    console.log(`own   p50 ${q(own, 0.5).toFixed(2)} p90 ${q(own, 0.9).toFixed(2)}`);
    console.log(`other p10 ${q(other, 0.1).toFixed(2)} p50 ${q(other, 0.5).toFixed(2)}`);
    expect(q(own, 0.5)).toBeLessThan(q(other, 0.5));
  });
});

describe("segmentation", () => {
  it("splits letters and words", () => {
    const r = rng(3);
    const words = segment(write("HI CAT", r));
    expect(words.map((w) => w.length)).toEqual([2, 3]);
  });
  it("reads perfectly straight two-point strokes (mouse drags)", () => {
    const strokes: StrokeXY[] = [
      [[300, 150], [300, 320]],
      [[390, 150], [390, 320]],
      [[300, 236], [390, 236]],
      [[470, 150], [470, 320]],
    ];
    expect(segment(strokes).flat().length).toBe(2);
    expect(recognizeStrokes(strokes).text).toBe("HI");
  });

  it("keeps multi-stroke letters together", () => {
    const r = rng(5);
    expect(segment(write("HEX", r)).flat().length).toBe(3);
  });
});

describe("word recognition", () => {
  const cases = ["HI", "AI", "CAT", "EDEX", "STAR", "HELLO", "LOVE", "SMILE", "2026", "HELLO WORLD", "PEACE", "ROBOT", "FUN"];
  it("reads common words written in the air", () => {
    const r = rng(11);
    let ok = 0;
    const results: string[] = [];
    let n = 0;
    for (const word of cases) {
      for (let k = 0; k < 4; k++) {
        const res = recognizeStrokes(write(word, r));
        n++;
        if (res.text.toUpperCase() === word) ok++;
        else results.push(`${word}->${res.text}(${res.confidence.toFixed(2)})`);
      }
    }
    console.log(`words: ${ok}/${n}`, results.join(" "));
    expect(ok / n, `ok ${ok}/${n}: ${results.join(" ")}`).toBeGreaterThan(0.85);
  });

  it("is unsure about scribbles", () => {
    const r = rng(9);
    const scribble: StrokeXY[] = [Array.from({ length: 80 }, () => [r() * 200, r() * 200] as [number, number])];
    const res = recognizeStrokes(scribble);
    expect(res.kind === "unreadable" || res.confidence < 0.6).toBe(true);
  });

  it("returns unreadable for nothing", () => {
    expect(recognizeStrokes([]).kind).toBe("unreadable");
  });
});

describe("confidence", () => {
  it("stays within 0..1 even for perfect, template-exact strokes", () => {
    const strokes: StrokeXY[] = [
      [[300, 150], [300, 320]],
      [[390, 150], [390, 320]],
      [[300, 236], [390, 236]],
      [[470, 150], [470, 320]],
    ];
    const res = recognizeStrokes(strokes);
    expect(res.confidence).toBeGreaterThan(0.5);
    expect(res.confidence).toBeLessThanOrEqual(1);
  });
});
