/**
 * Everything Finger frame says, as plain functions of real state. No React
 * here, so the wording logic is unit-tested (copy.test.ts). Rules from
 * DESIGN.md §9: sentence case, short, second person, no dashes, no made-up
 * numbers.
 *
 * Visitors call the lenses "filters": it is the word everyone already knows
 * from phone cameras. The code keeps "lens".
 */
import type { KeyHint } from "@/components/ui/key-hints";
import { FACE_POINTS, FACE_POINTS_USED } from "../engine/face-points";
import { FRAME_POINTS, LM, POINTS_PER_HAND, type FrameHint } from "../engine/gesture";
import { LENSES, LENS_COUNT } from "../engine/lenses";
import type { Delegate, LoadProgress } from "../engine/tracker";

export const GAME_NAME = "Finger frame";

export const formatCount = (n: number) => Math.max(0, Math.round(n)).toLocaleString("en");

export const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** "45 s", "1 min", "2 min 5 s". */
export function formatDuration(seconds: number) {
  const s = Math.max(0, Math.round(seconds));
  const min = Math.floor(s / 60);
  const rest = s % 60;
  if (min === 0) return `${rest} s`;
  return rest ? `${min} min ${rest} s` : `${min} min`;
}

/** A lens's visitor-facing name, or null for "none". */
export const lensName = (index: number) => (index >= 0 && index < LENS_COUNT ? LENSES[index].name : null);

// ───────────────────────────── intro

export const INTRO_STEPS = [
  { title: "Hold up both hands", text: "Palms facing the camera, about an arm's length away." },
  {
    title: "Make an L with each hand",
    text: `Thumb out, index finger up. Your ${FRAME_POINTS} fingertips become the corners of a frame.`,
  },
  { title: "Pinch to change the filter", text: "Right hand for the next one, left hand to go back." },
];

/** Keyboard controls on the booth laptop (shown with KeyHints; digits and M work too, unlisted). */
export const KEY_HINTS: KeyHint[] = [
  { keys: ["←", "→"], label: "Change filter" },
  { keys: ["H"], label: "AI view" },
  { keys: ["F"], label: "Full screen" },
];

// ───────────────────────────── live

export interface CoachState {
  locked: boolean;
  everLocked: boolean;
  leftHand: boolean;
  rightHand: boolean;
  /** Why two raised hands make no frame yet; pass it only once it has been steady for a moment. */
  hint: FrameHint | null;
  pinches: number;
  mirror: boolean;
}

export type CoachKind = "hands" | "shape" | "pinch";

/**
 * The one instruction on screen during play, in the order a visitor gets
 * there. Null once there's nothing left to learn: the frame is up and the
 * visitor has pinched, so the camera picture has the screen to itself.
 */
export function coach(s: CoachState): { text: string; kind: CoachKind } | null {
  if (s.locked) {
    if (s.pinches > 0) return null;
    const text = s.mirror ? "Pinch your right hand for the next filter" : "Pinch the hand on the right for the next filter";
    return { text, kind: "pinch" };
  }
  const hands = Number(s.leftHand) + Number(s.rightHand);
  if (hands === 0) return { text: s.everLocked ? "Hands up for a new frame" : "Raise both hands", kind: "hands" };
  if (hands === 1) return { text: "Now your other hand", kind: "hands" };
  if (s.hint === "open") return { text: "Open each hand into a wide L", kind: "shape" };
  if (s.hint === "shape") return { text: "Point your thumbs toward each other", kind: "shape" };
  if (s.hint === "apart") return { text: "Move your hands further apart", kind: "shape" };
  return { text: s.everLocked ? "Make the L shapes again" : "Make an L with each hand", kind: "shape" };
}

// ───────────────────────────── loading

export const LOADING_STEPS = 4;

export interface LoadingCopy {
  label: string;
  /** Machine-voice detail (rendered in type-label). Real numbers only. */
  detail?: string;
  /** 0 to 1, or null while the length of the stage is unknown. */
  progress: number | null;
  /** 0-based step for the step dots. */
  step: number;
}

const MB = 1024 * 1024;
const mb = (bytes: number) => (bytes / MB).toFixed(1);

