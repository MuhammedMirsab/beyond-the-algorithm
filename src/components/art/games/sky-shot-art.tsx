"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ArtProps } from "../game-art";

/**
 * Sky Shot: a pixel bird and the laser crosshair that follows a pointing
 * finger. Drawn in game ink on the game colour.
 *
 * - "tile": the bird in flight, crosshair off to one side. Hover slides the
 *   crosshair onto the bird.
 * - "intro": a wordless loop. The bird zig-zags, the crosshair chases it,
 *   locks on, a ring flashes and the bird drops.
 */
export function SkyShotArt({ mode = "tile" }: ArtProps) {
  return mode === "intro" ? <IntroLoop /> : <Tile />;
}

const INK = "currentColor";
const PX = 9;

/** 13 x 7 pixel bird facing right; "." is empty, "e" is the eye (left open). */
const BIRD = [
  "....##.......",
  "....###......",
  "....####.##..",
  "##.######e##o",
  ".##########..",
  "..########...",
  "....#..#.....",
];
const BIRD_W = 13 * PX;
const BIRD_H = 7 * PX;

function PixelBird({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x - BIRD_W / 2} ${y - BIRD_H / 2})`} fill={INK}>
      {BIRD.flatMap((row, r) =>
        row.split("").map((ch, c) =>
          ch === "#" || ch === "o" ? <rect key={`${r}-${c}`} x={c * PX} y={r * PX} width={PX} height={PX} /> : null,
        ),
      )}
    </g>
  );
}

function Crosshair({ r = 34 }: { r?: number }) {
  return (
    <g fill="none" stroke={INK} strokeWidth={6} strokeLinecap="round">
      <circle r={r} />
      <path d={`M0 ${-r - 16}V${-r + 8}M0 ${r - 8}V${r + 16}M${-r - 16} 0H${-r + 8}M${r - 8} 0H${r + 16}`} />
      <circle r={7} fill={INK} stroke="none" />
    </g>
  );
}

/** Grass line along the bottom, in steps like pixel blades. */
function Grass() {
  const steps: string[] = [];
  for (let x = 0; x <= 400; x += 20) steps.push(`L${x} ${x % 40 === 0 ? 252 : 262}L${x + 10} ${x % 40 === 0 ? 262 : 252}`);
  return <path d={`M0 300V258${steps.join("")}L400 258V300Z`} fill={INK} fillOpacity={0.22} />;
}

/* ── Hub tile ──────────────────────────────────────────────────────── */

function Tile() {
  return (
    <svg viewBox="0 0 400 300" className="size-full" aria-hidden>
      <Grass />
      <PixelBird x={236} y={118} />
      <g className="art-move group-hover/tile:translate-x-[-84px] group-hover/tile:translate-y-[-50px]">
        <g transform="translate(320 168)">
          <Crosshair />
        </g>
      </g>
    </svg>
  );
}

/* ── Intro loop ────────────────────────────────────────────────────── */

const LOOP = 3.6;
/** Bird path, then the drop after the shot at t = 0.62. */
const BIRD_X = [90, 170, 250, 236, 236, 236, 90];
const BIRD_Y = [190, 110, 150, 120, 120, 300, 300];
const BIRD_T = [0, 0.22, 0.42, 0.56, 0.66, 0.9, 1];
const AIM_X = [320, 260, 230, 236, 236, 300, 320];
const AIM_Y = [210, 190, 150, 120, 120, 180, 210];
const AIM_T = [0, 0.22, 0.42, 0.56, 0.66, 0.9, 1];

function IntroLoop() {
  const still = useReducedMotion();
  if (still) {
    return (
      <svg viewBox="0 0 400 300" className="size-full" aria-hidden>
        <Grass />
        <PixelBird x={236} y={120} />
        <g transform="translate(236 120)">
          <Crosshair />
        </g>
      </svg>
    );
  }
  const repeat = { duration: LOOP, repeat: Infinity, ease: "easeInOut" as const };
  return (
    <svg viewBox="0 0 400 300" className="size-full" aria-hidden>
      <Grass />
      <motion.g initial={{ x: BIRD_X[0], y: BIRD_Y[0] }} animate={{ x: BIRD_X, y: BIRD_Y }} transition={{ ...repeat, times: BIRD_T }}>
        <motion.g animate={{ rotate: [0, 0, 0, 0, 0, 180, 180] }} transition={{ ...repeat, times: BIRD_T }}>
          <PixelBird x={0} y={0} />
        </motion.g>
      </motion.g>
      <motion.g initial={{ x: AIM_X[0], y: AIM_Y[0] }} animate={{ x: AIM_X, y: AIM_Y }} transition={{ ...repeat, times: AIM_T }}>
        <Crosshair />
        <motion.circle
          r={34}
          fill="none"
          stroke={INK}
          strokeWidth={4}
          animate={{ scale: [1, 1, 2.2, 2.2], opacity: [0, 1, 0, 0] }}
          transition={{ duration: LOOP, repeat: Infinity, times: [0, 0.62, 0.72, 1], ease: "easeOut" }}
        />
      </motion.g>
    </svg>
  );
}
