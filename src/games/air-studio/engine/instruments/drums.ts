import { settings, type DrumLayout } from "../settings";
import type { TrackFrame } from "../tracking/hands";
import { PadController, type Pad } from "./common";

const STANDARD: Pad[] = [
  { id: "crash", x: 0, y: 0, w: 0.25, h: 0.3 },
  { id: "tomh", x: 0.25, y: 0, w: 0.25, h: 0.3 },
  { id: "tomm", x: 0.5, y: 0, w: 0.25, h: 0.3 },
  { id: "ride", x: 0.75, y: 0, w: 0.25, h: 0.3 },
  { id: "hho", x: 0, y: 0.3, w: 0.2, h: 0.36 },
  { id: "hhc", x: 0.2, y: 0.3, w: 0.22, h: 0.36 },
  { id: "snare", x: 0.42, y: 0.3, w: 0.3, h: 0.36 },
  { id: "toml", x: 0.72, y: 0.3, w: 0.28, h: 0.36 },
  { id: "kick", x: 0, y: 0.66, w: 1, h: 0.34 },
];

const COMPACT: Pad[] = [
  { id: "hhc", x: 0, y: 0, w: 0.5, h: 0.36 },
  { id: "crash", x: 0.5, y: 0, w: 0.5, h: 0.36 },
  { id: "snare", x: 0, y: 0.36, w: 0.5, h: 0.32 },
  { id: "toml", x: 0.5, y: 0.36, w: 0.5, h: 0.32 },
  { id: "kick", x: 0, y: 0.68, w: 1, h: 0.32 },
];

/** Mirrored left to right, for left-handed players. */
export const mirror = (pads: Pad[]): Pad[] => pads.map((p) => ({ ...p, x: 1 - p.x - p.w }));

/** Kit layouts from the original app: standard (9 pieces) and beginner (5 large pads), each mirrored when left-handed. */
export const DRUM_LAYOUTS: Record<DrumLayout, { label: string; pads: Pad[] }> = {
  standard: { label: "Full kit", pads: STANDARD },
  compact: { label: "Five big pads", pads: COMPACT },
};

export function drumPads(layout: DrumLayout, leftHanded: boolean): Pad[] {
  const pads = (DRUM_LAYOUTS[layout] ?? DRUM_LAYOUTS.standard).pads;
  return leftHanded ? mirror(pads) : pads;
}

export class DrumController extends PadController {
  readonly inst = "drums" as const;
  private layoutKey = "";

  constructor() {
    super(settings.get().drums.pack);
    this.syncLayout();
  }

  private syncLayout() {
    const s = settings.get();
    const key = `${s.drums.layout}|${s.tracking.leftHanded}`;
    if (key !== this.layoutKey) {
      this.layoutKey = key;
      this.pads = drumPads(s.drums.layout, s.tracking.leftHanded);
    }
    if (s.drums.pack !== this.kit.pack) void this.kit.setPack(s.drums.pack);
  }

  sensOffset() {
    return settings.get().drums.sensOffset;
  }

  velSens() {
    return settings.get().drums.velocitySens;
  }

  preset() {
    return settings.get().drums.pack;
  }

  update(f: TrackFrame, now: number) {
    this.syncLayout();
    super.update(f, now);
  }
}
