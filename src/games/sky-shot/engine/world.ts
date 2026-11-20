/**
 * Sky Shot game rules and drawing, in the 320 x 180 logical screen.
 *
 * A round is 10 birds released in 5 waves of 2. Each wave gives 3 shots and
 * a few seconds before the birds escape. Hit enough birds to pass the round;
 * the bar rises and the birds speed up every round.
 */
import type { Sfx } from "./audio";
import { drawText, drawTextCentered, textWidth } from "./pixel";
import {
  BIRD_H,
  BIRD_W,
  FOX_H,
  FOX_W,
  GRASS_Y,
  H,
  HUD_Y,
  INK,
  SPECIES,
  W,
  buildBackdrop,
  buildBirds,
  buildCloud,
  buildFox,
  buildForeground,
  buildShell,
  tinyBird,
  type BirdPose,
  type BirdSprites,
  type FoxPose,
} from "./sprites";

export const BIRDS_PER_ROUND = 10;
/** A visit is at most this many rounds, so the queue keeps moving. */
export const MAX_ROUNDS = 2;
const PER_WAVE = 2;
const SHOTS = 3;
const FLY = { x0: 6, x1: W - BIRD_W - 6, y0: 6, y1: GRASS_Y - BIRD_H - 14 };
/** Extra forgiveness around a bird for a hand-held aim. */
const HIT_PAD = 5;

type BirdState = "rise" | "fly" | "hit" | "fall" | "escape" | "gone";

interface Bird {
  slot: number;
  species: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  speed: number;
  state: BirdState;
  t: number;
  turnIn: number;
  caught: boolean;
}

interface Popup {
  x: number;
  y: number;
  text: string;
  t: number;
}

interface Feather {
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
  color: string;
}

type Phase =
  | { kind: "title"; t: number }
  | { kind: "roundIntro"; t: number }
  | { kind: "wave"; t: number }
  | { kind: "fox"; t: number; caught: number; x: number }
  | { kind: "tally"; t: number; passed: boolean }
  | { kind: "over"; t: number; cleared: boolean; reported: boolean };

export interface Button {
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RunSummary {
  score: number;
  /** Rounds passed, 0 to MAX_ROUNDS. */
  roundsCleared: number;
  /** The round the run ended on. */
  round: number;
  hits: number;
  birds: number;
  shots: number;
  cleared: boolean;
}

export interface WorldEvents {
  onStart?: () => void;
  onRound?: (round: number) => void;
  onShot?: (hit: boolean) => void;
  /** The run ended (failed a round, or cleared the last one); fires once the end banner has shown. */
  onGameOver?: (run: RunSummary) => void;
}

export class World {
  private birds!: BirdSprites;
  private fox!: Record<FoxPose, HTMLCanvasElement>;
  private backdrop!: HTMLCanvasElement;
  private foreground!: HTMLCanvasElement;
  private shells!: [HTMLCanvasElement, HTMLCanvasElement];
  private marks!: { idle: HTMLCanvasElement; hit: HTMLCanvasElement; miss: HTMLCanvasElement; now: HTMLCanvasElement };
  private clouds: { img: HTMLCanvasElement; x: number; y: number; v: number }[] = [];

  phase: Phase = { kind: "title", t: 0 };
  round = 1;
  score = 0;
  best = 0;
  private wave = 0;
  private shots = SHOTS;
  private flock: Bird[] = [];
  /** Per bird of the round: null = not flown yet. */
  private results: (boolean | null)[] = [];
  private popups: Popup[] = [];
  private feathers: Feather[] = [];
  private demo: Bird[] = [];
  private shake = 0;
  private flash = 0;
  private escapeTint = 0;
  private time = 0;
  private flapClock = 0;
  private lastFall = { x: W / 2 };
  private totals = { hits: 0, shots: 0, birds: 0, roundsCleared: 0 };

