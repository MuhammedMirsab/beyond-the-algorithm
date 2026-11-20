/**
 * All of Sky Shot's art, built from code at load time (original designs).
 * Logical screen: 320 x 180. The sky ends at y 128, grass runs to 150, the
 * HUD sits on the earth strip below.
 */
import { PixelGrid, seeded } from "./pixel";

export const W = 320;
export const H = 180;
export const GRASS_Y = 130;
export const HUD_Y = 151;

export const INK = "#1d1b26";

export interface Species {
  body: string;
  dark: string;
  head: string;
  belly: string;
  beak: string;
  points: number;
  speed: number;
}

/** Three birds: blue (common), red (quicker), gold (rare and fast). */
export const SPECIES: Species[] = [
  { body: "#4a7fd6", dark: "#2d4f94", head: "#3fb6a8", belly: "#e8eef7", beak: "#f39c32", points: 100, speed: 1 },
  { body: "#d4483b", dark: "#8e2a22", head: "#d4483b", belly: "#f6d7b0", beak: "#f2c14e", points: 200, speed: 1.22 },
  { body: "#f2b632", dark: "#b57a12", head: "#fff1a8", belly: "#fff5d6", beak: "#e0662b", points: 500, speed: 1.55 },
];

export type BirdPose = "up" | "mid" | "down" | "hit";

/** [species][pose] → [facing right, facing left]; plus falling (upside down). */
export interface BirdSprites {
  fly: Record<BirdPose, [HTMLCanvasElement, HTMLCanvasElement]>[];
  fall: [HTMLCanvasElement, HTMLCanvasElement][];
  icon: HTMLCanvasElement[];
}

export const BIRD_W = 20;
export const BIRD_H = 16;

function birdGrid(s: Species, pose: BirdPose): PixelGrid {
  const g = new PixelGrid(BIRD_W, BIRD_H, 1, 1);
  // Tail, body, belly, head, beak.
  g.tri(4, 6.5, 0, 4.6, 0.2, 9.8, s.dark);
  g.ellipse(8.5, 8, 5.6, 3.3, s.body);
  g.ellipse(9.2, 9.6, 3.9, 1.7, s.belly, true);
  g.ellipse(13, 5.2, 2.8, 2.7, s.head);
  g.tri(15.2, 4.2, 18, 5.7, 15.2, 6.8, s.beak);
  // Feet tucked under.
  g.dot(8, 11, s.beak);
  g.dot(10, 11, s.beak);
  // Wing.
  if (pose === "up") {
    g.tri(5.5, 7.5, 11, 7.5, 4.5, 0, s.dark);
    g.tri(7, 7, 10, 7, 8, 1.5, s.body);
  } else if (pose === "mid") {
    g.tri(5, 6.2, 11, 7.8, 1.5, 3.4, s.dark);
  } else if (pose === "down") {
    g.tri(5.5, 7, 11, 7, 5.5, 13.6, s.dark);
    g.tri(7, 7.5, 10, 7.5, 7.2, 12, s.body);
  } else {
    g.tri(5, 7.5, 9.5, 7.5, 3, 0, s.dark);
    g.tri(8, 7.5, 12, 7.5, 11.5, 0, s.body);
  }
  // Eye: white with a pupil; startled birds get a wide eye.
  g.dot(13, 4, "#ffffff");
  g.dot(14, 4, pose === "hit" ? "#ffffff" : INK);
  if (pose === "hit") g.dot(14, 5, INK);
  g.outline(INK);
  return g;
}

export function buildBirds(): BirdSprites {
  const poses: BirdPose[] = ["up", "mid", "down", "hit"];
  const fly = SPECIES.map((s) => {
    const out = {} as Record<BirdPose, [HTMLCanvasElement, HTMLCanvasElement]>;
    for (const p of poses) {
      const g = birdGrid(s, p);
      out[p] = [g.toCanvas(false), g.toCanvas(true)];
    }
    return out;
  });
  const fall = SPECIES.map((s) => {
    const g = birdGrid(s, "hit");
    return [g.toCanvas(false, true), g.toCanvas(true, true)] as [HTMLCanvasElement, HTMLCanvasElement];
  });
  const icon = SPECIES.map(() => tinyBird("#f4ecd8"));
  return { fly, fall, icon };
}