/** The real stages: download, start the runtime, time GPU against CPU, start the camera. */
export function loadingCopy(p: LoadProgress | null, modelReady: boolean): LoadingCopy {
  if (modelReady) return { label: "Starting the camera", progress: null, step: 3 };
  if (!p || p.stage === "download") {
    return {
      label: "Downloading the hand model",
      detail: p && p.totalBytes > 0 ? `${mb(p.loadedBytes)} of ${mb(p.totalBytes)} MB` : undefined,
      progress: p ? p.fraction : 0,
      step: 0,
    };
  }
  if (p.stage === "compile") {
    return { label: "Starting the hand model", detail: "MediaPipe runtime", progress: null, step: 1 };
  }
  const gpu = p.timings?.GPU;
  return {
    label: "Picking the faster chip",
    detail: gpu != null ? `Graphics card ${gpu.toFixed(1)} ms, now timing the processor` : "No graphics card here, timing the processor",
    progress: null,
    step: 2,
  };
}

// ───────────────────────────── the reveal

export interface SessionNumbers {
  /** Camera pictures the hand model checked. */
  framesTracked: number;
  /** Hands found, summed over all pictures. */
  handsFound: number;
  /** Pictures in which the Cartoon filter's face model found a face. */
  facesFound: number;
  /** Pictures checked per second, measured. Null when there's nothing to measure yet. */
  perSecond: number | null;
  locks: number;
  lensesTried: number;
  /** Seconds a frame was up. */
  lockedSeconds: number;
  /** The most screen pixels inside one frame. */
  maxFramePixels: number;
  /** Lens index that spent longest in a frame, or -1. */
  favouriteLens: number;
  /** Hand model time per picture, ms. */
  inferenceMs: number | null;
  delegate: Delegate | null;
  /** The camera's picture size, or 0 before the first frame. */
  videoWidth: number;
  videoHeight: number;
}

export interface SessionSummary extends SessionNumbers {
  seconds: number;
  /** Lens indices seen inside a frame, in picker order. */
  triedLenses: readonly number[];
}

export const NO_NUMBERS: SessionNumbers = {
  framesTracked: 0,
  handsFound: 0,
  facesFound: 0,
  perSecond: null,
  locks: 0,
  lensesTried: 0,
  lockedSeconds: 0,
  maxFramePixels: 0,
  favouriteLens: -1,
  inferenceMs: null,
  delegate: null,
  videoWidth: 0,
  videoHeight: 0,
};

/** Average tracking rate over a whole session; null for sessions too short to say. */
export function averageRate(framesTracked: number, seconds: number) {
  return seconds >= 1 && framesTracked > 0 ? Math.round(framesTracked / seconds) : null;
}

/** Every landmark the model placed on the visitor's hands this session. */
export const pointsFound = (handsFound: number) => handsFound * POINTS_PER_HAND;

/** "the graphics card" / "the processor" for the measured backend. */
const chip = (d: Delegate | null) => (d === "CPU" ? "the processor" : "the graphics card");

/** Pixels are three numbers each; "1,280 × 720" when the camera is known. */
export function howIntro(n: SessionNumbers | null) {
  if (n && n.videoWidth > 0 && n.videoHeight > 0) {
    return `A camera only gives the computer pixels. Each picture from this one is ${formatCount(n.videoWidth)} × ${formatCount(n.videoHeight)}: ${formatCount(n.videoWidth * n.videoHeight)} pixels, and each pixel is three numbers for red, green and blue. This is how those numbers became a frame you control.`;
  }
  return "A camera only gives the computer pixels, and each pixel is three numbers for red, green and blue. This is how those numbers become a frame you control.";
}

export type HowStepId = "points" | "corners" | "smoothing" | "recipe" | "face";

export interface HowStep {
  id: HowStepId;
  title: string;
  text: string;
  /** The visitor's own numbers, when there are any. */
  yours?: string;
}

/** "It checked 2,914 pictures of you, about 28 every second, and placed 107,520 points on your hands." */
function pointsLine(n: SessionNumbers) {
  const rate = n.perSecond ? `, about ${formatCount(n.perSecond)} every second` : "";
  const found =
    n.handsFound > 0
      ? `${rate}, and placed ${formatCount(pointsFound(n.handsFound))} points on your hands.`
      : `${rate}. It found no hands in them.`;
  const speed =
    n.inferenceMs != null && n.inferenceMs > 0 ? ` Each picture took it about ${n.inferenceMs.toFixed(0)} ms on ${chip(n.delegate)}.` : "";
  return `It checked ${formatCount(n.framesTracked)} ${plural(n.framesTracked, "picture", "pictures")} of you${found}${speed}`;
}