  constructor(
    private readonly sfx: Sfx,
    private readonly events: WorldEvents = {},
  ) {
    this.birds = buildBirds();
    this.fox = buildFox();
    this.backdrop = buildBackdrop();
    this.foreground = buildForeground();
    this.shells = [buildShell(true), buildShell(false)];
    this.marks = {
      idle: tinyBird("#f4ecd8"),
      hit: tinyBird("#e2473b"),
      miss: tinyBird("#5a4a3c"),
      now: tinyBird("#f2c14e"),
    };
    for (let i = 0; i < 4; i++) {
      this.clouds.push({ img: buildCloud(11 + i * 17), x: i * 92 + 10, y: 10 + ((i * 23) % 50), v: 2 + (i % 3) });
    }
    this.toTitle();
  }

  /* ── Buttons the reticle can shoot ────────────────────────────────── */

  button(): Button | null {
    if (this.phase.kind === "title" && this.phase.t > 0.4) return { label: "START", x: W / 2 - 34, y: 96, w: 68, h: 18 };
    return null;
  }

  /* ── Flow ─────────────────────────────────────────────────────────── */

  toTitle() {
    this.phase = { kind: "title", t: 0 };
    this.demo = [this.spawn(0, 0, 0.8), this.spawn(1, 1, 0.8), this.spawn(2, 2, 0.8)];
    for (const b of this.demo) {
      b.state = "fly";
      b.y = 20 + Math.random() * 60;
    }
  }

  private startGame() {
    this.round = 1;
    this.score = 0;
    this.totals = { hits: 0, shots: 0, birds: 0, roundsCleared: 0 };
    this.sfx.start();
    this.events.onStart?.();
    this.startRound();
  }

  private startRound() {
    this.wave = 0;
    this.results = new Array<boolean | null>(BIRDS_PER_ROUND).fill(null);
    this.flock = [];
    this.phase = { kind: "roundIntro", t: 0 };
    this.sfx.roundStart();
    this.events.onRound?.(this.round);
  }

  /** Hits needed this round: 4 of 10 at first, up to 9. */
  get need() {
    return Math.min(9, 3 + this.round);
  }

  private startWave() {
    this.shots = SHOTS;
    this.flock = [];
    for (let i = 0; i < PER_WAVE; i++) {
      const slot = this.wave * PER_WAVE + i;
      const r = Math.random();
      const species = r < 0.1 + this.round * 0.02 ? 2 : r < 0.45 ? 1 : 0;
      this.flock.push(this.spawn(slot, species, 1));
    }
    this.phase = { kind: "wave", t: 0 };
    this.sfx.chirp();
  }

  private spawn(slot: number, species: number, speedScale: number): Bird {
    const base = Math.min(118, 40 + this.round * 7) * SPECIES[species].speed * speedScale;
    const x = 50 + Math.random() * (W - 100 - BIRD_W);
    return {
      slot,
      species,
      x,
      y: GRASS_Y - 4,
      vx: 0,
      vy: -base * 0.8,
      speed: base,
      state: "rise",
      t: 0,
      turnIn: 0.3 + Math.random() * 0.4,
      caught: false,
    };
  }

  /** Wave time before birds escape, shortening with rounds. */
  private get waveTime() {
    return Math.max(4.5, 7.5 - this.round * 0.3);
  }

  /* ── Input ────────────────────────────────────────────────────────── */