/** The 7 x 5 marker in the hit tracker. */
export function tinyBird(color: string): HTMLCanvasElement {
  const g = new PixelGrid(7, 5);
  g.rect(1, 2, 4, 2, color);
  g.rect(4, 1, 2, 2, color);
  g.dot(6, 2, color);
  g.dot(0, 1, color);
  g.dot(2, 1, color);
  g.dot(2, 4, color);
  return g.toCanvas();
}

/* ── Fox, the companion who pops up from the reeds ────────────────── */

export type FoxPose = "cheer1" | "cheer2" | "laughA" | "laughB" | "wave";

const FOX = { fur: "#e8762d", dark: "#9c4a1a", cream: "#fbf3e4", mouth: "#7a1f2b", tongue: "#e0607a" };
export const FOX_W = 32;
export const FOX_H = 34;

function foxGrid(pose: FoxPose): PixelGrid {
  const g = new PixelGrid(FOX_W, FOX_H, 1, 1);
  // Arms first so the body overlaps their roots.
  if (pose === "cheer1" || pose === "cheer2") {
    g.tri(6, 23, 2, 9, 10, 21, FOX.fur);
    g.ellipse(2.6, 9, 2, 2, FOX.cream);
  }
  if (pose === "cheer2") {
    g.tri(20, 21, 28, 9, 24, 23, FOX.fur);
    g.ellipse(27.4, 9, 2, 2, FOX.cream);
  }
  if (pose === "wave") {
    g.tri(20, 21, 27, 11, 24, 23, FOX.fur);
    g.ellipse(26.6, 11, 2, 2, FOX.cream);
  }
  // Body and chest.
  g.ellipse(15, 26, 7.5, 6.6, FOX.fur);
  g.ellipse(15, 27, 3.8, 5, FOX.cream, true);
  // Ears with dark insides.
  g.tri(7.5, 11, 9.5, 1, 13.5, 8, FOX.fur);
  g.tri(16.5, 8, 20.5, 1, 22.5, 11, FOX.fur);
  g.tri(9.6, 8, 10, 3.6, 12, 7.6, FOX.dark);
  g.tri(18, 7.6, 20, 3.6, 20.4, 8, FOX.dark);
  // Head, cheek fluff, muzzle.
  g.ellipse(15, 13, 7.6, 6.4, FOX.fur);
  g.tri(6.5, 14, 9, 13, 8.5, 18, FOX.cream);
  g.tri(23.5, 14, 21, 13, 21.5, 18, FOX.cream);
  g.ellipse(15, 16.4, 4.4, 2.8, FOX.cream);
  // Nose.
  g.rect(14, 14, 2, 1, INK);
  if (pose === "laughA" || pose === "laughB") {
    // Squeezed-shut eyes and an open grin.
    g.dot(11, 12, INK);
    g.dot(12, 11, INK);
    g.dot(13, 12, INK);
    g.dot(17, 12, INK);
    g.dot(18, 11, INK);
    g.dot(19, 12, INK);
    const open = pose === "laughA" ? 1.7 : 1.1;
    g.ellipse(15, 17.6, 2.4, open, FOX.mouth);
    g.rect(14, 18, 2, 1, FOX.tongue);
  } else {
    g.rect(12, 11, 1, 2, INK);
    g.rect(18, 11, 1, 2, INK);
    g.dot(11, 11, "#ffffff");
    g.dot(17, 11, "#ffffff");
    g.rect(13, 17, 4, 1, INK);
    g.dot(12, 16, INK);
    g.dot(17, 16, INK);
  }
  g.outline(INK);
  return g;
}

export function buildFox(): Record<FoxPose, HTMLCanvasElement> {
  return {
    cheer1: foxGrid("cheer1").toCanvas(),
    cheer2: foxGrid("cheer2").toCanvas(),
    laughA: foxGrid("laughA").toCanvas(),
    laughB: foxGrid("laughB").toCanvas(),
    wave: foxGrid("wave").toCanvas(),
  };
}