function cornersLine(n: SessionNumbers) {
  const held = n.lockedSeconds >= 1 ? ` and held it up for ${formatDuration(n.lockedSeconds)}` : "";
  return `You made a frame ${formatCount(n.locks)} ${plural(n.locks, "time", "times")}${held}.`;
}

function recipeLine(n: SessionNumbers) {
  const parts: string[] = [];
  if (n.maxFramePixels > 0) parts.push(`Your biggest frame held ${formatCount(n.maxFramePixels)} pixels, all redrawn every time the picture changed.`);
  const fav = lensName(n.favouriteLens);
  if (n.lensesTried > 0) {
    parts.push(`You tried ${n.lensesTried} of ${LENS_COUNT} filters${fav && n.lensesTried > 1 ? `, and stayed longest on ${fav}` : ""}.`);
  }
  return parts.length ? parts.join(" ") : undefined;
}

export function howSteps(n: SessionNumbers | null): HowStep[] {
  const has = n !== null && n.framesTracked > 0;
  return [
    {
      id: "points",
      title: `It finds ${POINTS_PER_HAND} points on each hand`,
      text: `A hand model looks at every picture the camera sends. Wherever it sees a hand, it places ${POINTS_PER_HAND} points: one on the wrist and four along each finger and thumb.`,
      yours: has ? pointsLine(n) : undefined,
    },
    {
      id: "corners",
      title: `Only ${FRAME_POINTS} of them make the frame`,
      text: `It uses the tip of each thumb (point ${LM.THUMB_TIP}) and each index finger (point ${LM.INDEX_TIP}), and joins them with the tightest shape that fits around all ${FRAME_POINTS}. So the frame never twists, even if your hands cross.`,
      yours: has && n.locks > 0 ? cornersLine(n) : undefined,
    },
    {
      id: "smoothing",
      title: "It steadies the shaky points",
      text: "Every point wobbles a little from one picture to the next, even when you hold still. So the program averages each corner's recent positions: a lot while your hand is still, hardly at all while it moves fast. The frame stays steady but never lags behind.",
      yours: has && n.perSecond ? `Each corner was measured about ${formatCount(n.perSecond)} times a second.` : undefined,
    },
    {
      id: "recipe",
      title: "A filter is a recipe for every pixel",
      text: "Inside the frame, the graphics card runs a short recipe on every pixel at the same time. Dots, for example, reads the middle pixel of each small patch, works out how bright it is (0.21 × red + 0.72 × green + 0.07 × blue) and draws one dot: the brighter the pixel, the bigger the dot.",
      yours: has ? recipeLine(n) : undefined,
    },
    {
      id: "face",
      title: "Cartoon also finds your face",
      text: `Pick Cartoon and a second model places ${FACE_POINTS} points on your face. The recipe reads ${FACE_POINTS_USED} of them, around your eyes, cheeks and chin, then grows your eyes, shrinks your chin, smooths your skin and warms the light.`,
      yours:
        has && n.facesFound > 0
          ? `It found your face in ${formatCount(n.facesFound)} ${plural(n.facesFound, "picture", "pictures")}.`
          : undefined,
    },
  ];
}

/** The end-of-session verdict. */
export function summaryTitle(s: SessionNumbers) {
  if (s.locks > 0) return `Your frame was just ${FRAME_POINTS} points`;
  if (s.handsFound > 0) return "It found your hands";
  return "It didn't see your hands this time";
}

/** Under the verdict: what it means, or what to try next time. */
export function summaryLine(s: SessionNumbers) {
  if (s.locks > 0) {
    return `It found ${formatCount(pointsFound(s.handsFound))} points on your hands, but your frame only ever used ${FRAME_POINTS} of them at a time: your thumb tips and index fingertips.`;
  }
  if (s.handsFound > 0) return "Next time, make an L with each hand, thumbs pointing toward each other, and a frame appears between your fingertips.";
  return "Stand about an arm's length from the camera, with light on your hands, and hold them up with your palms facing it.";
}
