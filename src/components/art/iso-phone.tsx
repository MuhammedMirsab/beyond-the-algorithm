import type { CSSProperties } from "react";
import { circle, depth, projector, roundedRect, slab, type P2, type Projector } from "./iso";
import { cn } from "@/lib/cn";

/**
 * An exploded smartphone in true isometric: back, logic board with its
 * sensors, display, and the touch glass. One part can be lit and lifted out
 * above the phone, so you can see where that sensor lives.
 *
 * Units are roughly millimetres: the phone is 72 x 150.
 */

export type PhonePart =
  | "back"
  | "board"
  | "chip"
  | "battery"
  | "camera"
  | "motion"
  | "gps"
  | "connection"
  | "microphone"
  | "display"
  | "light"
  | "touch";

type Layer = 0 | 1 | 2 | 3;

interface Shape {
  part: PhonePart;
  layer: Layer;
  plan: P2[];
  /** Height above the layer floor. */
  z: number;
  h: number;
  /** Plan centre, for depth sorting. */
  cx: number;
  cy: number;
  kind?: "lens" | "screen" | "glass" | "island";
}

const W = 72;
const L = 150;
const COS30 = Math.cos(Math.PI / 6);

function box(part: PhonePart, layer: Layer, x: number, y: number, w: number, d: number, r: number, z: number, h: number, kind?: Shape["kind"]): Shape {
  return { part, layer, plan: roundedRect(x, y, w, d, r), z, h, cx: x + w / 2, cy: y + d / 2, kind };
}

function disc(part: PhonePart, layer: Layer, cx: number, cy: number, r: number, z: number, h: number, kind?: Shape["kind"]): Shape {
  return { part, layer, plan: circle(cx, cy, r), z, h, cx, cy, kind };
}

const SHAPES: Shape[] = [
  // Layer 0: the back and frame.
  box("back", 0, 0, 0, W, L, 13, 0, 6),
  // Layer 1: logic board, battery and the sensors.
  box("battery", 1, 9, 62, 54, 76, 6, 0, 5),
  box("board", 1, 6, 6, 60, 50, 6, 0, 1.6),
  box("camera", 1, 9, 10, 25, 25, 7, 1.6, 4),
  disc("camera", 1, 15.8, 16.8, 4.8, 5.6, 2.4, "lens"),
  disc("camera", 1, 27.2, 28.2, 4.8, 5.6, 2.4, "lens"),
  box("chip", 1, 39, 12, 16, 16, 2.5, 1.6, 2.6),
  box("motion", 1, 41, 35, 12, 12, 2, 1.6, 3),
  box("connection", 1, 12, 41, 15, 10, 2, 1.6, 2.8),
  box("gps", 1, 26, 1.5, 34, 5, 2, 0, 2.6),
  box("microphone", 1, 26, 141, 20, 7, 3, 0, 3.4),
  // Layer 2: the display, with the light sensor beside the earpiece.
  box("display", 2, 3, 3, W - 6, L - 6, 11, 0, 2.4, "screen"),
  disc("light", 2, 50, 9.5, 3.4, 2.4, 2),
  // Layer 3: cover glass with the touch layer, and its Dynamic Island cut-out.
  box("touch", 3, 0, 0, W, L, 13, 0, 1.6, "glass"),
  box("touch", 3, 26, 6, 20, 6.5, 3.25, 1.6, 0.2, "island"),
];

/** Base height of each layer when closed. */
const CLOSED: Record<Layer, number> = { 0: 0, 1: 6, 2: 12, 3: 15 };
const GAP = 24;

export interface IsoPhoneColors {
  top: string;
  side: string;
  line: string;
  screen: string;
  glass: string;
  lens: string;
  litTop: string;
  litSide: string;
  litLine: string;
}

/** On a game tile: white parts and ink lines over the game colour. */
export const ON_TILE: IsoPhoneColors = {
  top: "oklch(1 0 0 / 0.94)",
  side: "color-mix(in oklab, var(--game-ink) 42%, transparent)",
  line: "var(--game-ink)",
  screen: "var(--game-ink)",
  glass: "oklch(1 0 0 / 0.42)",
  lens: "var(--game-ink)",
  litTop: "var(--game-ink)",
  litSide: "var(--game-ink)",
  litLine: "var(--game-ink)",
};