/* ── Clouds ─────────────────────────────────────────────────────────── */

export function buildCloud(seed: number): HTMLCanvasElement {
  const rand = seeded(seed);
  const g = new PixelGrid(48, 20, 1, 1);
  const puffs = 4 + Math.floor(rand() * 3);
  for (let i = 0; i < puffs; i++) {
    const cx = 8 + (i / (puffs - 1)) * 30 + rand() * 3;
    const r = 4 + rand() * 4.5;
    g.ellipse(cx, 15 - r * 0.8, r, r * 0.85, "#ffffff");
  }
  g.ellipse(23, 15, 21, 3.4, "#ffffff");
  // Soft shade along the underside.
  for (let x = 0; x < g.w; x++) {
    for (let y = g.h - 1; y >= 0; y--) {
      if (g.get(x, y)) {
        g.set(x, y, "#d5e6f2");
        if (g.get(x, y - 1)) g.set(x, y - 1, "#d5e6f2");
        break;
      }
    }
  }
  return g.toCanvas();
}

/* ── Scenery ────────────────────────────────────────────────────────── */

const SKY = ["#4f93d8", "#5aa1de", "#68b0e3", "#79bfe8", "#8ccbec", "#a2d7ef", "#b9e2f1"];

function mkCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("2D canvas unavailable");
  ctx.imageSmoothingEnabled = false;
  return [c, ctx];
}

/** Sky, sun, far hills, pond, pine and reeds: everything behind the birds. */
export function buildBackdrop(): HTMLCanvasElement {
  const [c, ctx] = mkCanvas(W, H);
  const rand = seeded(7);

  // Sky in bands with a 2-row checker dither between them.
  const band = Math.ceil(GRASS_Y / SKY.length);
  for (let y = 0; y < GRASS_Y; y++) {
    const i = Math.min(SKY.length - 1, Math.floor(y / band));
    const into = y - i * band;
    for (let x = 0; x < W; x++) {
      let col = SKY[i];
      if (into < 2 && i > 0 && (x + y) % 2 === 0) col = SKY[i - 1];
      ctx.fillStyle = col;
      ctx.fillRect(x, y, 1, 1);
    }
  }

  // Sun with a pixel halo.
  const sun = new PixelGrid(30, 30);
  sun.ellipse(15, 15, 14, 14, "#d6eef5");
  sun.ellipse(15, 15, 10, 10, "#fff6cf");
  sun.ellipse(15, 15, 8, 8, "#fff1a8");
  ctx.drawImage(sun.toCanvas(), 258, 14);

  // Far mountains, then nearer rolling hills.
  for (let x = 0; x < W; x++) {
    const far = 100 - (Math.sin(x * 0.031) * 7 + Math.sin(x * 0.083 + 1.3) * 3 + Math.sin(x * 0.011 + 0.4) * 9);
    ctx.fillStyle = "#93b9cf";
    ctx.fillRect(x, Math.round(far), 1, GRASS_Y - Math.round(far));
    ctx.fillStyle = "#b4d2e0";
    ctx.fillRect(x, Math.round(far), 1, 1);
    const near = 114 - (Math.sin(x * 0.021 + 2) * 5 + Math.sin(x * 0.057) * 2.5);
    ctx.fillStyle = "#5c9c73";
    ctx.fillRect(x, Math.round(near), 1, GRASS_Y - Math.round(near));
    ctx.fillStyle = "#73b285";
    ctx.fillRect(x, Math.round(near), 1, 1);
  }

  // Pond strip with glints.
  ctx.fillStyle = "#5fa8cc";
  ctx.fillRect(0, 122, W, 8);
  ctx.fillStyle = "#8fd0e8";
  for (let i = 0; i < 26; i++) {
    const x = Math.floor(rand() * W);
    ctx.fillRect(x, 123 + Math.floor(rand() * 6), 3 + Math.floor(rand() * 5), 1);
  }

  // A tall pine on the left.
  ctx.drawImage(buildPine(), 24, 40);

  // Reeds and cattails along the far bank.
  for (let i = 0; i < 22; i++) {
    const x = 90 + Math.floor(rand() * 220);
    const h = 10 + Math.floor(rand() * 14);
    ctx.fillStyle = "#3f7a3c";
    ctx.fillRect(x, GRASS_Y - h, 1, h);
    if (rand() < 0.6) {
      ctx.fillStyle = INK;
      ctx.fillRect(x - 1, GRASS_Y - h - 1, 3, 6);
      ctx.fillStyle = "#7a4a2a";
      ctx.fillRect(x, GRASS_Y - h, 1, 4);
    }
  }
  return c;
}

