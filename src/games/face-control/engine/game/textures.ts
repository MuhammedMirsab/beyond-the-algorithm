import type Phaser from "phaser";
import { BALL_R, TEX } from "./config";
import { canvasFont } from "./fonts";
import type { SignIcon } from "./levels/types";
import { BALL_COLORS, type Theme } from "./themes";

/*
 * Every game graphic is drawn here with Canvas 2D at TEX× its world size, so
 * it stays sharp at any zoom (laptop, 4K monitor or projector) without
 * shipping a single image file.
 */

type Draw = (ctx: CanvasRenderingContext2D) => void;

function makeCanvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

/** Adds a texture drawn in world units (scaled by `scale`). No-op if the key already exists. */
export function canvasTexture(scene: Phaser.Scene, key: string, w: number, h: number, draw: Draw, scale = TEX) {
  if (scene.textures.exists(key)) return key;
  const c = makeCanvas(w * scale, h * scale);
  const ctx = c.getContext("2d")!;
  ctx.scale(scale, scale);
  draw(ctx);
  scene.textures.addCanvas(key, c);
  return key;
}

const rr = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number | number[]) => {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
};

/** Small deterministic PRNG so backgrounds look the same on every visit. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Shared textures
// ---------------------------------------------------------------------------

export function makeCommonTextures(scene: Phaser.Scene) {
  canvasTexture(scene, "px", 4, 4, (ctx) => {
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, 4, 4);
  }, 1);

  canvasTexture(scene, "dot", 16, 16, (ctx) => {
    const g = ctx.createRadialGradient(8, 8, 0, 8, 8, 8);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.55, "rgba(255,255,255,0.9)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 16, 16);
  });

  canvasTexture(scene, "chip", 8, 8, (ctx) => {
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.moveTo(4, 0);
    ctx.lineTo(8, 7);
    ctx.lineTo(0, 8);
    ctx.closePath();
    ctx.fill();
  });

  canvasTexture(scene, "confetti", 8, 4, (ctx) => {
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, 8, 4);
  });

  canvasTexture(scene, "ring", 64, 64, (ctx) => {
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(32, 32, 29, 0, Math.PI * 2);
    ctx.stroke();
  });

  canvasTexture(scene, "glow", 64, 64, (ctx) => {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(255,255,255,0.85)");
    g.addColorStop(0.35, "rgba(255,255,255,0.35)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  }, 2);

  const d = BALL_R * 2;
  // Rolling layer: rotates with the ball so you can see it roll.
  canvasTexture(scene, "ball-base", d, d, (ctx) => {
    ctx.translate(BALL_R, BALL_R);
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, BALL_R, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = BALL_COLORS.base;
    ctx.fillRect(-BALL_R, -BALL_R, d, d);
    ctx.fillStyle = BALL_COLORS.band;
    ctx.fillRect(-BALL_R, -4.6, d, 9.2);
    ctx.fillStyle = BALL_COLORS.bandEdge;
    ctx.fillRect(-BALL_R, -5.4, d, 0.9);
    ctx.fillRect(-BALL_R, 4.5, d, 0.9);
    ctx.fillStyle = BALL_COLORS.band;
    ctx.beginPath();
    ctx.arc(0, -13.5, 2.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });

  // Lighting layer: stays upright, so the light always comes from the top-left.
  canvasTexture(scene, "ball-shade", d, d, (ctx) => {
    ctx.translate(BALL_R, BALL_R);
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, BALL_R, 0, Math.PI * 2);
    ctx.clip();
    const g = ctx.createRadialGradient(-8, -9, 1, -2, -2, BALL_R * 1.55);
    g.addColorStop(0, "rgba(255,255,255,0.32)");
    g.addColorStop(0.32, "rgba(255,255,255,0.04)");
    g.addColorStop(0.7, "rgba(70,18,0,0.12)");
    g.addColorStop(1, BALL_COLORS.shade);
    ctx.fillStyle = g;
    ctx.fillRect(-BALL_R, -BALL_R, d, d);
    const s = ctx.createRadialGradient(-8, -10, 0, -8, -10, 7);
    s.addColorStop(0, "rgba(255,255,255,0.85)");
    s.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = s;
    ctx.beginPath();
    ctx.ellipse(-8, -10, 7, 4.6, -0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = "rgba(60,15,0,0.35)";
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.arc(0, 0, BALL_R - 0.55, 0, Math.PI * 2);
    ctx.stroke();
  });

  canvasTexture(scene, "ball-shadow", 64, 16, (ctx) => {
    ctx.translate(32, 8);
    ctx.scale(1, 0.25);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 30);
    g.addColorStop(0, "rgba(0,0,0,0.42)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 30, 0, Math.PI * 2);
    ctx.fill();
  });
}

// ---------------------------------------------------------------------------
// Per-theme world textures
// ---------------------------------------------------------------------------

export const NINE = { size: 48, left: 12, right: 12, top: 16, bottom: 12 };

function platformTexture(ctx: CanvasRenderingContext2D, p: Theme["platform"]) {
  const s = NINE.size;
  rr(ctx, 0, 0, s, s, [9, 9, 4, 4]);
  ctx.fillStyle = p.body;
  ctx.fill();
  ctx.save();
  rr(ctx, 0, 0, s, s, [9, 9, 4, 4]);
  ctx.clip();
  ctx.fillStyle = p.top;
  ctx.fillRect(0, 0, s, 11);
  ctx.fillStyle = p.shade;
  ctx.globalAlpha = 0.55;
  ctx.fillRect(0, 11, s, 3);
  ctx.globalAlpha = 1;
  ctx.fillStyle = p.lip;
  rr(ctx, 3.5, 0.6, s - 7, 2.2, 1.1);
  ctx.fill();
  ctx.restore();
}

export function makeThemeTextures(scene: Phaser.Scene, t: Theme) {
  canvasTexture(scene, `platform-${t.id}`, NINE.size, NINE.size, (ctx) => platformTexture(ctx, t.platform));
  canvasTexture(scene, `mover-${t.id}`, NINE.size, NINE.size, (ctx) => {
    platformTexture(ctx, t.mover);
    // Rivets mark it as a machine — a hint that it moves.
    ctx.fillStyle = t.mover.top;
    ctx.globalAlpha = 0.6;
    for (const x of [8, 24, 40]) {
      ctx.beginPath();
      ctx.arc(x, 24, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  });

  canvasTexture(scene, `spark-${t.id}`, 30, 30, (ctx) => {
    ctx.translate(15, 15);
    const star = (r: number, inner: number) => {
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4 - Math.PI / 2;
        const rad = i % 2 === 0 ? r : inner;
        ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
      }
      ctx.closePath();
    };
    star(13.5, 4.2);
    ctx.fillStyle = t.spark;
    ctx.fill();
    ctx.strokeStyle = "rgba(120, 70, 0, 0.35)";
    ctx.lineWidth = 0.8;
    ctx.stroke();
    star(6.5, 2.2);
    ctx.fillStyle = t.sparkCore;
    ctx.fill();
  });

  canvasTexture(scene, `pad-${t.id}`, 60, 24, (ctx) => {
    rr(ctx, 4, 14, 52, 10, 3);
    ctx.fillStyle = t.platform.shade;
    ctx.fill();
    ctx.strokeStyle = t.pad;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i <= 6; i++) ctx.lineTo(14 + i * 5.3, i % 2 ? 9 : 14);
    ctx.stroke();
    rr(ctx, 6, 2, 48, 7, 3.5);
    ctx.fillStyle = t.pad;
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    rr(ctx, 10, 3, 40, 1.6, 0.8);
    ctx.fill();
  });

  canvasTexture(scene, `boost-${t.id}`, 84, 20, (ctx) => {
    ctx.strokeStyle = t.boost;
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (let i = 0; i < 3; i++) {
      ctx.globalAlpha = 0.45 + i * 0.27;
      const x = 14 + i * 24;
      ctx.beginPath();
      ctx.moveTo(x, 3);
      ctx.lineTo(x + 11, 10);
      ctx.lineTo(x, 17);
      ctx.stroke();
    }
  });

  for (const state of ["idle", "active"] as const) {
    canvasTexture(scene, `flag-${t.id}-${state}`, 46, 88, (ctx) => {
      ctx.fillStyle = t.flag.pole;
      rr(ctx, 4, 4, 3, 82, 1.5);
      ctx.fill();
      rr(ctx, 0, 84, 11, 4, 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(5.5, 4, 3.4, 0, Math.PI * 2);
      ctx.fillStyle = state === "active" ? t.flag.active : t.flag.pole;
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(7, 9);
      ctx.lineTo(42, 20);
      ctx.lineTo(7, 31);
      ctx.closePath();
      ctx.fillStyle = state === "active" ? t.flag.active : t.flag.idle;
      ctx.fill();
    });
  }

  canvasTexture(scene, `finish-${t.id}`, 156, 220, (ctx) => {
    ctx.fillStyle = t.finish.post;
    rr(ctx, 0, 6, 12, 214, 3);
    ctx.fill();
    rr(ctx, 144, 6, 12, 214, 3);
    ctx.fill();
    const sq = 12;
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 13; col++) {
        ctx.fillStyle = (row + col) % 2 ? t.finish.a : t.finish.b;
        ctx.fillRect(col * sq, 8 + row * sq, sq, sq);
      }
    }
    ctx.strokeStyle = t.finish.a;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(0.75, 8.75, 154.5, 34.5);
  });
}

export function spikeTexture(scene: Phaser.Scene, t: Theme, width: number) {
  const key = `spikes-${t.id}-${width}`;
  return canvasTexture(scene, key, width, 24, (ctx) => {
    const n = Math.max(1, Math.round(width / 20));
    const w = width / n;
    for (let i = 0; i < n; i++) {
      const x = i * w;
      ctx.beginPath();
      ctx.moveTo(x, 24);
      ctx.lineTo(x + w / 2, 1);
      ctx.lineTo(x + w / 2, 24);
      ctx.closePath();
      ctx.fillStyle = t.hazard;
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x + w / 2, 1);
      ctx.lineTo(x + w, 24);
      ctx.lineTo(x + w / 2, 24);
      ctx.closePath();
      ctx.fillStyle = t.hazardDark;
      ctx.fill();
    }
  });
}

export function sawTexture(scene: Phaser.Scene, t: Theme, r: number) {
  const key = `saw-${t.id}-${r}`;
  const s = r * 2 + 4;
  return canvasTexture(scene, key, s, s, (ctx) => {
    ctx.translate(s / 2, s / 2);
    const teeth = 12;
    ctx.beginPath();
    for (let i = 0; i < teeth * 2; i++) {
      const a = (i / (teeth * 2)) * Math.PI * 2;
      const rad = i % 2 === 0 ? r : r * 0.76;
      ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
    }
    ctx.closePath();
    ctx.fillStyle = t.hazard;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.56, 0, Math.PI * 2);
    ctx.fillStyle = t.hazardDark;
    ctx.fill();
    ctx.fillStyle = t.hazard;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * r * 0.32, Math.sin(a) * r * 0.32, r * 0.09, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.14, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.fill();
  });
}

export function crusherTexture(scene: Phaser.Scene, t: Theme, w: number, h: number) {
  const key = `crusher-${t.id}-${w}x${h}`;
  return canvasTexture(scene, key, w, h, (ctx) => {
    const teeth = 12;
    rr(ctx, 0, 0, w, h - teeth, [6, 6, 2, 2]);
    ctx.fillStyle = t.platform.shade;
    ctx.fill();
    ctx.save();
    rr(ctx, 0, 0, w, h - teeth, [6, 6, 2, 2]);
    ctx.clip();
    // Warning stripes across the middle.
    ctx.fillStyle = t.hazard;
    const y0 = (h - teeth) * 0.42;
    for (let x = -h; x < w + h; x += 18) {
      ctx.beginPath();
      ctx.moveTo(x, y0);
      ctx.lineTo(x + 9, y0);
      ctx.lineTo(x + 9 + 16, y0 + 16);
      ctx.lineTo(x + 16, y0 + 16);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = t.platform.top;
    ctx.fillRect(0, 0, w, 6);
    ctx.restore();
    const n = Math.round(w / 15);
    const tw = w / n;
    for (let i = 0; i < n; i++) {
      ctx.beginPath();
      ctx.moveTo(i * tw, h - teeth);
      ctx.lineTo(i * tw + tw / 2, h);
      ctx.lineTo(i * tw + tw, h - teeth);
      ctx.closePath();
      ctx.fillStyle = i % 2 ? t.hazardDark : t.hazard;
      ctx.fill();
    }
  });
}

export function barTexture(scene: Phaser.Scene, t: Theme, length: number) {
  const key = `bar-${t.id}-${length}`;
  return canvasTexture(scene, key, length + 16, 16, (ctx) => {
    rr(ctx, 0, 1, length + 16, 14, 7);
    ctx.fillStyle = t.hazard;
    ctx.fill();
    ctx.fillStyle = t.hazardDark;
    rr(ctx, 6, 9, length + 4, 4, 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(8, 8, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.fill();
  });
}

export function crusherRailTexture(scene: Phaser.Scene, t: Theme) {
  return canvasTexture(scene, `rail-${t.id}`, 6, 64, (ctx) => {
    ctx.fillStyle = t.platform.shade;
    ctx.globalAlpha = 0.65;
    ctx.fillRect(2, 0, 2, 64);
  });
}

// ---------------------------------------------------------------------------
// Signs
// ---------------------------------------------------------------------------

function face(ctx: CanvasRenderingContext2D, r: number, open: boolean) {
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(-r * 0.36, -r * 0.18, r * 0.11, 0, Math.PI * 2);
  ctx.arc(r * 0.36, -r * 0.18, r * 0.11, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  if (open) {
    ctx.ellipse(0, r * 0.38, r * 0.24, r * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.moveTo(-r * 0.28, r * 0.42);
    ctx.lineTo(r * 0.28, r * 0.42);
    ctx.stroke();
  }
}

function arrowHead(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, size = 4.5) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(size, 0);
  ctx.lineTo(-size * 0.7, -size * 0.75);
  ctx.lineTo(-size * 0.7, size * 0.75);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawIcon(ctx: CanvasRenderingContext2D, icon: SignIcon) {
  ctx.lineWidth = 2.2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  switch (icon) {
    case "tilt": {
      ctx.save();
      ctx.rotate(-0.38);
      face(ctx, 11, false);
      ctx.restore();
      ctx.beginPath();
      ctx.arc(0, 0, 17, Math.PI * 0.82, Math.PI * 1.12);
      ctx.stroke();
      arrowHead(ctx, Math.cos(Math.PI * 0.82) * 17, Math.sin(Math.PI * 0.82) * 17, Math.PI * 0.82 + Math.PI / 2 + Math.PI);
      ctx.beginPath();
      ctx.arc(0, 0, 17, -Math.PI * 0.12, Math.PI * 0.18);
      ctx.stroke();
      arrowHead(ctx, Math.cos(Math.PI * 0.18) * 17, Math.sin(Math.PI * 0.18) * 17, Math.PI * 0.18 + Math.PI / 2);
      break;
    }
    case "mouth":
      ctx.translate(0, 3);
      face(ctx, 11.5, true);
      ctx.beginPath();
      ctx.moveTo(0, -15);
      ctx.lineTo(0, -21);
      ctx.stroke();
      arrowHead(ctx, 0, -22, -Math.PI / 2, 4);
      break;
    case "arrows":
      // Two key caps: ← and →.
      for (const dir of [-1, 1]) {
        const cx = dir * 9;
        rr(ctx, cx - 7.5, -7.5, 15, 15, 3);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx - dir * 3.5, 0);
        ctx.lineTo(cx + dir * 1.5, 0);
        ctx.stroke();
        arrowHead(ctx, cx + dir * 3, 0, dir === 1 ? 0 : Math.PI, 3.5);
      }
      break;
    case "space":
      // The space bar, and the jump it makes.
      rr(ctx, -16, 4, 32, 10, 3);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, -1);
      ctx.lineTo(0, -12);
      ctx.stroke();
      arrowHead(ctx, 0, -13, -Math.PI / 2, 4);
      break;
    case "gap":
      ctx.fillRect(-17, 6, 11, 10);
      ctx.fillRect(6, 6, 11, 10);
      ctx.beginPath();
      ctx.arc(0, 8, 12, Math.PI * 1.1, Math.PI * 1.85);
      ctx.stroke();
      arrowHead(ctx, Math.cos(Math.PI * 1.85) * 12, 8 + Math.sin(Math.PI * 1.85) * 12, Math.PI * 1.85 + Math.PI / 2);
      break;
    case "spike":
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(-15 + i * 10, 12);
        ctx.lineTo(-10 + i * 10, -4);
        ctx.lineTo(-5 + i * 10, 12);
        ctx.closePath();
        ctx.fill();
      }
      ctx.beginPath();
      ctx.moveTo(-14, -12);
      ctx.lineTo(14, -12);
      ctx.stroke();
      arrowHead(ctx, 15, -12, 0, 4);
      break;
    case "spark":
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4 - Math.PI / 2;
        const rad = i % 2 === 0 ? 14 : 4.5;
        ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
      }
      ctx.closePath();
      ctx.fill();
      break;
    case "mover":
      ctx.fillRect(-12, 6, 24, 7);
      ctx.beginPath();
      ctx.moveTo(-14, -6);
      ctx.lineTo(14, -6);
      ctx.stroke();
      arrowHead(ctx, 15, -6, 0, 4);
      arrowHead(ctx, -15, -6, Math.PI, 4);
      break;
    case "pad":
      ctx.fillRect(-13, 12, 26, 4);
      ctx.beginPath();
      for (let i = 0; i <= 4; i++) ctx.lineTo(-8 + i * 4, i % 2 ? 4 : 10);
      ctx.stroke();
      ctx.fillRect(-11, 0, 22, 4);
      ctx.beginPath();
      ctx.moveTo(0, -5);
      ctx.lineTo(0, -15);
      ctx.stroke();
      arrowHead(ctx, 0, -16, -Math.PI / 2, 4);
      break;
    case "boost":
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(-14 + i * 10, -9);
        ctx.lineTo(-6 + i * 10, 0);
        ctx.lineTo(-14 + i * 10, 9);
        ctx.stroke();
      }
      break;
    case "saw": {
      ctx.beginPath();
      for (let i = 0; i < 20; i++) {
        const a = (i / 20) * Math.PI * 2;
        const rad = i % 2 === 0 ? 14 : 10.5;
        ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, 3, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "crusher":
      ctx.fillRect(-11, -16, 22, 14);
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(-11 + i * 5.5, -2);
        ctx.lineTo(-8.25 + i * 5.5, 3);
        ctx.lineTo(-5.5 + i * 5.5, -2);
        ctx.fill();
      }
      ctx.fillRect(-16, 13, 32, 3);
      break;
    case "flag":
    case "finish": {
      ctx.fillRect(-12, -16, 2.4, 32);
      const sq = 5;
      for (let r = 0; r < 3; r++)
        for (let c = 0; c < 5; c++) if ((r + c) % 2 === 0) ctx.fillRect(-9.6 + c * sq, -15 + r * sq, sq, sq);
      ctx.strokeRect(-9.6, -15, 25, 15);
      break;
    }
  }
}

export const SIGN_POST = 46;

/** Sign lettering: the interface face (Mona Sans), sentence case, no tracking. */
const SIGN_FONT = () => canvasFont(700, 14, "display");