  /** A shot at logical coordinates. Returns true if it hit something. */
  fire(x: number, y: number): boolean {
    const btn = this.button();
    if (btn) {
      this.sfx.shot();
      this.shake = 0.12;
      if (x >= btn.x - 4 && x <= btn.x + btn.w + 4 && y >= btn.y - 4 && y <= btn.y + btn.h + 4) {
        this.startGame();
        return true;
      }
      return false;
    }
    if (this.phase.kind !== "wave") return false;
    if (this.shots <= 0) {
      this.sfx.empty();
      return false;
    }
    this.shots -= 1;
    this.totals.shots += 1;
    this.sfx.shot();
    this.shake = 0.12;
    this.flash = 0.05;

    let hitAny = false;
    // Closest live bird to the shot wins, so one shot takes one bird.
    let target: Bird | null = null;
    let bestD = Infinity;
    for (const b of this.flock) {
      if (b.state !== "fly" && b.state !== "rise") continue;
      if (x < b.x - HIT_PAD || x > b.x + BIRD_W + HIT_PAD || y < b.y - HIT_PAD || y > b.y + BIRD_H + HIT_PAD) continue;
      const d = Math.hypot(x - (b.x + BIRD_W / 2), y - (b.y + BIRD_H / 2));
      if (d < bestD) {
        bestD = d;
        target = b;
      }
    }
    if (target) {
      hitAny = true;
      this.totals.hits += 1;
      target.state = "hit";
      target.t = 0;
      target.caught = true;
      this.results[target.slot] = true;
      const pts = SPECIES[target.species].points * Math.ceil(this.round / 2);
      this.score += pts;
      this.popups.push({ x: target.x + BIRD_W / 2, y: target.y, text: String(pts), t: 0 });
      for (let i = 0; i < 7; i++) {
        this.feathers.push({
          x: target.x + BIRD_W / 2,
          y: target.y + BIRD_H / 2,
          vx: (Math.random() - 0.5) * 50,
          vy: -Math.random() * 30,
          t: 0,
          color: i % 2 ? SPECIES[target.species].body : SPECIES[target.species].belly,
        });
      }
      this.sfx.hit();
    }
    this.events.onShot?.(hitAny);
    return hitAny;
  }

  /* ── Update ───────────────────────────────────────────────────────── */

  update(dt: number) {
    this.time += dt;
    this.phase.t += dt;
    this.shake = Math.max(0, this.shake - dt);
    this.flash = Math.max(0, this.flash - dt);
    this.escapeTint = Math.max(0, this.escapeTint - dt);
    for (const c of this.clouds) {
      c.x += c.v * dt;
      if (c.x > W + 10) c.x = -60;
    }
    for (const p of this.popups) {
      p.t += dt;
      p.y -= 10 * dt;
    }
    this.popups = this.popups.filter((p) => p.t < 1);
    for (const f of this.feathers) {
      f.t += dt;
      f.vx *= 0.96;
      f.vy = Math.min(14, f.vy + 40 * dt);
      f.x += (f.vx + Math.sin(f.t * 9) * 8) * dt;
      f.y += f.vy * dt;
    }
    this.feathers = this.feathers.filter((f) => f.t < 1.6);

    const p = this.phase;
    switch (p.kind) {
      case "title":
        for (const b of this.demo) this.steer(b, dt, true);
        break;
      case "roundIntro":
        if (p.t > 2.3) this.startWave();
        break;
      case "wave":
        this.updateWave(dt);
        break;
      case "fox":
        if (p.t > 2.4) {
          this.wave += 1;
          if (this.wave * PER_WAVE >= BIRDS_PER_ROUND) {
            const hits = this.results.filter((r) => r === true).length;
            const passed = hits >= this.need;
            this.totals.birds += BIRDS_PER_ROUND;
            if (passed) this.totals.roundsCleared += 1;
            this.phase = { kind: "tally", t: 0, passed };
            if (passed) {
              this.sfx.roundClear();
              if (hits === BIRDS_PER_ROUND) {
                this.score += 5000;
                this.sfx.perfect();
              }
            } else {
              this.sfx.gameOver();
            }
          } else {
            this.startWave();
          }
        }
        break;
      case "tally":
        if (p.t > 3.4) {
          if (p.passed && this.round < MAX_ROUNDS) {
            this.round += 1;
            this.startRound();
          } else {
            this.best = Math.max(this.best, this.score);
            this.phase = { kind: "over", t: 0, cleared: p.passed, reported: false };
            if (p.passed) this.sfx.cheer();
            else this.sfx.laugh();
          }
        }
        break;
      case "over":
        // A moment on the end banner, then the results screen takes over.
        if (!p.reported && p.t > 1.8) {
          p.reported = true;
          this.events.onGameOver?.({
            score: this.score,
            roundsCleared: this.totals.roundsCleared,
            round: this.round,
            hits: this.totals.hits,
            birds: this.totals.birds,
            shots: this.totals.shots,
            cleared: p.cleared,
          });
        }
        break;
    }
  }

