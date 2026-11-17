import type { ShapePoint, TemporalMotion } from "../engine/features";
import type { MoveIcon } from "../engine/presets";
import type { ClassTraits } from "../engine/traits";
import type { Keypoint } from "../engine/types";

/** The visitor's two moves are always "a" and "b". */
export type MoveId = "a" | "b";
export const MOVE_IDS: readonly MoveId[] = ["a", "b"];

export interface Move {
  id: MoveId;
  name: string;
  hint: string;
  icon: MoveIcon;
  traits: ClassTraits;
}

/** One example the visitor showed. Lives in memory only, until Next player. */
export interface Example {
  id: string;
  /** The 44 numbers. */
  features: number[];
  motion: TemporalMotion;
  /** Recorded as 1.5 seconds of movement. */
  moving: boolean;
  /** Small mirrored photo (a data URL), never stored or uploaded. */
  thumbnail: string | null;
  /** Width over height of the photo. */
  ratio: number;
  /** The 17 points in the photo. */
  keypoints: Keypoint[];
  /** The 13 measured points (averaged over the recording for a moving example). */
  shape: ShapePoint[] | null;
}

export type Examples = Record<MoveId, Example[]>;

export const NO_EXAMPLES: Examples = { a: [], b: [] };

/** Examples each move needs before training: one rule (the original asked for 2, 3, 4 or 5). */
export const EXAMPLES_NEEDED = 5;
/** Plenty: more only slows the visitor down. */
export const MAX_EXAMPLES = 10;

/** A small mirrored copy of the current frame, as the visitor saw it. */
export function snapshot(video: HTMLVideoElement | null, width = 160): { url: string; ratio: number } | null {
  if (!video || !video.videoWidth || !video.videoHeight) return null;
  const ratio = video.videoWidth / video.videoHeight;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = Math.round(width / ratio);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  try {
    return { url: canvas.toDataURL("image/jpeg", 0.72), ratio };
  } catch {
    return null;
  }
}
