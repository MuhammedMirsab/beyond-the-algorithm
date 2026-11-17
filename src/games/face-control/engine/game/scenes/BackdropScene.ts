import * as Phaser from "phaser";
import { CONTEXT_KEY, type GameContext } from "../context";
import { LAYER_EDGE, LAYER_H, makeBackdropTextures } from "../textures";
import { THEMES, type ThemeId } from "../themes";
import { WORLD_H } from "../config";

const PARALLAX = [0.1, 0.22, 0.4];

/**
 * Screen-space background: sky, sun/moon, stars, three parallax silhouette
 * layers and drifting motes. Runs underneath the play scene and keeps
 * gently drifting on its own while menus and calibration are shown.
 */
export class BackdropScene extends Phaser.Scene {
  private themeId: ThemeId = "dawn";
  private sky?: Phaser.GameObjects.Image;
  private orb?: Phaser.GameObjects.Image;
  private stars?: Phaser.GameObjects.TileSprite;
  private layers: Phaser.GameObjects.TileSprite[] = [];
  private motes?: Phaser.GameObjects.Particles.ParticleEmitter;
  private moteZone = new Phaser.Geom.Rectangle(0, 0, 100, 100);
  private drift = 0;
  private fade?: Phaser.GameObjects.Rectangle;

  constructor() {
    super("backdrop");
  }

  create() {
    this.build();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.layout, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, this.layout, this));
  }

  setTheme(id: ThemeId) {
    if (id === this.themeId && this.sky) return;
    this.themeId = id;
    // Cross-fade through a solid colour so theme swaps never pop.
    const { width, height } = this.scale;
    this.fade?.destroy();
    const fade = this.add.rectangle(0, 0, width, height, Phaser.Display.Color.HexStringToColor(THEMES[id].sky[0]).color);
    fade.setOrigin(0, 0).setDepth(100).setAlpha(0);
    this.fade = fade;
    this.tweens.add({
      targets: fade,
      alpha: 1,
      duration: 220,
      onComplete: () => {
        this.build();
        this.tweens.add({ targets: fade, alpha: 0, duration: 380, onComplete: () => fade.destroy() });
      },
    });
  }

  private build() {
    const t = THEMES[this.themeId];
    makeBackdropTextures(this, t);
    this.sky?.destroy();
    this.orb?.destroy();
    this.stars?.destroy();
    this.layers.forEach((l) => l.destroy());
    this.motes?.destroy();

    this.cameras.main.setBackgroundColor(t.sky[1]);
    this.sky = this.add.image(0, 0, `sky-${t.id}`).setOrigin(0, 0).setDepth(0);
    this.stars = t.stars ? this.add.tileSprite(0, 0, 10, 10, "stars").setOrigin(0, 0).setDepth(1) : undefined;
    this.orb = this.add.image(0, 0, `orb-${t.id}`).setDepth(2);
    this.layers = t.layers.map((_, i) => this.add.tileSprite(0, 0, 10, 10, `layer-${t.id}-${i}`).setOrigin(0, 1).setDepth(3 + i));
    this.motes = this.add.particles(0, 0, "dot", {
      lifespan: 7000,
      speedX: { min: -8, max: 8 },
      speedY: { min: -14, max: -4 },
      scale: { start: 0.22, end: 0 },
      alpha: { start: 0.45, end: 0 },
      frequency: 260,
      tint: t.mote,
      blendMode: Phaser.BlendModes.ADD,
      emitZone: { type: "random", source: this.moteZone, quantity: 1 } as Phaser.Types.GameObjects.Particles.EmitZoneData,
    });
    this.motes.setDepth(2.5);
    this.layout();
  }

  private layout() {
    const { width: w, height: h } = this.scale;
    if (!this.sky) return;
    this.sky.setDisplaySize(w, h);
    const t = THEMES[this.themeId];
    const orbSize = h * t.orb.r * 2 * 2.46; // texture disc is 52/128 of its width
    this.orb?.setDisplaySize(orbSize, orbSize).setPosition(w * t.orb.x, h * t.orb.y);
    if (this.stars) {
      this.stars.setSize(w, h * 0.8);
      const s = h / 720;
      this.stars.setTileScale(s, s);
    }
    const layerH = h * 0.8;
    const scale = layerH / LAYER_H;
    for (const layer of this.layers) {
      // Push the transparent bottom margin of the texture below the screen.
      layer.setPosition(0, h + Math.ceil(LAYER_EDGE * scale) + 2);
      layer.setSize(w, layerH);
      layer.setTileScale(scale, scale);
    }
    this.moteZone.setTo(0, h * 0.1, w, h * 0.9);
    if (this.motes) {
      const ms = (h / WORLD_H) * 0.9;
      this.motes.setScale(ms);
    }
  }

  override update(_time: number, delta: number) {
    const ctx = this.registry.get(CONTEXT_KEY) as GameContext | undefined;
    const h = this.scale.height;
    const zoom = h / WORLD_H;
    let scroll: number;
    if (ctx?.view.active) {
      scroll = ctx.view.scrollX * zoom;
      this.drift = scroll;
    } else {
      this.drift += (delta / 1000) * 26 * zoom;
      scroll = this.drift;
    }
    const scale = (h * 0.8) / LAYER_H;
    this.layers.forEach((layer, i) => {
      layer.tilePositionX = (scroll * PARALLAX[i]) / scale;
    });
    if (this.stars) this.stars.tilePositionX = (scroll * 0.02) / (h / 720);
    if (this.orb) {
      const t = THEMES[this.themeId];
      this.orb.x = this.scale.width * t.orb.x - (ctx?.view.active ? scroll * 0.012 : 0);
    }
  }
}
