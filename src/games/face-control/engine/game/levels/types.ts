import type { MusicTheme } from "../../audio/music";
import type { ThemeId } from "../themes";

/** Solid platform. `x` = left edge, `y` = top surface. Without `h` it extends below the screen (ground). */
export interface PlatformDef {
  x: number;
  y: number;
  w: number;
  h?: number;
}

/** Platform moving smoothly back and forth by (dx, dy) over `period` seconds. */
export interface MoverDef {
  x: number;
  y: number;
  w: number;
  dx?: number;
  dy?: number;
  period: number;
  /** 0..1 offset into the cycle. */
  phase?: number;
}

/** A row of spikes standing on the surface at height `y`. */
export interface SpikeDef {
  x: number;
  y: number;
  w: number;
}

/** Spinning saw: travels by (dx, dy) back and forth, or orbits `orbit` units around (x, y). */
export interface SawDef {
  x: number;
  y: number;
  r?: number;
  dx?: number;
  dy?: number;
  orbit?: number;
  period: number;
  phase?: number;
}

/** Block that waits, slams down to `down` (its bottom edge) and rises back to `up`. */
export interface CrusherDef {
  /** Centre x. */
  x: number;
  w: number;
  h: number;
  up: number;
  down: number;
  period: number;
  phase?: number;
}

/** A single bar rotating around a pivot hanging from above. */
export interface BarDef {
  x: number;
  y: number;
  length: number;
  /** Radians per second. */
  speed: number;
  phase?: number;
}

export interface PointDef {
  x: number;
  y: number;
}

export type SignIcon = "tilt" | "mouth" | "gap" | "spike" | "spark" | "mover" | "pad" | "boost" | "saw" | "crusher" | "flag" | "finish";

export interface SignDef {
  x: number;
  y: number;
  icon: SignIcon;
  text: string;
}

export interface LevelDef {
  id: number;
  name: string;
  tagline: string;
  theme: ThemeId;
  music: MusicTheme;
  width: number;
  spawn: PointDef;
  maxSpeed: number;
  /** Finishing faster than this earns a time bonus. */
  parTime: number;
  platforms: PlatformDef[];
  movers?: MoverDef[];
  spikes?: SpikeDef[];
  saws?: SawDef[];
  crushers?: CrusherDef[];
  bars?: BarDef[];
  sparks: PointDef[];
  checkpoints?: PointDef[];
  pads?: PointDef[];
  boosts?: PointDef[];
  signs?: SignDef[];
  finish?: PointDef;
  practice?: boolean;
}
