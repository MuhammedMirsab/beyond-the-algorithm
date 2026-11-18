import * as Phaser from "phaser";
import { audio } from "../../audio/audio";
import { BALL_R, HIT_R, KILL_Y, PHYS, PICK_R, TEX, WORLD_H } from "../config";
import { CONTEXT_KEY, type GameContext } from "../context";
import { canvasFont } from "../fonts";
import type { LevelResult } from "../bridge";
import { keyboardSign } from "../levels";
import type { BarDef, CrusherDef, LevelDef, MoverDef, PointDef, SawDef } from "../levels/types";
import {
  barTexture,
  canvasTexture,
  crusherRailTexture,
  crusherTexture,
  makeThemeTextures,
  NINE,
  sawTexture,
  signTexture,
  spikeTexture,
} from "../textures";
import { BALL_COLORS, hex, THEMES, type Theme } from "../themes";

export interface PlayData {
  level: LevelDef;
  levelIndex: number;
}

const BODY_W = 40;
const BODY_H = BALL_R * 2;
const GROUND_BOTTOM = WORLD_H + 80;

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Mover {
  def: MoverDef;
  body: Phaser.Physics.Arcade.Image;
  view: Phaser.GameObjects.NineSlice;
  h: number;
  /** Centre position at phase 0. */
  x0: number;
  y0: number;
}

interface Hazard {
  update(t: number, dt: number): void;
  hits(x: number, y: number, r: number): boolean;
}

interface Spark {
  x: number;
  y: number;
  img: Phaser.GameObjects.Image;
  glow: Phaser.GameObjects.Image;
  taken: boolean;
}

interface Checkpoint {
  x: number;
  y: number;
  img: Phaser.GameObjects.Image;
  active: boolean;
}

interface Pad {
  x: number;
  y: number;
  img: Phaser.GameObjects.Image;
  cooldown: number;
}

interface Boost {
  x: number;
  y: number;
  img: Phaser.GameObjects.Image;
  cooldown: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const smooth = (u: number) => 0.5 - 0.5 * Math.cos(u * Math.PI * 2);

function circleRect(cx: number, cy: number, r: number, rx: number, ry: number, rw: number, rh: number) {
  const nx = clamp(cx, rx, rx + rw);
  const ny = clamp(cy, ry, ry + rh);
  return (cx - nx) ** 2 + (cy - ny) ** 2 < r * r;
}

function segmentDist(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy || 1;
  const u = clamp(((px - ax) * dx + (py - ay) * dy) / len2, 0, 1);
  return Math.hypot(px - (ax + dx * u), py - (ay + dy * u));
}

/**
 * The game world: builds a level from data, simulates the ball, and reports
 * progress through the shared GameContext. Movement is driven only by
 * GameInput (face or keyboard).
 */
export class PlayScene extends Phaser.Scene {
  private ctx!: GameContext;
  private def!: LevelDef;
  private theme!: Theme;
  private levelIndex = 0;
  private practice = false;

  private ball!: Phaser.Physics.Arcade.Image;
  private ballView!: Phaser.GameObjects.Container;
  private ballBase!: Phaser.GameObjects.Image;
  private ballShadow!: Phaser.GameObjects.Image;
  private surfaces: Rect[] = [];
  private movers: Mover[] = [];
  private hazards: Hazard[] = [];
  private sparks: Spark[] = [];
  private checkpoints: Checkpoint[] = [];
  private pads: Pad[] = [];
  private boosts: Boost[] = [];
  private finishGlow?: Phaser.GameObjects.Image;

  private dust!: Phaser.GameObjects.Particles.ParticleEmitter;
  private burst!: Phaser.GameObjects.Particles.ParticleEmitter;
  private shatter!: Phaser.GameObjects.Particles.ParticleEmitter;
  private confetti!: Phaser.GameObjects.Particles.ParticleEmitter;
  private trail!: Phaser.GameObjects.Particles.ParticleEmitter;

  private running = false;
  private t = 0;
  private grounded = false;
  private lastGroundedAt = -10;
  private prevVy = 0;
  private roll = 0;
  private respawn: PointDef = { x: 0, y: 0 };
  private dead = false;
  private finished = false;
  private invulnUntil = 0;
  private boostUntil = 0;
  private boostDir = 1;
  private comboUntil = 0;
  private combo = 0;
  private lookAhead = 0;
  private camX = 0;
  private squash?: Phaser.Tweens.Tween;

  constructor() {
    super("play");
  }