export function signTexture(scene: Phaser.Scene, t: Theme, icon: SignIcon, text: string) {
  const key = `sign-${t.id}-${icon}-${text}`;
  if (scene.textures.exists(key)) return { key, width: scene.textures.get(key).getSourceImage().width / TEX };
  const measure = makeCanvas(10, 10).getContext("2d")!;
  measure.font = SIGN_FONT();
  const textW = measure.measureText(text).width;
  const w = Math.ceil(54 + textW + 18);
  const boardH = 50;
  const h = boardH + SIGN_POST;
  canvasTexture(scene, key, w, h, (ctx) => {
    ctx.fillStyle = t.sign.post;
    rr(ctx, w / 2 - 2, boardH - 4, 4, SIGN_POST + 4, 1);
    ctx.fill();
    rr(ctx, 0, 0, w, boardH, 7);
    ctx.fillStyle = t.sign.board;
    ctx.fill();
    ctx.fillStyle = t.sign.ink;
    ctx.strokeStyle = t.sign.ink;
    ctx.globalAlpha = 0.18;
    ctx.fillRect(48, 10, 1, boardH - 20);
    ctx.globalAlpha = 1;
    ctx.save();
    ctx.translate(25, boardH / 2);
    drawIcon(ctx, icon);
    ctx.restore();
    ctx.font = SIGN_FONT();
    ctx.textBaseline = "middle";
    ctx.fillStyle = t.sign.ink;
    ctx.fillText(text, 60, boardH / 2 + 1);
  });
  return { key, width: w };
}