function buildPine(): HTMLCanvasElement {
  const g = new PixelGrid(44, 94, 1, 1);
  g.rect(19, 70, 4, 22, "#6b3f22");
  g.rect(19, 70, 1, 22, "#8a5530");
  const layers = [
    [21, 0, 8, 22],
    [21, 12, 12, 36],
    [21, 26, 16, 52],
    [21, 42, 20, 72],
  ];
  for (const [cx, top, half, bottom] of layers) g.tri(cx, top, cx + half, bottom, cx - half, bottom, "#2f6b3f");
  // Light on the sunny side.
  for (const [cx, top, half, bottom] of layers) g.tri(cx, top + 3, cx + half - 2, bottom - 1, cx + 2, bottom - 1, "#3f8a4f");
  g.outline(INK);
  return g.toCanvas();
}

/** Grass and earth in front of the birds (transparent above the blades). */
export function buildForeground(): HTMLCanvasElement {
  const [c, ctx] = mkCanvas(W, H);
  const rand = seeded(21);
  for (let x = 0; x < W; x++) {
    const base = GRASS_Y + 2 + Math.round(Math.sin(x * 0.09) * 1.5);
    ctx.fillStyle = "#3d8c43";
    ctx.fillRect(x, base, 1, HUD_Y - base);
  }
  // Blades in three tones, tallest at the back.
  const tones = ["#2f7a3a", "#4fa44a", "#78c25a"];
  for (let t = 0; t < 3; t++) {
    for (let i = 0; i < 260; i++) {
      const x = Math.floor(rand() * W);
      const h = 4 + Math.floor(rand() * (10 - t * 2));
      const lean = rand() < 0.5 ? -1 : 1;
      const y0 = GRASS_Y + 6 + t * 4;
      ctx.fillStyle = tones[t];
      for (let k = 0; k < h; k++) ctx.fillRect(x + (k > h * 0.6 ? lean : 0), y0 - k, 1, 1);
    }
  }
  // Flowers.
  for (let i = 0; i < 14; i++) {
    const x = Math.floor(rand() * W);
    const y = GRASS_Y + 10 + Math.floor(rand() * 8);
    ctx.fillStyle = rand() < 0.5 ? "#fbf3e4" : "#f2c14e";
    ctx.fillRect(x, y, 2, 2);
  }
  // Earth strip for the HUD.
  ctx.fillStyle = "#6b4a2b";
  ctx.fillRect(0, HUD_Y, W, H - HUD_Y);
  ctx.fillStyle = INK;
  ctx.fillRect(0, HUD_Y, W, 1);
  ctx.fillStyle = "#5a3c22";
  for (let i = 0; i < 120; i++) ctx.fillRect(Math.floor(rand() * W), HUD_Y + 2 + Math.floor(rand() * 27), 2, 1);
  return c;
}

/** A shotgun-shell style ammo pip, 4 x 8. */
export function buildShell(full: boolean): HTMLCanvasElement {
  const g = new PixelGrid(4, 8);
  if (full) {
    g.rect(0, 0, 4, 5, "#d4483b");
    g.rect(0, 5, 4, 3, "#f2c14e");
    g.rect(1, 0, 1, 5, "#f08a7f");
  } else {
    g.rect(0, 0, 4, 8, "#3a3340");
  }
  return g.toCanvas();
}