  private updateWave(dt: number) {
    const p = this.phase;
    if (p.kind !== "wave") return;
    const escaping = p.t > this.waveTime || this.shots <= 0;
    let alive = 0;
    for (const b of this.flock) {
      if (escaping && (b.state === "fly" || b.state === "rise")) {
        b.state = "escape";
        b.vx = (Math.random() - 0.5) * 30;
        b.vy = -b.speed * 1.5;
        this.results[b.slot] = false;
        this.escapeTint = 1.2;
        this.sfx.flyAway();
      }
      this.steer(b, dt, false);
      if (b.state !== "gone") alive += 1;
    }
    this.flapClock += dt;
    if (this.flapClock > 0.32 && this.flock.some((b) => b.state === "fly")) {
      this.flapClock = 0;
      this.sfx.flap();
    }
    if (alive === 0) {
      const caught = this.flock.filter((b) => b.caught).length;
      this.phase = { kind: "fox", t: 0, caught, x: Math.min(W - 60, Math.max(28, this.lastFall.x - FOX_W / 2)) };
      if (caught > 0) this.sfx.cheer();
      else this.sfx.laugh();
    }
  }

  private steer(b: Bird, dt: number, demo: boolean) {
    b.t += dt;
    switch (b.state) {
      case "rise":
        b.y += b.vy * dt;
        if (b.y < GRASS_Y - BIRD_H - 18) {
          b.state = "fly";
          this.retarget(b);
        }
        break;
      case "fly": {
        b.turnIn -= dt;
        if (b.turnIn <= 0) this.retarget(b);
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        const y1 = demo ? 86 : FLY.y1;
        if (b.x < FLY.x0) {
          b.x = FLY.x0;
          b.vx = Math.abs(b.vx);
        } else if (b.x > FLY.x1) {
          b.x = FLY.x1;
          b.vx = -Math.abs(b.vx);
        }
        if (b.y < FLY.y0) {
          b.y = FLY.y0;
          b.vy = Math.abs(b.vy);
        } else if (b.y > y1) {
          b.y = y1;
          b.vy = -Math.abs(b.vy);
        }
        break;
      }
      case "hit":
        if (b.t > 0.4) {
          b.state = "fall";
          b.t = 0;
          this.sfx.fall();
        }
        break;
      case "fall":
        b.y += 115 * dt;
        if (b.y > GRASS_Y + 4) {
          b.state = "gone";
          this.lastFall = { x: b.x + BIRD_W / 2 };
          this.sfx.land();
        }
        break;
      case "escape":
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        if (b.y < -BIRD_H - 4) b.state = "gone";
        break;
      case "gone":
        break;
    }
  }

  /** New heading: mostly diagonal, like a startled bird zig-zagging. */
  private retarget(b: Bird) {
    const side = Math.random() < 0.5 ? -1 : 1;
    const angle = (0.25 + Math.random() * 0.4) * Math.PI;
    b.vx = Math.cos(angle) * b.speed * side * (Math.random() < 0.5 ? 1 : -1);
    b.vy = -Math.sin(angle) * b.speed * (Math.random() < 0.6 ? 1 : -1);
    if (Math.abs(b.vx) < b.speed * 0.35) b.vx = b.speed * 0.35 * side;
    b.turnIn = 0.55 + Math.random() * 1.1;
  }

  /* ── Drawing ──────────────────────────────────────────────────────── */

