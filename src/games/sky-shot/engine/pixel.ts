/**
 * Tiny pixel-art toolkit. Sprites are rasterised from simple shapes onto a
 * colour grid (pixel-centre tests, so no anti-aliasing), get an automatic
 * outline, then become small canvases the renderer blits with smoothing off.
 * Everything here is original art drawn from code; no image files.
 */

export class PixelGrid {
  readonly px: (string | null)[];

  constructor(
    readonly w: number,
    readonly h: number,
    /** Offset added to every shape, leaving room for the outline. */
    private readonly ox = 0,
    private readonly oy = 0,
  ) {
    this.px = new Array<string | null>(w * h).fill(null);
  }

  get(x: number, y: number): string | null {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return null;
    return this.px[y * this.w + x];
  }

  set(x: number, y: number, c: string | null) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.px[y * this.w + x] = c;
  }

  /** One pixel, in shape coordinates (offset applied). */
  dot(x: number, y: number, c: string) {
    this.set(Math.floor(x + this.ox), Math.floor(y + this.oy), c);
  }

  /** onlyOver: paint only where something is already drawn (a belly on a body). */
  ellipse(cx: number, cy: number, rx: number, ry: number, c: string, onlyOver = false) {
    cx += this.ox;
    cy += this.oy;
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy > 1) continue;
        if (onlyOver && this.get(x, y) === null) continue;
        this.set(x, y, c);
      }
    }
  }

  tri(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, c: string) {
    ax += this.ox;
    bx += this.ox;
    cx += this.ox;
    ay += this.oy;
    by += this.oy;
    cy += this.oy;
    const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    if (area === 0) return;
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const px = x + 0.5;
        const py = y + 0.5;
        const w0 = ((bx - px) * (cy - py) - (by - py) * (cx - px)) / area;
        const w1 = ((cx - px) * (ay - py) - (cy - py) * (ax - px)) / area;
        const w2 = 1 - w0 - w1;
        if (w0 >= 0 && w1 >= 0 && w2 >= 0) this.set(x, y, c);
      }
    }
  }

  rect(x: number, y: number, w: number, h: number, c: string) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.dot(x + i, y + j, c);
  }

  /** Every empty pixel touching a drawn one (4-way) becomes `c`. */
  outline(c: string) {
    const add: number[] = [];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (this.get(x, y) !== null) continue;
        if (this.get(x - 1, y) || this.get(x + 1, y) || this.get(x, y - 1) || this.get(x, y + 1)) add.push(y * this.w + x);
      }
    }
    for (const i of add) this.px[i] = c;
  }

  toCanvas(flipX = false, flipY = false): HTMLCanvasElement {
    const canvas = document.createElement("canvas");
    canvas.width = this.w;
    canvas.height = this.h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return canvas;
    const img = ctx.createImageData(this.w, this.h);
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const c = this.get(flipX ? this.w - 1 - x : x, flipY ? this.h - 1 - y : y);
        if (!c) continue;
        const [r, g, b] = hexRgb(c);
        const i = (y * this.w + x) * 4;
        img.data[i] = r;
        img.data[i + 1] = g;
        img.data[i + 2] = b;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  }
}

export function hexRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Deterministic random numbers, so the scenery is the same every load. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ── 3 x 5 bitmap font ─────────────────────────────────────────────── */

