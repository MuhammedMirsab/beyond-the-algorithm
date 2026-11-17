import * as Phaser from "phaser";
import { makeCommonTextures } from "../textures";

/** Draws the shared textures, then hands over to the backdrop. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super("boot");
  }

  create() {
    makeCommonTextures(this);
    this.scene.launch("backdrop");
    this.game.events.emit("fc-booted");
  }
}