  render(ctx: CanvasRenderingContext2D) {
    ctx.save();
    if (this.shake > 0) ctx.translate(Math.round((Math.random() - 0.5) * 3), Math.round((Math.random() - 0.5) * 3));

    ctx.drawImage(this.backdrop, 0, 0);
    if (this.escapeTint > 0) {
      ctx.globalAlpha = Math.min(0.45, this.escapeTint * 0.4);
      ctx.fillStyle = "#f08a9a";
      ctx.fillRect(0, 0, W, GRASS_Y);
      ctx.globalAlpha = 1;
    }
    for (const c of this.clouds) ctx.drawImage(c.img, Math.round(c.x), Math.round(c.y));

    const p = this.phase;
    const list = p.kind === "title" ? this.demo : this.flock;
    for (const b of list) this.drawBird(ctx, b);
    for (const f of this.feathers) {
      ctx.globalAlpha = Math.max(0, 1 - f.t / 1.6);
      ctx.fillStyle = f.color;
      ctx.fillRect(Math.round(f.x), Math.round(f.y), 2, 1);
    }
    ctx.globalAlpha = 1;

    if (p.kind === "fox") this.drawFox(ctx, p.t, p.caught, p.x);
    if (p.kind === "over") this.drawFox(ctx, p.t, p.cleared ? 1 : 0, 236);
    if (p.kind === "title") this.drawFoxWave(ctx, p.t);

    ctx.drawImage(this.foreground, 0, 0);

    for (const pop of this.popups) {
      drawTextCentered(ctx, pop.text, pop.x, Math.round(pop.y), "#ffffff", 1, INK);
    }

    if (p.kind === "title") this.drawTitle(ctx, p.t);
    else this.drawHud(ctx);

    if (p.kind === "roundIntro") this.drawBanner(ctx, ["ROUND", `${this.round} OF ${MAX_ROUNDS}`], `HIT ${this.need} OF ${BIRDS_PER_ROUND}`);
    if (p.kind === "wave" && this.escapeTint > 0.3) this.drawBanner(ctx, ["FLEW AWAY"]);
    if (p.kind === "tally") {
      const hits = this.results.filter((r) => r === true).length;
      if (p.passed && this.round >= MAX_ROUNDS) this.drawBanner(ctx, ["ALL CLEAR!"], hits === BIRDS_PER_ROUND ? "BONUS 5000" : `${hits} OF ${BIRDS_PER_ROUND} HIT`);
      else if (p.passed) this.drawBanner(ctx, [hits === BIRDS_PER_ROUND ? "PERFECT!" : "CLEAR!"], hits === BIRDS_PER_ROUND ? "BONUS 5000" : `${hits} OF ${BIRDS_PER_ROUND} HIT`);
      else this.drawBanner(ctx, ["OUT OF LUCK"], `${hits} OF ${this.need} NEEDED`);
    }
    if (p.kind === "over") this.drawGameOver(ctx, p.cleared);

    if (this.flash > 0) {
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  private drawBird(ctx: CanvasRenderingContext2D, b: Bird) {
    if (b.state === "gone") return;
    const facing = b.vx < 0 ? 1 : 0;
    const x = Math.round(b.x);
    const y = Math.round(b.y);
    if (b.state === "hit") {
      ctx.drawImage(this.birds.fly[b.species].hit[facing], x, y);
      return;
    }
    if (b.state === "fall") {
      const spin = Math.floor(b.t * 10) % 2;
      ctx.drawImage(this.birds.fall[b.species][spin], x, y);
      return;
    }
    const rate = b.state === "escape" ? 16 : 11;
    const seq: BirdPose[] = ["up", "mid", "down", "mid"];
    const pose = seq[Math.floor((this.time + b.slot * 0.13) * rate) % seq.length];
    ctx.drawImage(this.birds.fly[b.species][pose][facing], x, y);
  }

  /** Fox pops out of the grass, cheering with the catch or laughing at a miss. */
  private drawFox(ctx: CanvasRenderingContext2D, t: number, caught: number, x: number) {
    const rise = Math.min(1, t / 0.35);
    const sink = t > 1.9 ? Math.min(1, (t - 1.9) / 0.35) : 0;
    const top = GRASS_Y + 8 - (FOX_H - 6) * rise + (FOX_H - 6) * sink;
    let pose: FoxPose;
    let bob = 0;
    if (caught > 0) {
      pose = caught > 1 ? "cheer2" : "cheer1";
    } else {
      pose = Math.floor(t * 8) % 2 ? "laughA" : "laughB";
      bob = Math.floor(t * 8) % 2;
    }
    const fx = Math.round(x);
    const fy = Math.round(top + bob);
    ctx.drawImage(this.fox[pose], fx, fy);
    // Held birds hang from the raised paws.
    if (caught > 0) {
      const held = this.flock.filter((b) => b.caught);
      const paws = [
        { x: fx + 3 - BIRD_W / 2, y: fy + 10 - BIRD_H + 2 },
        { x: fx + 28 - BIRD_W / 2, y: fy + 10 - BIRD_H + 2 },
      ];
      held.slice(0, 2).forEach((b, i) => {
        const paw = paws[i];
        ctx.drawImage(this.birds.fall[b.species][0], Math.round(paw.x), Math.round(paw.y - 10));
      });
    }
  }

  private drawFoxWave(ctx: CanvasRenderingContext2D, t: number) {
    const peek = Math.sin(t * 1.4) > 0.2 ? 1 : 0;
    ctx.drawImage(peek ? this.fox.wave : this.fox.cheer1, 250, GRASS_Y - FOX_H + 14);
  }

  private panel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
    ctx.fillStyle = INK;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = "#e9d8a6";
    ctx.fillRect(x, y, w, 1);
    ctx.fillRect(x, y + h - 1, w, 1);
    ctx.fillRect(x, y, 1, h);
    ctx.fillRect(x + w - 1, y, 1, h);
  }

  private drawHud(ctx: CanvasRenderingContext2D) {
    const y = HUD_Y + 5;
    // Round tag.
    drawText(ctx, `R${this.round}/${MAX_ROUNDS}`, 14, y - 1, "#b7f08a", 1, INK);

    // Shots.
    this.panel(ctx, 12, y + 6, 24, 18);
    for (let i = 0; i < SHOTS; i++) ctx.drawImage(this.shells[i < this.shots ? 0 : 1], 16 + i * 6, y + 9);
    drawText(ctx, "SHOT", 16, y + 18, "#7ad3f0");

    // Hit tracker with the pass line.
    const hx = 44;
    this.panel(ctx, hx, y, 172, 24);
    drawText(ctx, "HIT", hx + 5, y + 5, "#b7f08a");
    const flashOn = Math.floor(this.time * 4) % 2 === 0;
    for (let i = 0; i < BIRDS_PER_ROUND; i++) {
      const r = this.results[i];
      const current = this.phase.kind === "wave" && Math.floor(i / PER_WAVE) === this.wave && r === null;
      let img = this.marks.idle;
      if (r === true) img = this.marks.hit;
      else if (r === false) img = this.marks.miss;
      else if (current) img = flashOn ? this.marks.now : this.marks.idle;
      ctx.drawImage(img, hx + 22 + i * 14, y + 4);
    }
    // Bar under the marks: filled up to the number needed.
    ctx.fillStyle = "#2f6fb0";
    ctx.fillRect(hx + 22, y + 13, BIRDS_PER_ROUND * 14 - 7, 3);
    ctx.fillStyle = "#7ad3f0";
    ctx.fillRect(hx + 22, y + 13, this.need * 14 - 7, 3);
    drawText(ctx, `NEED ${this.need}`, hx + 22, y + 18, "#e9d8a6");

    // Score.
    this.panel(ctx, 224, y, 84, 24);
    const s = String(Math.min(999999, this.score)).padStart(6, "0");
    drawText(ctx, s, 266 - textWidth(s, 1), y + 5, "#ffffff", 1);
    drawText(ctx, "SCORE", 266 - textWidth("SCORE", 1), y + 14, "#e9d8a6");
    drawText(ctx, "TOP", 280, y + 5, "#7ad3f0");
    drawText(ctx, String(Math.max(this.best, this.score)).slice(0, 6), 280, y + 14, "#7ad3f0");
  }

  private drawBanner(ctx: CanvasRenderingContext2D, lines: string[], sub?: string) {
    const big = lines.join(" ");
    const w = Math.max(textWidth(big, 2), sub ? textWidth(sub, 1) : 0) + 24;
    const h = sub ? 34 : 24;
    const x = Math.round(W / 2 - w / 2);
    const y = 46;
    this.panel(ctx, x, y, w, h);
    drawTextCentered(ctx, big, W / 2, y + 7, "#ffffff", 2);
    if (sub) drawTextCentered(ctx, sub, W / 2, y + 23, "#f2c14e", 1);
  }

  private drawButton(ctx: CanvasRenderingContext2D, b: Button, t: number) {
    const pulse = Math.floor(t * 3) % 2 === 0;
    ctx.fillStyle = INK;
    ctx.fillRect(b.x + 2, b.y + 2, b.w, b.h);
    ctx.fillStyle = pulse ? "#f2c14e" : "#f6d36d";
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = INK;
    ctx.fillRect(b.x, b.y, b.w, 1);
    ctx.fillRect(b.x, b.y + b.h - 1, b.w, 1);
    ctx.fillRect(b.x, b.y, 1, b.h);
    ctx.fillRect(b.x + b.w - 1, b.y, 1, b.h);
    drawTextCentered(ctx, b.label, b.x + b.w / 2, b.y + 4, INK, 2);
    // Corner target ticks.
    ctx.fillStyle = "#ffffff";
    for (const [cx, cy] of [
      [b.x - 4, b.y - 4],
      [b.x + b.w + 1, b.y - 4],
      [b.x - 4, b.y + b.h + 1],
      [b.x + b.w + 1, b.y + b.h + 1],
    ]) {
      ctx.fillRect(cx, cy, 3, 3);
    }
  }

  private drawTitle(ctx: CanvasRenderingContext2D, t: number) {
    // Logo plate.
    const w = 196;
    const x = W / 2 - w / 2;
    ctx.fillStyle = INK;
    ctx.fillRect(x, 16, w, 60);
    ctx.fillStyle = "#e9d8a6";
    ctx.fillRect(x + 3, 46, w - 6, 1);
    drawTextCentered(ctx, "SKY", W / 2, 22, "#2f6fb0", 4);
    drawTextCentered(ctx, "SKY", W / 2, 21, "#7ad3f0", 4);
    drawTextCentered(ctx, "SHOT", W / 2, 50, "#a33a2c", 4);
    drawTextCentered(ctx, "SHOT", W / 2, 49, "#f2c14e", 4);
    drawTextCentered(ctx, "POINT YOUR FINGER. DROP YOUR THUMB TO FIRE.", W / 2, 84, "#ffffff", 1, INK);
    const b = this.button();
    if (b) this.drawButton(ctx, b, t);
    if (this.best > 0) drawTextCentered(ctx, `TOP SCORE ${this.best}`, W / 2, HUD_Y + 12, "#f2c14e", 1, INK);
    else drawTextCentered(ctx, "HAND TRACKED ON THIS LAPTOP. NO PICTURES SAVED.", W / 2, HUD_Y + 12, "#e9d8a6", 1, INK);
  }

  private drawGameOver(ctx: CanvasRenderingContext2D, cleared: boolean) {
    const w = 150;
    const x = W / 2 - w / 2;
    this.panel(ctx, x, 30, w, 44);
    drawTextCentered(ctx, cleared ? "WELL DONE!" : "GAME OVER", W / 2, 37, "#ffffff", 2);
    drawTextCentered(ctx, `SCORE ${this.score}`, W / 2, 56, "#f2c14e", 1);
  }
}
