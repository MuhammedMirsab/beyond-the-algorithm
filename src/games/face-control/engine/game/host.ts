import * as Phaser from "phaser";
import { PHYS } from "./config";
import { CONTEXT_KEY, type GameContext } from "./context";
import type { LevelDef } from "./levels/types";
import { BackdropScene } from "./scenes/BackdropScene";
import { BootScene } from "./scenes/BootScene";
import { PlayScene, type PlayData } from "./scenes/PlayScene";
import type { ThemeId } from "./themes";

/**
 * Owns the Phaser.Game instance. Renders at the device pixel ratio (capped
 * at 2) so the world stays crisp on retina laptops and projectors, while
 * the canvas keeps its CSS size.
 */
export class GameHost {
  readonly game: Phaser.Game;
  readonly ready: Promise<void>;
  private readonly observer: ResizeObserver;
  private dpr = Math.min(window.devicePixelRatio || 1, 2);
  private destroyed = false;

  constructor(
    private readonly parent: HTMLElement,
    private readonly ctx: GameContext,
  ) {
    const { w, h } = this.size();
    this.game = new Phaser.Game({
      type: Phaser.AUTO,
      parent,
      width: w,
      height: h,
      backgroundColor: "#F5ECDF",
      scale: { mode: Phaser.Scale.NONE, zoom: 1 / this.dpr },
      physics: {
        default: "arcade",
        arcade: { gravity: { x: 0, y: PHYS.gravity }, debug: false, fps: 60 },
      },
      render: { antialias: true, powerPreference: "high-performance", roundPixels: false },
      input: { keyboard: false, mouse: false, touch: false, gamepad: false },
      audio: { noAudio: true },
      banner: false,
      fps: { target: 60, smoothStep: true },
      scene: [BootScene, BackdropScene, PlayScene],
    });
    this.game.registry.set(CONTEXT_KEY, ctx);
    this.ready = new Promise((resolve) => this.game.events.once("fc-booted", () => resolve()));

    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(parent);
  }

  private size() {
    const rect = this.parent.getBoundingClientRect();
    const cw = Math.max(320, Math.round(rect.width));
    const ch = Math.max(240, Math.round(rect.height));
    return { w: Math.round(cw * this.dpr), h: Math.round(ch * this.dpr) };
  }

  private resize() {
    if (this.destroyed) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (dpr !== this.dpr) {
      this.dpr = dpr;
      this.game.scale.setZoom(1 / dpr);
    }
    const { w, h } = this.size();
    if (w !== this.game.scale.width || h !== this.game.scale.height) this.game.scale.resize(w, h);
  }

  private get backdrop() {
    return this.game.scene.getScene("backdrop") as BackdropScene;
  }

  private get play() {
    return this.game.scene.getScene("play") as PlayScene;
  }

  setTheme(theme: ThemeId) {
    this.backdrop?.setTheme(theme);
  }

  /** Builds a level and resolves once it is on screen (frozen until begin()). */
  loadLevel(level: LevelDef, levelIndex: number): Promise<void> {
    return new Promise((resolve) => {
      const off = this.ctx.events.on("level-ready", () => {
        off();
        resolve();
      });
      this.setTheme(level.theme);
      const data: PlayData = { level, levelIndex };
      const mgr = this.game.scene;
      if (mgr.isActive("play") || mgr.isPaused("play")) mgr.stop("play");
      mgr.start("play", data);
    });
  }

  begin() {
    this.play?.begin();
  }

  pause() {
    if (this.game.scene.isActive("play")) this.game.scene.pause("play");
  }

  resume() {
    if (this.game.scene.isPaused("play")) this.game.scene.resume("play");
  }

  unloadLevel() {
    const mgr = this.game.scene;
    if (mgr.isActive("play") || mgr.isPaused("play")) mgr.stop("play");
    this.ctx.view.active = false;
  }

  /** Stops updating and rendering the whole game while it is not on screen. */
  sleep() {
    if (!this.destroyed) this.game.pause();
  }

  wake() {
    if (!this.destroyed) this.game.resume();
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.observer.disconnect();
    // Phaser frees its GL resources but keeps the context alive until garbage
    // collection; browsers cap live contexts, so lose it explicitly once
    // Phaser has finished tearing down (its destroy runs on the next step).
    const renderer = this.game.renderer;
    const gl = renderer && "gl" in renderer ? (renderer as Phaser.Renderer.WebGL.WebGLRenderer).gl : null;
    if (gl) {
      this.game.events.once(Phaser.Core.Events.DESTROY, () => {
        window.setTimeout(() => gl.getExtension("WEBGL_lose_context")?.loseContext(), 0);
      });
    }
    this.game.resume();
    this.game.destroy(true);
  }
}