// ---------------------------------------------------------------------------
// Backdrop (sky, sun/moon, parallax silhouettes)
// ---------------------------------------------------------------------------

/** Layer textures are 2048×512 px — power-of-two so they can repeat as tile sprites. */
export const LAYER_W = 2048;
export const LAYER_H = 512;
/** Transparent rows at the bottom of each layer texture (see makeBackdropTextures). */
export const LAYER_EDGE = 4;

export function makeBackdropTextures(scene: Phaser.Scene, t: Theme) {
  canvasTexture(scene, `sky-${t.id}`, 8, 512, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0, t.sky[0]);
    g.addColorStop(1, t.sky[1]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 8, 512);
  }, 1);

  canvasTexture(scene, `orb-${t.id}`, 256, 256, (ctx) => {
    const g = ctx.createRadialGradient(128, 128, 30, 128, 128, 128);
    g.addColorStop(0, t.orb.glow);
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    ctx.beginPath();
    ctx.arc(128, 128, 52, 0, Math.PI * 2);
    ctx.fillStyle = t.orb.color;
    ctx.fill();
    if (t.id === "night") {
      // A few soft craters make it read as a moon.
      ctx.fillStyle = "rgba(120, 108, 190, 0.16)";
      for (const [x, y, r] of [
        [112, 112, 11],
        [146, 136, 8],
        [122, 152, 6],
      ]) {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }, 1);

  if (t.stars) {
    canvasTexture(scene, "stars", 1024, 512, (ctx) => {
      const rand = rng(7);
      for (let i = 0; i < 170; i++) {
        const x = rand() * 1024;
        const y = rand() * 512 * 0.8;
        const r = rand() < 0.1 ? 1.6 : 0.5 + rand() * 0.8;
        ctx.globalAlpha = 0.25 + rand() * 0.6;
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }, 1);
  }

  t.layers.forEach((color, i) => {
    canvasTexture(
      scene,
      `layer-${t.id}-${i}`,
      LAYER_W,
      LAYER_H,
      (ctx) => {
        drawLayer(ctx, t, i, color);
        // Tile sprites repeat vertically too: with bilinear filtering the top edge
        // would sample the solid bottom row and draw a hairline across the sky.
        // A transparent bottom margin (kept below the screen) prevents it.
        ctx.clearRect(0, LAYER_H - LAYER_EDGE, LAYER_W, LAYER_EDGE);
      },
      1,
    );
  });
}

/** Sum of sines with whole periods across the texture, so the layer tiles seamlessly. */
function periodic(x: number, seed: number, terms: [number, number][]) {
  let y = 0;
  terms.forEach(([cycles, amp], k) => {
    y += Math.sin((x / LAYER_W) * Math.PI * 2 * cycles + seed * (k + 1) * 1.7) * amp;
  });
  return y;
}

function drawLayer(ctx: CanvasRenderingContext2D, t: Theme, index: number, color: string) {
  const W = LAYER_W;
  const H = LAYER_H;
  const rand = rng(31 + index * 17 + t.id.length * 101);
  ctx.fillStyle = color;

  if (t.layerStyle === "hills") {
    const base = [0.42, 0.55, 0.72][index] * H;
    const terms: [number, number][][] = [
      [
        [2, 34],
        [5, 14],
        [9, 6],
      ],
      [
        [3, 30],
        [7, 12],
        [13, 4],
      ],
      [
        [2, 26],
        [6, 14],
        [11, 5],
      ],
    ];
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 4) ctx.lineTo(x, base + periodic(x, index + 1, terms[index]));
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();
    if (index === 2) {
      // Round trees on the nearest hills.
      for (let i = 0; i < 14; i++) {
        const x = rand() * W;
        const y = base + periodic(x, index + 1, terms[index]) + 6;
        const r = 9 + rand() * 9;
        ctx.fillRect(x - 1.5, y - r - 10, 3, r + 10);
        ctx.beginPath();
        ctx.arc(x, y - r - 12, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    return;
  }

  if (t.layerStyle === "mesas") {
    const base = [0.46, 0.58, 0.74][index] * H;
    const n = [5, 7, 6][index];
    const seg = W / n;
    const shape = new Path2D();
    shape.moveTo(0, H);
    for (let i = 0; i < n; i++) {
      const x0 = i * seg;
      const top = base - 20 - rand() * 70;
      const plateau = seg * (0.35 + rand() * 0.3);
      const rise = (seg - plateau) / 2;
      shape.lineTo(x0, base + 26);
      shape.lineTo(x0 + rise * 0.6, top + 12);
      shape.lineTo(x0 + rise, top);
      shape.lineTo(x0 + rise + plateau, top);
      shape.lineTo(x0 + rise + plateau + rise * 0.4, top + 12);
      shape.lineTo(x0 + seg, base + 26);
    }
    shape.lineTo(W, H);
    shape.closePath();
    ctx.fill(shape);
    // Rock strata, clipped to the mesas.
    ctx.save();
    ctx.clip(shape);
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = "#000";
    for (let y = base - 90; y < H; y += 22) ctx.fillRect(0, y, W, 2);
    ctx.restore();
    return;
  }

  // peaks / night city
  const base = [0.4, 0.56, 0.76][index] * H;
  if (index < 2) {
    const n = index === 0 ? 9 : 12;
    const seg = W / n;
    const heights = Array.from({ length: n }, () => 50 + rand() * (index === 0 ? 150 : 110));
    ctx.beginPath();
    ctx.moveTo(0, H);
    ctx.lineTo(0, base - heights[0] * 0.3);
    for (let i = 0; i < n; i++) {
      const x = i * seg + seg / 2;
      ctx.lineTo(x - seg * 0.12, base - heights[i] * 0.85);
      ctx.lineTo(x, base - heights[i]);
      ctx.lineTo(x + seg * 0.18, base - heights[i] * 0.7);
      ctx.lineTo((i + 1) * seg, base - (i + 1 < n ? Math.min(heights[i], heights[i + 1]) : heights[0]) * 0.3);
    }
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();
    return;
  }
  // Nearest night layer: a quiet skyline with a few lit windows.
  ctx.fillRect(0, base, W, H - base);
  let x = 0;
  const windows: [number, number][] = [];
  while (x < W) {
    const bw = 40 + rand() * 70;
    const bh = 30 + rand() * 120;
    ctx.fillRect(x, base - bh, Math.min(bw, W - x), bh + 2);
    for (let wy = base - bh + 10; wy < base - 8; wy += 14)
      for (let wx = x + 8; wx < x + bw - 8; wx += 12) if (rand() < 0.12) windows.push([wx, wy]);
    x += bw + 6 + rand() * 30;
  }
  ctx.fillStyle = "#FFD98A";
  for (const [wx, wy] of windows) {
    ctx.globalAlpha = 0.35 + rand() * 0.45;
    ctx.fillRect(wx, wy, 3, 4);
  }
  ctx.globalAlpha = 1;
}