/** On a dark surface: grey parts, the lit part in the game colour. */
export const ON_DARK: IsoPhoneColors = {
  top: "oklch(0.36 0.012 262)",
  side: "oklch(0.25 0.012 262)",
  line: "oklch(1 0 0 / 0.2)",
  screen: "oklch(0.15 0.01 262)",
  glass: "oklch(1 0 0 / 0.06)",
  lens: "oklch(0.15 0.01 262)",
  litTop: "var(--game)",
  litSide: "var(--game-deep)",
  litLine: "var(--game-ink)",
};

function ShapePaths({ s, z, project, colors, lit, litStroke = 1.1 }: { s: Shape; z: number; project: Projector; colors: IsoPhoneColors; lit: boolean; litStroke?: number }) {
  const { side, top } = slab(s.plan, z, s.h, project);
  let topFill = lit ? colors.litTop : colors.top;
  if (!lit && s.kind === "screen") topFill = colors.screen;
  if (!lit && s.kind === "glass") topFill = colors.glass;
  if (s.kind === "lens") topFill = lit ? colors.litLine : colors.lens;
  if (s.kind === "island") topFill = colors.screen;
  const line = lit ? colors.litLine : colors.line;
  const glassy = s.kind === "glass" || s.kind === "island";
  return (
    <g>
      {glassy && !lit ? null : <path d={side} fill={lit ? colors.litSide : colors.side} stroke={line} strokeWidth={lit ? litStroke : 1.1} strokeLinejoin="round" />}
      <path d={top} fill={topFill} stroke={line} strokeWidth={lit ? litStroke : glassy ? 1.3 : 1.1} strokeLinejoin="round" />
    </g>
  );
}

/** Scale shapes around the centre of their combined plan; heights grow more gently. */
function enlarge(shapes: Shape[], f: number): Shape[] {
  if (f === 1 || shapes.length === 0) return shapes;
  const xs = shapes.flatMap((s) => s.plan.map((p) => p[0]));
  const ys = shapes.flatMap((s) => s.plan.map((p) => p[1]));
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const hf = Math.min(f, 1.6);
  return shapes.map((s) => ({
    ...s,
    plan: s.plan.map(([x, y]) => [cx + (x - cx) * f, cy + (y - cy) * f] as P2),
    cx: cx + (s.cx - cx) * f,
    cy: cy + (s.cy - cy) * f,
    z: s.z * hf,
    h: s.h * hf,
  }));
}

export interface IsoOptions {
  /** Part to light up. Drawn last, lifted by `lift`, so it is never hidden. */
  lit?: PhonePart | null;
  /** 0 = closed phone, 1 = fully exploded. */
  explode?: number;
  /** How far the lit part floats above its place, in mm. */
  lift?: number;
  /** Enlarge the lifted part around its centre so small sensors read (a detail view). */
  litScale?: number;
  scale?: number;
  /** Fix the top of the picture (in mm), so the phone stays put while different parts are lit. */
  topZ?: number;
}

/** Where everything lands on the page, shared by the drawing and by anything pointing at the lit part. */
function geometry({ lit = null, explode = 1, lift = 0, litScale = 1, scale = 1, topZ }: IsoOptions) {
  const k = scale;
  const layerFloor = (layer: Layer) => CLOSED[layer] + GAP * layer * explode;
  const litOriginal = lit ? SHAPES.filter((s) => s.part === lit) : [];
  const litShapes = enlarge(litOriginal, litScale);
  const litTopZ = litShapes.length ? Math.max(...litShapes.map((s) => layerFloor(s.layer) + s.z + s.h)) + lift : 0;
  const zTop = topZ ?? Math.max(layerFloor(3) + 2, litTopZ) + (lit ? 8 : 0);
  const project = projector(k, L * COS30 * k, (zTop + 4) * k);
  return {
    k,
    layerFloor,
    litOriginal,
    litShapes,
    litTopZ,
    project,
    width: (W + L) * COS30 * k,
    height: ((W + L) / 2 + zTop + 8) * k,
  };
}

