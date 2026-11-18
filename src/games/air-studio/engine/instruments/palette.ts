/**
 * Canvas can't use Tailwind classes, so the overlays read the design tokens
 * once the stage mounts (readPalette) and draw with these values. The
 * fallbacks are sRGB approximations of the same tokens.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface Palette {
  fg: Rgb;
  muted: Rgb;
  subtle: Rgb;
  game: Rgb;
  gameInk: Rgb;
  canvas: Rgb;
  sunken: Rgb;
  success: Rgb;
  warning: Rgb;
  danger: Rgb;
}

/** Colours for drawing, plus the families of the two type roles that appear on canvas. */
export const C: Palette & { sans: string; mono: string } = {
  fg: { r: 247, g: 248, b: 250 },
  muted: { r: 196, g: 201, b: 210 },
  subtle: { r: 158, g: 165, b: 178 },
  game: { r: 248, g: 196, b: 82 },
  gameInk: { r: 34, g: 26, b: 12 },
  canvas: { r: 17, g: 19, b: 25 },
  sunken: { r: 11, g: 13, b: 17 },
  success: { r: 86, g: 214, b: 135 },
  warning: { r: 247, g: 204, b: 92 },
  danger: { r: 240, g: 104, b: 94 },
  sans: "ui-sans-serif, system-ui, sans-serif",
  mono: "ui-monospace, monospace",
};

export const rgba = (c: Rgb, a = 1) => `rgba(${c.r}, ${c.g}, ${c.b}, ${Math.round(a * 1000) / 1000})`;

/** Movement on the canvas (impact rings, vibrating strings) stops under reduced motion; fades stay. */
export const motion = { reduced: false };

/** Simulated hands: hints on the canvas name keys instead of hands. */
export const input = { mouse: false };

export const font = (weight: number, px: number, family: "sans" | "mono" = "sans") => `${weight} ${Math.round(px)}px ${family === "sans" ? C.sans : C.mono}`;

function readRgb(probe: CanvasRenderingContext2D, value: string): Rgb | null {
  if (!value) return null;
  const sentinel = "#010203";
  probe.fillStyle = sentinel;
  probe.fillStyle = value;
  if (probe.fillStyle === sentinel) return null;
  probe.clearRect(0, 0, 1, 1);
  probe.fillRect(0, 0, 1, 1);
  const [r, g, b] = probe.getImageData(0, 0, 1, 1).data;
  return { r, g, b };
}

/** Resolves the tokens on `el` (inside the game, so --game is the gold). */
export function readPalette(el: Element) {
  const style = getComputedStyle(el);
  const root = getComputedStyle(document.documentElement);
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const probe = canvas.getContext("2d", { willReadFrequently: true });
  if (!probe) return;
  const read = (name: string, fallback: Rgb) => readRgb(probe, (style.getPropertyValue(name) || root.getPropertyValue(name)).trim()) ?? fallback;
  C.fg = read("--color-fg", C.fg);
  C.muted = read("--color-fg-muted", C.muted);
  C.subtle = read("--color-fg-subtle", C.subtle);
  C.game = read("--game", C.game);
  C.gameInk = read("--game-ink", C.gameInk);
  C.canvas = read("--color-canvas", C.canvas);
  C.sunken = read("--color-sunken", C.sunken);
  C.success = read("--color-success", C.success);
  C.warning = read("--color-warning", C.warning);
  C.danger = read("--color-danger", C.danger);
  const sans = style.fontFamily.trim();
  if (sans) C.sans = sans;
  const mono = root.getPropertyValue("--font-martian").trim();
  if (mono) C.mono = `${mono}, ui-monospace, monospace`;
}

/** Rounded rectangle path. */
export function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r = 4) {
  const rad = Math.max(0, Math.min(r, w / 2, h / 2));
  g.beginPath();
  g.moveTo(x + rad, y);
  g.arcTo(x + w, y, x + w, y + h, rad);
  g.arcTo(x + w, y + h, x, y + h, rad);
  g.arcTo(x, y + h, x, y, rad);
  g.arcTo(x, y, x + w, y, rad);
  g.closePath();
}

/** A small filled label pill (e.g. "Play" on a practice target). Returns its width. */
export function pill(g: CanvasRenderingContext2D, text: string, cx: number, cy: number, px: number, fill: Rgb, ink: Rgb, fillAlpha = 1) {
  g.font = font(650, px);
  const w = g.measureText(text).width + px * 1.2;
  const h = px * 1.8;
  rr(g, cx - w / 2, cy - h / 2, w, h, h / 2);
  g.fillStyle = rgba(fill, fillAlpha);
  g.fill();
  g.fillStyle = rgba(ink);
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, cx, cy + px * 0.05);
  g.textBaseline = "alphabetic";
  return w;
}

/**
 * A pad's name on a dark pill, so it reads over any camera picture. It
 * shrinks to fit `maxW`; when even the smallest size is too wide it falls
 * back to fitLabel (two lines, no pill). `lit` swaps to the game colour.
 */
export function padLabel(g: CanvasRenderingContext2D, text: string, cx: number, cy: number, maxW: number, px: number, lit: boolean) {
  let size = Math.round(px);
  const minPx = 11;
  g.font = font(650, size);
  while (size > minPx && g.measureText(text).width + size * 1.2 > maxW) {
    size -= 1;
    g.font = font(650, size);
  }
  if (g.measureText(text).width + size * 1.2 > maxW) {
    g.fillStyle = rgba(C.fg);
    fitLabel(g, text, cx, cy, maxW, size);
    return;
  }
  pill(g, text, cx, cy, size, lit ? C.game : C.canvas, lit ? C.gameInk : C.fg, lit ? 1 : 0.62);
}

/** An eighth note, `s` tall, with its head's centre at (x, y). */
export function noteGlyph(g: CanvasRenderingContext2D, x: number, y: number, s: number) {
  const hr = s * 0.2;
  g.beginPath();
  g.ellipse(x, y, hr * 1.25, hr, -0.35, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = Math.max(1.5, s * 0.09);
  g.lineCap = "round";
  g.beginPath();
  g.moveTo(x + hr * 1.1, y - hr * 0.3);
  g.lineTo(x + hr * 1.1, y - s * 0.85);
  g.quadraticCurveTo(x + hr * 1.1 + s * 0.38, y - s * 0.62, x + hr * 1.1 + s * 0.3, y - s * 0.3);
  g.stroke();
}

/**
 * A centred label that fits `maxW`: it shrinks down to `minPx`, then breaks
 * onto two lines at the space nearest the middle.
 */
export function fitLabel(g: CanvasRenderingContext2D, text: string, cx: number, cy: number, maxW: number, px: number, weight = 650, minPx = 10) {
  let size = Math.round(px);
  g.font = font(weight, size);
  while (size > minPx && g.measureText(text).width > maxW) {
    size -= 1;
    g.font = font(weight, size);
  }
  g.textAlign = "center";
  g.textBaseline = "middle";
  if (g.measureText(text).width <= maxW || !text.includes(" ")) {
    g.fillText(text, cx, cy);
  } else {
    const spaces = [...text].map((c, i) => (c === " " ? i : -1)).filter((i) => i > 0);
    const cut = spaces.reduce((best, i) => (Math.abs(i - text.length / 2) < Math.abs(best - text.length / 2) ? i : best), spaces[0]);
    g.fillText(text.slice(0, cut), cx, cy - size * 0.6);
    g.fillText(text.slice(cut + 1), cx, cy + size * 0.6);
  }
  g.textBaseline = "alphabetic";
}
