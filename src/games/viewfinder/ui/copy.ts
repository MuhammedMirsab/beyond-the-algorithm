/**
 * Everything Viewfinder says, as plain functions of real state. No React
 * here, so the wording logic is unit-tested (copy.test.ts). Rules from
 * DESIGN.md §9: sentence case, short, no dashes, no made-up numbers.
 */
import { FRAME_POINTS, POINTS_PER_HAND } from "../engine/gesture";
import { LENS_COUNT } from "../engine/lenses";
import type { Delegate, LoadProgress } from "../engine/tracker";

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

// ───────────────────────────── intro

export const INTRO_STEPS = [
  { title: "Hold up both hands", text: "Keep them in the picture, palms facing the camera." },
  {
    title: "Make an L with each thumb and index finger to frame something",
    text: `Your ${FRAME_POINTS} fingertips become the corners of the frame.`,
  },
  { title: "Pinch to change the lens", text: "Right hand for the next lens, left hand to go back." },
];

// ───────────────────────────── live

/** The status chip: what to do next, in the order a visitor gets there. */
export function statusText({ locked, hands }: { locked: boolean; hands: number }) {
  if (locked) return "Frame locked";
  if (hands >= 2) return "Make an L shape with each hand";
  if (hands === 1) return "Now your other hand";
  return "Raise both hands";
}

/**
 * Shown under the status once a frame is up, until the visitor has pinched.
 * Pinching the hand on the right of the screen moves to the next lens; with
 * the picture mirrored (the default) that is the visitor's own right hand.
 */
export function pinchHint({ locked, pinches, mirror }: { locked: boolean; pinches: number; mirror: boolean }) {
  if (!locked || pinches > 0) return null;
  return mirror ? "Pinch your right hand for the next lens" : "Pinch the hand on the right for the next lens";
}

/** Machine readout while "Show what the AI sees" is on. */
export function pointsReadout(hands: number) {
  return `${hands} ${plural(hands, "hand", "hands")} · ${hands * POINTS_PER_HAND} points`;
}

/** The optional stats line, all measured live in this browser. */
export function statsReadout(s: { delegate: Delegate | null; fps: number; inferenceMs: number; latencyMs: number | null }) {
  const parts = [s.delegate ?? "Model", `${s.fps} fps`, `model ${s.inferenceMs.toFixed(1)} ms`];
  if (s.latencyMs !== null) parts.push(`delay ${s.latencyMs} ms`);
  return parts.join(" · ");
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
    return { label: "Starting the hand tracker", detail: "MediaPipe runtime", progress: null, step: 1 };
  }
  const gpu = p.timings?.GPU;
  return {
    label: "Choosing GPU or CPU",
    detail: gpu != null ? `GPU took ${gpu.toFixed(1)} ms, now testing CPU` : "No GPU here, testing CPU",
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
  /** Pictures checked per second, measured. Null when there's nothing to measure yet. */
  perSecond: number | null;
  locks: number;
  lensesTried: number;
}

export interface SessionSummary extends SessionNumbers {
  seconds: number;
}

/** Average tracking rate over a whole session; null for sessions too short to say. */
export function averageRate(framesTracked: number, seconds: number) {
  return seconds >= 1 && framesTracked > 0 ? Math.round(framesTracked / seconds) : null;
}

export const HOW_INTRO =
  "A camera only gives the computer pixels. Each pixel is three numbers: how red, green and blue it is. This is how those numbers became a frame you control.";

export interface HowStep {
  title: string;
  text: string;
  /** The visitor's own numbers, when there are any. */
  yours?: string;
}

/** "It checked 2,914 pictures of you, about 28 every second. It found 5,120 hands in them." */
function checkedLine(n: SessionNumbers) {
  const rate = n.perSecond ? `, about ${formatCount(n.perSecond)} every second` : "";
  const found =
    n.handsFound > 0
      ? `It found ${formatCount(n.handsFound)} ${plural(n.handsFound, "hand", "hands")} in them.`
      : "It found no hands in them.";
  return `It checked ${formatCount(n.framesTracked)} ${plural(n.framesTracked, "picture", "pictures")} of you${rate}. ${found}`;
}

export function howSteps(n: SessionNumbers | null): HowStep[] {
  return [
    {
      title: `It finds ${POINTS_PER_HAND} points on each hand`,
      text: `A hand model checks every picture from the camera. On each hand it finds, it marks ${POINTS_PER_HAND} points: the wrist, the knuckles and the fingertips.`,
      yours: n && n.framesTracked > 0 ? checkedLine(n) : undefined,
    },
    {
      title: `Your frame is just ${FRAME_POINTS} of those points`,
      text: `Viewfinder only uses the tips of your thumbs and index fingers. When both hands make an L, those ${FRAME_POINTS} points become the corners of the frame.`,
      yours: n && n.locks > 0 ? `You made a frame ${formatCount(n.locks)} ${plural(n.locks, "time", "times")}.` : undefined,
    },
    {
      title: "The lens redraws the inside",
      text: `Every pixel inside the ${FRAME_POINTS} corners goes through the lens. It turns the pixel's numbers into dots, letters or new colours. Pixels outside are only dimmed.`,
      yours: n && n.lensesTried > 0 ? `You tried ${n.lensesTried} of ${LENS_COUNT} lenses.` : undefined,
    },
  ];
}

/** The end-of-session verdict. */
export function summaryTitle(s: SessionNumbers) {
  if (s.locks > 0) return `Your frame was just ${FRAME_POINTS} points`;
  if (s.handsFound > 0) return "It found your hands";
  return "It didn't see your hands this time";
}

/** Every landmark the model placed on the visitor's hands this session. */
export const pointsFound = (handsFound: number) => handsFound * POINTS_PER_HAND;
