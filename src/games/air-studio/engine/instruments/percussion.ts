import { settings, type PercLayout } from "../settings";
import { Debounce, ShakeDetector } from "../tracking/gestures";
import type { TrackFrame } from "../tracking/hands";
import { fromReach, strikeThreshold } from "../tracking/reach";
import { PadController, uiScale, type Pad } from "./common";
import { C, pill } from "./palette";

const grid = (ids: string[], cols: number): Pad[] => {
  const rows = Math.ceil(ids.length / cols);
  return ids.map((id, i) => ({ id, x: (i % cols) / cols, y: Math.floor(i / cols) / rows, w: 1 / cols, h: 1 / rows }));
};

export const PERC_LAYOUTS: Record<PercLayout, { label: string; pads: Pad[] }> = {
  full: { label: "Everything", pads: grid(["bongoHi", "bongoLo", "congaSlap", "congaOpen", "tambourine", "clap", "cowbell", "congaLow", "shaker", "eClap", "eRim", "eZap"], 4) },
  latin: { label: "Latin", pads: grid(["bongoHi", "bongoLo", "cowbell", "congaSlap", "congaOpen", "congaLow"], 3) },
  hand: { label: "Hand", pads: grid(["tambourine", "clap", "shaker", "cowbell"], 2) },
  electronic: { label: "Electronic", pads: grid(["eClap", "eRim", "eClave", "eConga", "eZap", "clap"], 3) },
};

/** Pads, plus a shaker you play by shaking a closed fist (copied from the original app). */
export class PercussionController extends PadController {
  readonly inst = "percussion" as const;
  private shake = { Left: new ShakeDetector(), Right: new ShakeDetector() };
  private fist = { Left: new Debounce(), Right: new Debounce() };
  private shaking = { Left: 0, Right: 0 };

  constructor() {
    super("acoustic");
    this.pads = (PERC_LAYOUTS[settings.get().percussion.layout] ?? PERC_LAYOUTS.full).pads;
  }

  sensOffset() {
    return settings.get().percussion.sensOffset;
  }

  velSens() {
    return 70;
  }

  preset() {
    return settings.get().percussion.layout;
  }

  update(f: TrackFrame, now: number) {
    const s = settings.get().percussion;
    this.pads = (PERC_LAYOUTS[s.layout] ?? PERC_LAYOUTS.full).pads;
    if (s.shake) {
      const thr = strikeThreshold(s.sensOffset) * 0.9;
      for (const hand of f.hands) {
        const closed = this.fist[hand.label].update(hand.fist, now);
        if (!closed) continue;
        const sh = this.shake[hand.label].update(hand, now, thr);
        if (sh !== null) {
          this.trigger("shaker", Math.min(1, 0.35 + sh / (thr * 4)), hand.label, now, sh);
          this.shaking[hand.label] = now;
        }
      }
      // Closed hands only shake; open hands strike pads.
      const open = { ...f, hands: f.hands.filter((h) => !this.fist[h.label].value) };
      super.update(open, now);
    } else super.update(f, now);
  }

  draw(g: CanvasRenderingContext2D, w: number, h: number, now: number) {
    super.draw(g, w, h, now);
    if (!settings.get().percussion.shake) return;
    const age = now - Math.max(this.shaking.Left, this.shaking.Right);
    if (age > 400) return;
    // The shaker has no pad: a tag at the bottom of the play area shows it sounding.
    const u = uiScale(h);
    const p = fromReach({ x: 0.5, y: 1 });
    g.globalAlpha = Math.min(1, (400 - age) / 150);
    pill(g, "Shaker", p.x * w, p.y * h - 18 * u, 13 * u, C.game, C.gameInk);
    g.globalAlpha = 1;
  }
}