/** The highest point a lifted part reaches, in mm: for a fixed `topZ` that suits every part. */
export function isoLitTop(options: IsoOptions): number {
  return geometry(options).litTopZ;
}

/** How far to lift a part so it floats `clearance` mm above the cover glass. */
export function isoLiftAboveGlass(part: PhonePart, explode: number, clearance: number): number {
  const shapes = SHAPES.filter((s) => s.part === part);
  if (!shapes.length) return 0;
  const glassTop = CLOSED[3] + GAP * 3 * explode + 1.8;
  const base = Math.min(...shapes.map((s) => CLOSED[s.layer] + GAP * s.layer * explode + s.z));
  return Math.max(clearance, glassTop + clearance - base);
}

/**
 * The centre of the lit part's top face, in the picture's own units, plus
 * the picture's size: for a label or a line pointing at the part.
 */
export function isoLitAnchor(options: IsoOptions): { x: number; y: number; width: number; height: number } | null {
  const g = geometry(options);
  if (!g.litShapes.length) return null;
  const lift = options.lift ?? 0;
  let x = 0;
  let y = 0;
  let n = 0;
  for (const s of g.litShapes) {
    const z = g.layerFloor(s.layer) + s.z + s.h + lift;
    for (const [px, py] of s.plan) {
      const p = g.project(px, py, z);
      x += p[0];
      y += p[1];
      n += 1;
    }
  }
  return { x: x / n, y: y / n, width: g.width, height: g.height };
}

export function IsoPhone({
  lit,
  explode = 1,
  lift = 0,
  litScale = 1,
  active = false,
  colors = ON_TILE,
  scale = 1,
  topZ,
  hoverExplode = false,
  litClassName,
  litStroke,
  className,
}: IsoOptions & {
  /** Raise the lit part a little further (selected or hovered card). */
  active?: boolean;
  colors?: IsoPhoneColors;
  /** Spread the layers a little further when a parent .group/tile is hovered. */
  hoverExplode?: boolean;
  /** A class on the lit part's group (it is re-created whenever a different part is lit, so an entrance replays). */
  litClassName?: string;
  /** Outline width of the lit part. */
  litStroke?: number;
  className?: string;
}) {
  const g = geometry({ lit, explode, lift, litScale, scale, topZ });
  const layers: Layer[] = [0, 1, 2, 3];
  const sortShapes = (list: Shape[]) => [...list].sort((a, b) => depth(a.cx, a.cy, a.z) - depth(b.cx, b.cy, b.z));

  return (
    <svg viewBox={`0 0 ${g.width.toFixed(1)} ${g.height.toFixed(1)}`} className={className} aria-hidden>
      {layers.map((layer) => (
        <g
          key={layer}
          className={hoverExplode ? "art-move group-hover/tile:[transform:translateY(var(--lift))]" : undefined}
          style={hoverExplode ? ({ "--lift": `${-layer * 6}px` } as CSSProperties) : undefined}
        >
          {sortShapes(SHAPES.filter((s) => s.layer === layer && !(lit && s.part === lit))).map((s, i) => (
            <ShapePaths key={`${s.part}-${i}`} s={s} z={g.layerFloor(layer) + s.z} project={g.project} colors={colors} lit={false} />
          ))}
        </g>
      ))}
      {g.litShapes.length ? (
        <g key={lit ?? "none"} className={cn("art-move", active && "-translate-y-[10px]", litClassName)}>
          {/* Where the part sits in the phone: a dashed shadow on its floor. */}
          {sortShapes(g.litOriginal).map((s, i) =>
            s.kind === "lens" ? null : (
              <path
                key={`ghost-${i}`}
                d={slab(s.plan, g.layerFloor(s.layer) + s.z, 0.01, g.project).top}
                fill="none"
                stroke={colors.litTop}
                strokeOpacity={0.7}
                strokeWidth={1.2}
                strokeDasharray="2 2.5"
              />
            ),
          )}
          {sortShapes(g.litShapes).map((s, i) => (
            <ShapePaths key={`lit-${i}`} s={s} z={g.layerFloor(s.layer) + s.z + lift} project={g.project} colors={colors} lit litStroke={litStroke} />
          ))}
        </g>
      ) : null}
    </svg>
  );
}