  init(data: PlayData) {
    this.def = data.level;
    this.levelIndex = data.levelIndex;
    this.practice = !!data.level.practice;
    this.theme = THEMES[data.level.theme];
    this.surfaces = [];
    this.movers = [];
    this.hazards = [];
    this.sparks = [];
    this.checkpoints = [];
    this.pads = [];
    this.boosts = [];
    this.finishGlow = undefined;
    this.running = false;
    this.t = 0;
    this.grounded = false;
    this.lastGroundedAt = -10;
    this.prevVy = 0;
    this.roll = 0;
    this.dead = false;
    this.finished = false;
    this.invulnUntil = 0;
    this.boostUntil = 0;
    this.combo = 0;
    this.comboUntil = 0;
    this.lookAhead = 0;
    this.squash = undefined;
  }

  create() {
    this.ctx = this.registry.get(CONTEXT_KEY) as GameContext;
    const def = this.def;
    const theme = this.theme;
    makeThemeTextures(this, theme);

    // World & camera.
    this.physics.world.setBounds(0, -2000, def.width, 2000 + KILL_Y + 400);
    this.physics.world.setBoundsCollision(true, true, false, false);
    this.physics.world.pause();
    const cam = this.cameras.main;
    cam.setBounds(0, 0, def.width, WORLD_H);
    this.fitCamera();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.fitCamera, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.fitCamera, this);
      this.ctx.view.active = false;
    });

    // Static platforms.
    const statics = this.physics.add.staticGroup();
    for (const p of def.platforms) {
      const h = p.h ?? GROUND_BOTTOM - p.y;
      const body = statics.create(p.x + p.w / 2, p.y + h / 2, "px") as Phaser.Physics.Arcade.Image;
      body.setDisplaySize(p.w, h).setVisible(false).refreshBody();
      this.add
        .nineslice(p.x, p.y, `platform-${theme.id}`, undefined, p.w * TEX, h * TEX, NINE.left * TEX, NINE.right * TEX, NINE.top * TEX, NINE.bottom * TEX)
        .setOrigin(0, 0)
        .setScale(1 / TEX)
        .setDepth(1);
      this.surfaces.push({ x: p.x, y: p.y, w: p.w, h });
    }

    // Moving platforms.
    const moverGroup = this.physics.add.group({ allowGravity: false, immovable: true });
    for (const m of def.movers ?? []) {
      const h = 30;
      const body = moverGroup.create(m.x + m.w / 2, m.y + h / 2, "px") as Phaser.Physics.Arcade.Image;
      body.setVisible(false);
      const b = body.body as Phaser.Physics.Arcade.Body;
      b.setSize(m.w, h);
      b.setAllowGravity(false);
      b.setImmovable(true);
      b.pushable = false;
      const view = this.add
        .nineslice(m.x, m.y, `mover-${theme.id}`, undefined, m.w * TEX, h * TEX, NINE.left * TEX, NINE.right * TEX, NINE.top * TEX, NINE.bottom * TEX)
        .setOrigin(0, 0)
        .setScale(1 / TEX)
        .setDepth(1.1);
      // Dotted track shows where it travels.
      const track = this.add.graphics().setDepth(0.4);
      track.fillStyle(hex(theme.mover.top), 0.5);
      const cx = m.x + m.w / 2;
      const cy = m.y + h / 2;
      const len = Math.hypot(m.dx ?? 0, m.dy ?? 0);
      for (let d = 0; d <= len; d += 14) {
        const u = len ? d / len : 0;
        track.fillCircle(cx + (m.dx ?? 0) * u, cy + (m.dy ?? 0) * u, 2);
      }
      this.movers.push({ def: m, body, view, h, x0: cx, y0: cy });
    }

    // Hazards.
    for (const s of def.spikes ?? []) {
      this.add.image(s.x, s.y + 1, spikeTexture(this, theme, s.w)).setOrigin(0, 1).setScale(1 / TEX).setDepth(2);
      const rect = { x: s.x + 3, y: s.y - 15, w: s.w - 6, h: 15 };
      this.hazards.push({ update() {}, hits: (x, y, r) => circleRect(x, y, r, rect.x, rect.y, rect.w, rect.h) });
    }
    for (const s of def.saws ?? []) this.hazards.push(this.makeSaw(s));
    for (const c of def.crushers ?? []) this.hazards.push(this.makeCrusher(c));
    for (const b of def.bars ?? []) this.hazards.push(this.makeBar(b));

    // Pads & boosts.
    for (const p of def.pads ?? []) {
      const img = this.add.image(p.x, p.y + 1, `pad-${theme.id}`).setOrigin(0.5, 1).setScale(1 / TEX).setDepth(2);
      this.pads.push({ x: p.x, y: p.y, img, cooldown: 0 });
    }
    for (const b of def.boosts ?? []) {
      const img = this.add.image(b.x, b.y - 9, `boost-${theme.id}`).setScale(1 / TEX).setDepth(2);
      this.tweens.add({ targets: img, alpha: { from: 1, to: 0.45 }, duration: 520, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
      this.boosts.push({ x: b.x, y: b.y, img, cooldown: 0 });
    }

    // Signs. They teach whichever controls are in use when the level is built.
    const keys = !this.ctx.input.faceActive;
    for (const sign of def.signs ?? []) {
      const s = keys ? keyboardSign(sign) : sign;
      const { key } = signTexture(this, theme, s.icon, s.text);
      this.add.image(s.x, s.y, key).setOrigin(0.5, 1).setScale(1 / TEX).setDepth(0.5);
    }

    // Sparks.
    for (const p of def.sparks) {
      const glow = this.add.image(p.x, p.y, "glow").setTint(hex(theme.spark)).setScale(0.75).setAlpha(0.55).setDepth(3);
      glow.setBlendMode(Phaser.BlendModes.ADD);
      const img = this.add.image(p.x, p.y, `spark-${theme.id}`).setScale(1 / TEX).setDepth(3.1);
      const delay = (p.x * 3) % 900;
      this.tweens.add({ targets: [img, glow], y: p.y - 5, duration: 900, yoyo: true, repeat: -1, ease: "Sine.easeInOut", delay });
      this.tweens.add({ targets: img, angle: { from: -8, to: 8 }, duration: 1300, yoyo: true, repeat: -1, ease: "Sine.easeInOut", delay });
      this.tweens.add({ targets: glow, alpha: { from: 0.35, to: 0.7 }, duration: 1100, yoyo: true, repeat: -1, delay });
      this.sparks.push({ x: p.x, y: p.y, img, glow, taken: false });
    }

    // Checkpoints.
    for (const c of def.checkpoints ?? []) {
      const img = this.add.image(c.x, c.y + 1, `flag-${theme.id}-idle`).setOrigin(0.12, 1).setScale(1 / TEX).setDepth(2);
      this.checkpoints.push({ x: c.x, y: c.y, img, active: false });
    }

    // Finish gate.
    if (def.finish) {
      const f = def.finish;
      this.finishGlow = this.add
        .image(f.x, f.y - 100, "glow")
        .setTint(hex(theme.spark))
        .setDisplaySize(170, 260)
        .setAlpha(0.35)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(0.45);
      this.tweens.add({ targets: this.finishGlow, alpha: { from: 0.22, to: 0.45 }, duration: 1200, yoyo: true, repeat: -1 });
      this.add.image(f.x, f.y + 1, `finish-${theme.id}`).setOrigin(0.5, 1).setScale(1 / TEX).setDepth(0.5);
    }

    // Floating "+100" label.
    canvasTexture(this, `plus-${theme.id}`, 60, 24, (c) => {
      c.font = canvasFont(600, 16);
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.lineWidth = 3;
      c.strokeStyle = theme.id === "dawn" ? "rgba(42,35,31,0.85)" : "rgba(0,0,0,0.55)";
      c.strokeText("+100", 30, 12);
      c.fillStyle = theme.spark;
      c.fillText("+100", 30, 12);
    });

    // Particles.
    this.dust = this.add.particles(0, 0, "dot", {
      lifespan: { min: 300, max: 560 },
      speed: { min: 30, max: 120 },
      angle: { min: 195, max: 345 },
      gravityY: 260,
      scale: { start: 0.2, end: 0 },
      alpha: { start: 0.75, end: 0 },
      tint: theme.dust,
      emitting: false,
    });
    this.dust.setDepth(8);
    this.burst = this.add.particles(0, 0, "dot", {
      lifespan: { min: 320, max: 620 },
      speed: { min: 70, max: 240 },
      angle: { min: 0, max: 360 },
      scale: { start: 0.22, end: 0 },
      alpha: { start: 1, end: 0 },
      tint: hex(theme.spark),
      blendMode: Phaser.BlendModes.ADD,
      emitting: false,
    });
    this.burst.setDepth(8);
    this.shatter = this.add.particles(0, 0, "chip", {
      lifespan: { min: 600, max: 1000 },
      speed: { min: 140, max: 440 },
      angle: { min: 190, max: 350 },
      gravityY: 1100,
      rotate: { min: 0, max: 360 },
      scale: { start: 0.45, end: 0.15 },
      alpha: { start: 1, end: 0.2 },
      tint: [hex(BALL_COLORS.base), hex(BALL_COLORS.band), hex(BALL_COLORS.bandEdge)],
      emitting: false,
    });
    this.shatter.setDepth(8);
    this.confetti = this.add.particles(0, 0, "confetti", {
      lifespan: { min: 1400, max: 2200 },
      speed: { min: 220, max: 560 },
      angle: { min: 235, max: 305 },
      gravityY: 520,
      rotate: { start: 0, end: 540 },
      scale: { start: 0.5, end: 0.3 },
      tint: [hex(theme.spark), hex(BALL_COLORS.base), hex(theme.flag.active), hex(theme.platform.lip)],
      emitting: false,
    });
    this.confetti.setDepth(8);
    this.trail = this.add.particles(0, 0, "dot", {
      lifespan: 240,
      speed: 0,
      scale: { start: 0.42, end: 0 },
      alpha: { start: 0.28, end: 0 },
      tint: hex(BALL_COLORS.base),
      frequency: 28,
      emitting: false,
    });
    this.trail.setDepth(6);

    // The ball: an invisible physics body plus a separate view (rolling base + fixed lighting).
    const spawn = def.spawn;
    this.respawn = { x: spawn.x, y: spawn.y + BALL_R };
    this.ball = this.physics.add.image(spawn.x, spawn.y, "px").setVisible(false);
    const body = this.ball.body as Phaser.Physics.Arcade.Body;
    body.setSize(BODY_W, BODY_H);
    body.setCollideWorldBounds(true);
    body.setMaxVelocity(2000, PHYS.maxFall);
    this.ballShadow = this.add.image(spawn.x, spawn.y + BALL_R, "ball-shadow").setScale(1 / TEX).setDepth(5);
    this.ballBase = this.add.image(0, 0, "ball-base").setScale(1 / TEX);
    const shade = this.add.image(0, 0, "ball-shade").setScale(1 / TEX);
    this.ballView = this.add.container(spawn.x, spawn.y, [this.ballBase, shade]).setDepth(7);
    this.trail.startFollow(this.ballView);

    this.physics.add.collider(this.ball, statics);
    this.physics.add.collider(this.ball, moverGroup);

    this.camX = spawn.x + 180;
    cam.centerOn(this.camX, WORLD_H / 2);
    this.ctx.view.active = true;
    this.ctx.view.scrollX = cam.scrollX;

    this.ctx.run.sparks = 0;
    this.ctx.run.sparksTotal = def.sparks.length;
    this.ctx.run.levelTime = 0;
    this.ctx.run.levelDeaths = 0;
    this.ctx.run.furthest = 0;
    this.ctx.view.progress = 0;
    this.ctx.events.emit("level-ready", { levelIndex: this.levelIndex, practice: this.practice });
  }

  /** Called by the host after the intro countdown. */
  begin() {
    if (this.running) return;
    this.running = true;
    this.physics.world.resume();
    this.ctx.input.clear();
  }

  private fitCamera() {
    const cam = this.cameras.main;
    const { width, height } = this.scale;
    cam.setViewport(0, 0, width, height);
    cam.setZoom(height / WORLD_H);
  }

  // -------------------------------------------------------------------------
  // Hazard factories
  // -------------------------------------------------------------------------

  private makeSaw(s: SawDef): Hazard {
    const r = s.r ?? 24;
    const img = this.add.image(s.x, s.y, sawTexture(this, this.theme, r)).setScale(1 / TEX).setDepth(4);
    const path = this.add.graphics().setDepth(0.4);
    path.lineStyle(2, hex(this.theme.hazardDark), 0.35);
    if (s.orbit) path.strokeCircle(s.x, s.y, s.orbit);
    else if (s.dx || s.dy) path.lineBetween(s.x, s.y, s.x + (s.dx ?? 0), s.y + (s.dy ?? 0));
    path.fillStyle(hex(this.theme.hazardDark), 0.5);
    path.fillCircle(s.x, s.y, 3);
    let x = s.x;
    let y = s.y;
    const spin = s.dx ? 9 : 6;
    return {
      update: (t, dt) => {
        const u = t / s.period + (s.phase ?? 0);
        if (s.orbit) {
          const a = u * Math.PI * 2;
          x = s.x + Math.cos(a) * s.orbit;
          y = s.y + Math.sin(a) * s.orbit;
        } else {
          const k = smooth(u % 1);
          x = s.x + (s.dx ?? 0) * k;
          y = s.y + (s.dy ?? 0) * k;
        }
        img.setPosition(x, y);
        img.rotation += spin * dt;
      },
      hits: (bx, by, br) => Math.hypot(bx - x, by - y) < r * 0.82 + br,
    };
  }

  private makeCrusher(c: CrusherDef): Hazard {
    const key = crusherTexture(this, this.theme, c.w, c.h);
    const img = this.add.image(c.x, c.up, key).setOrigin(0.5, 1).setScale(1 / TEX).setDepth(4);
    this.add
      .image(c.x, 0, crusherRailTexture(this, this.theme))
      .setOrigin(0.5, 0)
      .setDisplaySize(6, c.up - c.h + 20)
      .setDepth(0.4);
    let bottom = c.up;
    let wasDown = false;
    return {
      update: (t) => {
        const u = (t / c.period + (c.phase ?? 0)) % 1;
        let k: number;
        if (u < 0.42) k = 0;
        else if (u < 0.5) k = Phaser.Math.Easing.Quadratic.In((u - 0.42) / 0.08);
        else if (u < 0.7) k = 1;
        else k = 1 - Phaser.Math.Easing.Sine.InOut((u - 0.7) / 0.3);
        bottom = c.up + (c.down - c.up) * k;
        img.y = bottom;
        const down = k >= 0.999;
        if (down && !wasDown) this.crusherSlam(c.x, c.down);
        wasDown = down;
      },
      hits: (bx, by, br) => circleRect(bx, by, br, c.x - c.w / 2 + 3, bottom - c.h, c.w - 6, c.h - 2),
    };
  }

  private crusherSlam(x: number, y: number) {
    const near = Math.abs(this.ball.x - x) < 700;
    if (!near) return;
    this.dust.explode(10, x, y - 2);
    const cam = this.cameras.main;
    if (Math.abs(this.ball.x - x) < 360) cam.shake(120, 0.0035);
    audio.play("land", { gain: 0.5 });
  }

  private makeBar(b: BarDef): Hazard {
    const rod = this.add.graphics().setDepth(0.4);
    rod.lineStyle(3, hex(this.theme.platform.shade), 0.9);
    rod.lineBetween(b.x, 0, b.x, b.y);
    const img = this.add
      .image(b.x, b.y, barTexture(this, this.theme, b.length))
      .setOrigin(8 / (b.length + 16), 0.5)
      .setScale(1 / TEX)
      .setDepth(4);
    const hub = this.add.circle(b.x, b.y, 9, hex(this.theme.platform.shade)).setDepth(4.1);
    hub.setStrokeStyle(2, hex(this.theme.hazard));
    let angle = b.phase ?? 0;
    return {
      update: (t) => {
        angle = (b.phase ?? 0) + t * b.speed;
        img.rotation = angle;
      },
      hits: (bx, by, br) => {
        const tx = b.x + Math.cos(angle) * b.length;
        const ty = b.y + Math.sin(angle) * b.length;
        return segmentDist(bx, by, b.x, b.y, tx, ty) < 7 + br || Math.hypot(bx - b.x, by - b.y) < 10 + br;
      },
    };
  }

  // -------------------------------------------------------------------------
  // Main loop
  // -------------------------------------------------------------------------

  override update(_time: number, deltaMs: number) {
    // Game over and victory unload the level from inside this scene's own step (a
    // delayed call fires, the session stops the scene), and Phaser still calls
    // update() once afterwards. The ball's body is gone by then; touching it would
    // throw, and a throw here kills Phaser's animation loop for good, so the next
    // level would load into a world that never draws again (a blank screen).
    if (!this.sys.isActive() || !this.ball?.body) return;
    const dt = Math.min(deltaMs, 50) / 1000;
    if (this.running) {
      this.t += dt;
      if (!this.practice && !this.finished && !this.dead) {
        this.ctx.run.levelTime += dt;
        this.ctx.run.runTime += dt;
      }
    }
    this.updateMovers(dt);
    for (const h of this.hazards) h.update(this.t, this.running ? dt : 0);

    if (this.running && !this.dead && !this.finished) {
      this.controlBall(dt);
      this.interact(dt);
    }
    this.syncBall(dt);
    this.updateCamera(dt);
  }

  private updateMovers(dt: number) {
    const step = Math.max(dt, 1 / 120);
    for (const m of this.movers) {
      const u = ((this.t + (this.running ? step : 0)) / m.def.period + (m.def.phase ?? 0)) % 1;
      const k = smooth(u);
      const tx = m.x0 + (m.def.dx ?? 0) * k;
      const ty = m.y0 + (m.def.dy ?? 0) * k;
      const b = m.body.body as Phaser.Physics.Arcade.Body;
      if (!this.running) {
        b.reset(tx, ty);
        b.setVelocity(0, 0);
      } else {
        b.setVelocity((tx - b.center.x) / step, (ty - b.center.y) / step);
      }
      m.view.setPosition(b.center.x - m.def.w / 2, b.center.y - m.h / 2);
    }
  }

  private controlBall(dt: number) {
    const body = this.ball.body as Phaser.Physics.Arcade.Body;
    const input = this.ctx.input;
    const onGround = body.blocked.down || body.touching.down;
    if (onGround) {
      if (!this.grounded) this.onLand(this.prevVy);
      this.lastGroundedAt = this.t;
    }
    this.grounded = onGround;

    const steer = clamp(input.steer, -1, 1);
    const boosting = this.t < this.boostUntil;
    const target = steer * this.def.maxSpeed;
    let vx = body.velocity.x;
    let rate: number;
    if (Math.abs(steer) < 0.02) rate = onGround ? PHYS.coastGround : PHYS.coastAir;
    else if (vx !== 0 && Math.sign(target) !== Math.sign(vx)) rate = onGround ? PHYS.brakeGround : PHYS.accelAir;
    else rate = onGround ? PHYS.accelGround : PHYS.accelAir;
    if (boosting) {
      const boostV = PHYS.boostSpeed * this.boostDir;
      vx += (boostV - vx) * (1 - Math.exp(-6 * dt));
    } else {
      // Above top speed (after a boost) the ball eases back down instead of braking hard,
      // returning to normal within ~0.6 s so the next jump behaves predictably.
      if (Math.abs(vx) > this.def.maxSpeed && Math.sign(vx) === Math.sign(target)) rate = 3;
      vx += (target - vx) * (1 - Math.exp(-rate * dt));
    }

    // A ball whose centre has passed the edge rolls off, like a real ball would.
    if (onGround && body.blocked.down) {
      const edge = this.edgeOverhang();
      if (edge !== 0) vx += edge * 900 * dt;
    }
    if (Math.abs(vx) < 1) vx = 0;
    body.setVelocityX(vx);

    const canJump = onGround || this.t - this.lastGroundedAt <= PHYS.coyote;
    if (canJump && input.takeJump(PHYS.jumpBuffer)) this.jump(PHYS.jumpVelocity);
    this.prevVy = body.velocity.y;
  }

  /** -1/1 when the ball's centre is past the edge of whatever it stands on, else 0. */
  private edgeOverhang(): number {
    const body = this.ball.body as Phaser.Physics.Arcade.Body;
    const cx = body.center.x;
    const bottom = body.bottom;
    let supported = false;
    let nearestEdge = 0;
    let nearestDist = Infinity;
    for (const s of this.surfaces) {
      if (Math.abs(s.y - bottom) > 2.5) continue;
      if (body.right < s.x || body.left > s.x + s.w) continue;
      // A few units of grace so near-perfect landings stick.
      if (cx >= s.x - 6 && cx <= s.x + s.w + 6) {
        supported = true;
        break;
      }
      const dl = Math.abs(cx - s.x);
      const dr = Math.abs(cx - (s.x + s.w));
      if (dl < nearestDist) {
        nearestDist = dl;
        nearestEdge = -1;
      }
      if (dr < nearestDist) {
        nearestDist = dr;
        nearestEdge = 1;
      }
    }
    return supported ? 0 : nearestEdge;
  }

  private jump(velocity: number) {
    const body = this.ball.body as Phaser.Physics.Arcade.Body;
    body.setVelocityY(-velocity);
    this.grounded = false;
    this.lastGroundedAt = -10;
    this.dust.explode(6, this.ball.x, body.bottom - 2);
    this.squashTo(0.8, 1.22, 70);
    audio.play("jump");
    this.ctx.events.emit("jump");
  }

  private onLand(vy: number) {
    if (vy < 260) return;
    const k = clamp(vy / 3600, 0.06, 0.3);
    this.squashTo(1 + k, 1 - k, 60);
    const body = this.ball.body as Phaser.Physics.Arcade.Body;
    this.dust.explode(Math.round(4 + k * 20), this.ball.x, body.bottom - 1);
    audio.play("land", { gain: clamp(vy / 1100, 0.25, 1) });
    this.ctx.events.emit("land");
  }

  private squashTo(sx: number, sy: number, ms: number) {
    this.squash?.stop();
    this.ballView.setScale(sx, sy);
    this.squash = this.tweens.add({ targets: this.ballView, scaleX: 1, scaleY: 1, duration: ms * 4, ease: "Back.easeOut" });
  }

  private interact(dt: number) {
    const body = this.ball.body as Phaser.Physics.Arcade.Body;
    const x = body.center.x;
    const y = body.center.y;

    for (const s of this.sparks) {
      if (s.taken || Math.abs(s.x - x) > 60) continue;
      if (Math.hypot(s.x - x, s.y - y) < PICK_R) this.collect(s);
    }

    for (const c of this.checkpoints) {
      if (!c.active && x >= c.x - 6 && Math.abs(y - (c.y - BALL_R)) < 140) this.activateCheckpoint(c);
    }

    for (const p of this.pads) {
      p.cooldown -= dt;
      if (p.cooldown > 0 || Math.abs(p.x - x) > 30) continue;
      if (body.bottom >= p.y - 16 && body.bottom <= p.y + 4 && body.velocity.y >= -40) {
        p.cooldown = 0.3;
        this.jump(PHYS.padVelocity);
        audio.play("bounce");
        p.img.setScale(1 / TEX, 0.45 / TEX);
        this.tweens.add({ targets: p.img, scaleY: 1 / TEX, duration: 380, ease: "Elastic.easeOut" });
      }
    }

    for (const b of this.boosts) {
      b.cooldown -= dt;
      if (b.cooldown > 0 || Math.abs(b.x - x) > 44) continue;
      if (Math.abs(body.bottom - b.y) < 8) {
        b.cooldown = 0.6;
        this.boostUntil = this.t + PHYS.boostTime;
        this.boostDir = 1;
        audio.play("boost");
        this.burst.explode(8, b.x, b.y - 8);
      }
    }

    if (this.t >= this.invulnUntil) {
      for (const h of this.hazards) {
        if (h.hits(x, y, HIT_R)) {
          this.die("hazard");
          return;
        }
      }
    }
    if (y > KILL_Y) {
      this.die("fall");
      return;
    }

    if (this.def.finish && x >= this.def.finish.x) this.complete();
  }

  private collect(s: Spark) {
    s.taken = true;
    const run = this.ctx.run;
    run.sparks++;
    if (!this.practice) run.score += 100;
    this.combo = this.t < this.comboUntil ? Math.min(this.combo + 1, 8) : 0;
    this.comboUntil = this.t + 1.3;
    audio.play("collect", { pitch: 1 + this.combo * 0.09 });
    this.burst.explode(12, s.x, s.y);
    this.ring(s.x, s.y, hex(this.theme.spark), 0.9);
    this.tweens.killTweensOf([s.img, s.glow]);
    this.tweens.add({ targets: s.img, scale: (1 / TEX) * 1.9, alpha: 0, angle: 90, duration: 260, ease: "Quad.easeOut" });
    this.tweens.add({ targets: s.glow, scale: 1.4, alpha: 0, duration: 320 });
    if (!this.practice) {
      const label = this.add.image(s.x, s.y - 18, `plus-${this.theme.id}`).setScale(1 / TEX).setDepth(9);
      this.tweens.add({ targets: label, y: s.y - 58, alpha: 0, duration: 800, ease: "Cubic.easeOut", onComplete: () => label.destroy() });
    }
    this.ctx.events.emit("collect", { sparks: run.sparks, total: run.sparksTotal });
  }

  private activateCheckpoint(c: Checkpoint) {
    c.active = true;
    this.respawn = { x: c.x + 30, y: c.y };
    c.img.setTexture(`flag-${this.theme.id}-active`);
    c.img.setScale((1 / TEX) * 1.25);
    this.tweens.add({ targets: c.img, scale: 1 / TEX, duration: 420, ease: "Back.easeOut" });
    this.ring(c.x + 6, c.y - 70, hex(this.theme.flag.active), 1.4);
    this.burst.explode(10, c.x + 14, c.y - 70);
    audio.play("checkpoint");
    this.ctx.events.emit("checkpoint");
  }

  private ring(x: number, y: number, tint: number, size: number) {
    const ring = this.add.image(x, y, "ring").setTint(tint).setScale(0.15).setAlpha(0.9).setDepth(8);
    this.tweens.add({ targets: ring, scale: 0.5 * size, alpha: 0, duration: 420, ease: "Cubic.easeOut", onComplete: () => ring.destroy() });
  }

  private die(reason: "hazard" | "fall") {
    if (this.dead || this.finished) return;
    this.dead = true;
    const body = this.ball.body as Phaser.Physics.Arcade.Body;
    const x = body.center.x;
    const y = Math.min(body.center.y, WORLD_H - 30);
    body.setVelocity(0, 0);
    body.enable = false;
    this.ballView.setVisible(false);
    this.ballShadow.setVisible(false);
    this.trail.emitting = false;
    this.shatter.explode(18, x, y);
    this.cameras.main.shake(180, 0.006);
    audio.play("hurt");
    const run = this.ctx.run;
    run.deaths++;
    run.levelDeaths++;
    if (!this.practice) run.lives = Math.max(0, run.lives - 1);
    this.ctx.events.emit("died", { lives: run.lives, reason });
    if (!this.practice && run.lives <= 0) {
      this.time.delayedCall(950, () => {
        this.running = false;
        this.ctx.events.emit("game-over");
      });
      return;
    }
    this.time.delayedCall(720, () => this.respawnBall());
  }

  private respawnBall() {
    const body = this.ball.body as Phaser.Physics.Arcade.Body;
    body.enable = true;
    body.reset(this.respawn.x, this.respawn.y - BALL_R - 1);
    body.setVelocity(0, 0);
    this.boostUntil = 0;
    this.dead = false;
    this.invulnUntil = this.t + 1.3;
    this.lastGroundedAt = -10;
    this.ballView.setVisible(true).setScale(0.2);
    this.ballShadow.setVisible(true);
    this.tweens.add({ targets: this.ballView, scale: 1, duration: 360, ease: "Back.easeOut" });
    this.ring(this.respawn.x, this.respawn.y - BALL_R, hex(BALL_COLORS.base), 1.2);
    this.ctx.input.clear();
  }

  private complete() {
    if (this.finished) return;
    this.finished = true;
    const body = this.ball.body as Phaser.Physics.Arcade.Body;
    const f = this.def.finish!;
    body.setVelocityX(Math.max(140, Math.min(body.velocity.x, 260)));
    this.ctx.events.emit("finished");
    audio.play("levelComplete");
    this.confetti.explode(46, f.x, f.y - 160);
    this.burst.explode(24, f.x, f.y - 60);
    this.ring(f.x, f.y - 60, hex(this.theme.spark), 2.4);
    this.tweens.add({
      targets: this.ballView,
      scale: 0,
      alpha: 0,
      delay: 260,
      duration: 420,
      ease: "Back.easeIn",
      onComplete: () => {
        body.setVelocity(0, 0);
        body.enable = false;
        this.ballShadow.setVisible(false);
      },
    });

    const run = this.ctx.run;
    const def = this.def;
    const time = run.levelTime;
    const allSparks = run.sparks === run.sparksTotal;
    const noDeaths = run.levelDeaths === 0;
    const result: LevelResult = {
      levelIndex: this.levelIndex,
      time,
      sparks: run.sparks,
      sparksTotal: run.sparksTotal,
      deaths: run.levelDeaths,
      sparkScore: run.sparks * 100,
      completionBonus: 1000,
      timeBonus: Math.max(0, Math.round((def.parTime - time) * 20)),
      perfectBonus: (allSparks ? 300 : 0) + (noDeaths ? 200 : 0),
      total: 0,
    };
    run.score += result.completionBonus + result.timeBonus + result.perfectBonus;
    result.total = run.score;
    this.time.delayedCall(1150, () => this.ctx.events.emit("level-complete", result));
  }

  // -------------------------------------------------------------------------
  // Presentation
  // -------------------------------------------------------------------------

  private syncBall(dt: number) {
    const body = this.ball.body as Phaser.Physics.Arcade.Body;
    if (!body.enable && !this.finished) return;
    const x = body.center.x;
    const y = body.center.y;
    this.ballView.setPosition(x, y);
    this.roll += (body.velocity.x * dt) / BALL_R;
    this.ballBase.rotation = this.roll;

    if (this.t < this.invulnUntil && !this.dead) {
      this.ballView.setAlpha(Math.sin(this.t * 28) > 0 ? 1 : 0.35);
    } else if (!this.finished) {
      this.ballView.setAlpha(1);
    }

    // Soft contact shadow on whatever is directly below.
    let ground = Infinity;
    for (const s of this.surfaces) {
      if (x >= s.x && x <= s.x + s.w && s.y >= body.bottom - 3 && s.y < ground) ground = s.y;
    }
    for (const m of this.movers) {
      const b = m.body.body as Phaser.Physics.Arcade.Body;
      if (x >= b.left && x <= b.right && b.top >= body.bottom - 3 && b.top < ground) ground = b.top;
    }
    if (Number.isFinite(ground) && !this.dead) {
      const gap = ground - body.bottom;
      const k = clamp(1 - gap / 300, 0.2, 1);
      this.ballShadow.setVisible(true).setPosition(x, ground).setScale((1 / TEX) * (0.55 + 0.45 * k), (1 / TEX) * k);
      this.ballShadow.setAlpha(this.finished ? 0 : 0.8 * k);
    } else {
      this.ballShadow.setVisible(false);
    }

    const fast = Math.abs(body.velocity.x) > this.def.maxSpeed * 0.92 || this.t < this.boostUntil;
    this.trail.emitting = fast && !this.dead && !this.finished && this.running;
    this.trackProgress(x);
  }

  /** Where the ball is between the spawn point and the finish line (0..1), for the HUD's level track. */
  private trackProgress(x: number) {
    const finish = this.def.finish;
    if (!finish) return;
    const progress = this.finished ? 1 : clamp((x - this.def.spawn.x) / (finish.x - this.def.spawn.x), 0, 1);
    this.ctx.view.progress = progress;
    if (progress > this.ctx.run.furthest) this.ctx.run.furthest = progress;
  }

  private updateCamera(dt: number) {
    const cam = this.cameras.main;
    const body = this.ball.body as Phaser.Physics.Arcade.Body;
    const lookTarget = this.dead ? 0 : clamp(body.velocity.x * 0.42, -150, 230);
    this.lookAhead += (lookTarget - this.lookAhead) * (1 - Math.exp(-2.4 * dt));
    const desired = (this.dead ? this.respawn.x : body.center.x) + this.lookAhead + 120;
    this.camX += (desired - this.camX) * (1 - Math.exp(-(this.dead ? 3.5 : 7) * dt));
    cam.centerOn(this.camX, WORLD_H / 2);
    this.ctx.view.scrollX = cam.worldView.x;
  }
}