const GLYPHS: Record<string, string[]> = {
  A: [".#.", "#.#", "###", "#.#", "#.#"],
  B: ["##.", "#.#", "##.", "#.#", "##."],
  C: [".##", "#..", "#..", "#..", ".##"],
  D: ["##.", "#.#", "#.#", "#.#", "##."],
  E: ["###", "#..", "##.", "#..", "###"],
  F: ["###", "#..", "##.", "#..", "#.."],
  G: [".##", "#..", "#.#", "#.#", ".##"],
  H: ["#.#", "#.#", "###", "#.#", "#.#"],
  I: ["###", ".#.", ".#.", ".#.", "###"],
  J: ["..#", "..#", "..#", "#.#", ".#."],
  K: ["#.#", "#.#", "##.", "#.#", "#.#"],
  L: ["#..", "#..", "#..", "#..", "###"],
  M: ["#.#", "###", "###", "#.#", "#.#"],
  N: ["##.", "#.#", "#.#", "#.#", "#.#"],
  O: [".#.", "#.#", "#.#", "#.#", ".#."],
  P: ["##.", "#.#", "##.", "#..", "#.."],
  Q: [".#.", "#.#", "#.#", "##.", ".##"],
  R: ["##.", "#.#", "##.", "#.#", "#.#"],
  S: [".##", "#..", ".#.", "..#", "##."],
  T: ["###", ".#.", ".#.", ".#.", ".#."],
  U: ["#.#", "#.#", "#.#", "#.#", "###"],
  V: ["#.#", "#.#", "#.#", "#.#", ".#."],
  W: ["#.#", "#.#", "###", "###", "#.#"],
  X: ["#.#", "#.#", ".#.", "#.#", "#.#"],
  Y: ["#.#", "#.#", ".#.", ".#.", ".#."],
  Z: ["###", "..#", ".#.", "#..", "###"],
  "0": ["###", "#.#", "#.#", "#.#", "###"],
  "1": [".#.", "##.", ".#.", ".#.", "###"],
  "2": ["##.", "..#", ".#.", "#..", "###"],
  "3": ["##.", "..#", ".#.", "..#", "##."],
  "4": ["#.#", "#.#", "###", "..#", "..#"],
  "5": ["###", "#..", "##.", "..#", "##."],
  "6": [".##", "#..", "###", "#.#", "###"],
  "7": ["###", "..#", ".#.", ".#.", ".#."],
  "8": ["###", "#.#", "###", "#.#", "###"],
  "9": ["###", "#.#", "###", "..#", "##."],
  "!": [".#.", ".#.", ".#.", "...", ".#."],
  ".": ["...", "...", "...", "...", ".#."],
  ":": ["...", ".#.", "...", ".#.", "..."],
  "-": ["...", "...", "###", "...", "..."],
  "?": ["##.", "..#", ".#.", "...", ".#."],
  "'": [".#.", ".#.", "...", "...", "..."],
  "/": ["..#", "..#", ".#.", "#..", "#.."],
  "+": ["...", ".#.", "###", ".#.", "..."],
  " ": ["...", "...", "...", "...", "..."],
};

const FONT: Record<string, boolean[]> = Object.fromEntries(
  Object.entries(GLYPHS).map(([k, rows]) => [k, rows.join("").split("").map((ch) => ch === "#")]),
);

export const CHAR_W = 4;

export function textWidth(text: string, scale = 1) {
  return text.length === 0 ? 0 : (text.length * CHAR_W - 1) * scale;
}

/** Draws upper-case pixel text. shadow: a 1px drop shadow colour. */
export function drawText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
  scale = 1,
  shadow?: string,
) {
  const up = text.toUpperCase();
  if (shadow) paintText(ctx, up, x + scale, y + scale, shadow, scale);
  paintText(ctx, up, x, y, color, scale);
}

export function drawTextCentered(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  y: number,
  color: string,
  scale = 1,
  shadow?: string,
) {
  drawText(ctx, text, Math.round(cx - textWidth(text, scale) / 2), y, color, scale, shadow);
}

function paintText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, scale: number) {
  ctx.fillStyle = color;
  for (let i = 0; i < text.length; i++) {
    const g = FONT[text[i]] ?? FONT["?"];
    const gx = x + i * CHAR_W * scale;
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 3; c++) {
        if (g[r * 3 + c]) ctx.fillRect(gx + c * scale, y + r * scale, scale, scale);
      }
    }
  }
}
