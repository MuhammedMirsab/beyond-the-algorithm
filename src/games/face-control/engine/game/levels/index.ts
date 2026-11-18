import type { LevelDef, SignDef } from "./types";

/*
 * Level geometry, in world units (the screen is always 720 units tall).
 * Platform `y` is the top surface. Jump physics (see config.ts): apex ~168
 * units above take-off and ~0.82 s of air time.
 *
 * Design rules used throughout:
 *  - Every gap can be cleared at roughly 60% steering, because face control is
 *    less precise than a keyboard.
 *  - Gaps of 30 units or less (narrower than the ball) can simply be rolled
 *    across; wider ones always need a jump, so there is nothing in between
 *    that looks rollable but isn't.
 *  - Rolling slowly off a high ledge always lands on solid ground.
 *  - Sparks over gaps sit on the arc of a typical jump.
 *  - Boost pads only appear on long flat stretches, where a boosted jump
 *    cannot overshoot the next platform.
 */

export const PRACTICE: LevelDef = {
  id: 0,
  name: "Practice",
  tagline: "Try the controls",
  theme: "dawn",
  music: "menu",
  width: 1600,
  spawn: { x: 800, y: 520 },
  maxSpeed: 300,
  parTime: 0,
  practice: true,
  platforms: [{ x: 0, y: 560, w: 1600 }],
  sparks: [
    { x: 470, y: 520 },
    { x: 1130, y: 520 },
    { x: 800, y: 410 },
  ],
};

const LEVEL_1: LevelDef = {
  id: 1,
  name: "The beginning",
  tagline: "Learn to roll, jump and collect.",
  theme: "dawn",
  music: "level1",
  width: 4700,
  spawn: { x: 300, y: 520 },
  maxSpeed: 300,
  parTime: 55,
  platforms: [
    { x: 0, y: 560, w: 1150 },
    { x: 1150, y: 490, w: 550 },
    { x: 1830, y: 490, w: 520 },
    { x: 2350, y: 560, w: 850 },
    { x: 3330, y: 470, w: 200, h: 34 },
    { x: 3660, y: 420, w: 200, h: 34 },
    { x: 3940, y: 560, w: 760 },
  ],
  spikes: [{ x: 2650, y: 560, w: 80 }],
  sparks: [
    { x: 110, y: 520 },
    { x: 600, y: 520 },
    { x: 720, y: 520 },
    { x: 1300, y: 450 },
    { x: 1450, y: 450 },
    { x: 1765, y: 318 },
    { x: 2610, y: 450 },
    { x: 2690, y: 410 },
    { x: 2770, y: 450 },
    { x: 3430, y: 425 },
    { x: 3760, y: 375 },
    { x: 4200, y: 520 },
  ],
  checkpoints: [
    { x: 1960, y: 490 },
    { x: 3040, y: 560 },
  ],
  signs: [
    { x: 470, y: 560, icon: "tilt", text: "Tilt to roll" },
    { x: 970, y: 560, icon: "mouth", text: "Open your mouth to jump" },
    { x: 1560, y: 490, icon: "gap", text: "Jump the gap" },
    { x: 2480, y: 560, icon: "spike", text: "Jump the spikes" },
    { x: 3130, y: 560, icon: "gap", text: "Hop across" },
  ],
  finish: { x: 4450, y: 560 },
};

const LEVEL_2: LevelDef = {
  id: 2,
  name: "The challenge",
  tagline: "Moving platforms, saws and springs.",
  theme: "dusk",
  music: "level2",
  width: 5900,
  spawn: { x: 200, y: 520 },
  maxSpeed: 320,
  parTime: 75,
  platforms: [
    { x: 0, y: 560, w: 900 },
    { x: 1070, y: 500, w: 420 },
    { x: 1990, y: 520, w: 900 },
    // Bonus ledge reached from the spring. Rolling off its end lands ~180 units
    // later, leaving time to react before the jump at the end of this platform.
    { x: 2300, y: 260, w: 260, h: 32 },
    { x: 3060, y: 470, w: 200, h: 34 },
    { x: 3520, y: 330, w: 300, h: 34 },
    { x: 3820, y: 540, w: 930 },
    { x: 4920, y: 480, w: 120 },
    { x: 5200, y: 540, w: 700 },
  ],
  movers: [
    // Starts and ends 10 units from solid ground, so you can roll on and off.
    { x: 1500, y: 500, w: 150, dx: 330, period: 3.8 },
    { x: 3290, y: 470, w: 140, dy: -150, period: 3.4 },
  ],
  spikes: [
    { x: 540, y: 560, w: 60 },
    { x: 2400, y: 520, w: 100 },
    { x: 4380, y: 540, w: 80 },
  ],
  saws: [
    { x: 1260, y: 360, r: 24, dy: 112, period: 2.4 },
    { x: 3560, y: 306, r: 24, dx: 220, period: 2.8 },
    { x: 4620, y: 396, r: 26, dy: 104, period: 2.2, phase: 0.3 },
  ],
  sparks: [
    { x: 400, y: 520 },
    { x: 570, y: 430 },
    { x: 985, y: 395 },
    { x: 1140, y: 460 },
    { x: 1400, y: 460 },
    { x: 1640, y: 452 },
    { x: 1860, y: 452 },
    { x: 2150, y: 480 },
    { x: 2370, y: 222 },
    { x: 2450, y: 222 },
    { x: 2530, y: 222 },
    { x: 3160, y: 425 },
    { x: 3360, y: 380 },
    { x: 3670, y: 190 },
    { x: 4250, y: 500 },
    { x: 4980, y: 440 },
  ],
  checkpoints: [
    { x: 2010, y: 520 },
    { x: 4180, y: 540 },
  ],
  pads: [{ x: 2180, y: 520 }],
  signs: [
    { x: 1420, y: 500, icon: "mover", text: "Ride across" },
    { x: 2100, y: 520, icon: "pad", text: "Spring up" },
    { x: 3110, y: 470, icon: "mover", text: "Going up" },
  ],
  finish: { x: 5650, y: 540 },
};

const LEVEL_3: LevelDef = {
  id: 3,
  name: "The final run",
  tagline: "Faster, sharper, back-to-back jumps.",
  theme: "night",
  music: "level3",
  width: 8000,
  spawn: { x: 200, y: 520 },
  maxSpeed: 360,
  parTime: 95,
  platforms: [
    { x: 0, y: 560, w: 1300 },
    // Pillar run: five jumps in a row.
    { x: 1440, y: 510, w: 170 },
    { x: 1750, y: 470, w: 170 },
    { x: 2060, y: 510, w: 170 },
    { x: 2370, y: 470, w: 170 },
    { x: 2680, y: 520, w: 1260 },
    { x: 4500, y: 480, w: 220, h: 34 },
    { x: 4960, y: 300, w: 480, h: 34 },
    { x: 5440, y: 560, w: 780 },
    // Final pillars.
    { x: 6360, y: 500, w: 170 },
    { x: 6670, y: 460, w: 170 },
    { x: 6980, y: 500, w: 170 },
    { x: 7290, y: 540, w: 710 },
  ],
  movers: [
    { x: 3950, y: 520, w: 150, dx: 300, period: 3.4 },
    { x: 4730, y: 480, w: 130, dy: -170, period: 3.0, phase: 0.5 },
  ],
  spikes: [
    { x: 700, y: 560, w: 60 },
    { x: 5860, y: 560, w: 100 },
  ],
  saws: [
    { x: 5240, y: 230, r: 22, orbit: 62, period: 3.2 },
    { x: 6910, y: 300, r: 24, dy: 170, period: 2.2 },
  ],
  crushers: [
    { x: 3390, w: 90, h: 140, up: 360, down: 520, period: 2.4 },
    { x: 3640, w: 90, h: 140, up: 360, down: 520, period: 2.4, phase: 0.45 },
  ],
  bars: [{ x: 3010, y: 400, length: 115, speed: 1.7 }],
  sparks: [
    { x: 500, y: 520 },
    { x: 730, y: 430 },
    { x: 1050, y: 520 },
    { x: 1370, y: 395 },
    { x: 1680, y: 350 },
    { x: 1990, y: 310 },
    { x: 2300, y: 350 },
    { x: 2610, y: 310 },
    { x: 2820, y: 480 },
    { x: 3515, y: 490 },
    { x: 3800, y: 490 },
    { x: 4170, y: 478 },
    { x: 4600, y: 438 },
    { x: 4795, y: 390 },
    { x: 5110, y: 262 },
    { x: 5370, y: 262 },
    { x: 5700, y: 520 },
    { x: 5910, y: 385 },
    { x: 6755, y: 420 },
    { x: 7500, y: 500 },
  ],
  checkpoints: [
    { x: 2750, y: 520 },
    { x: 5020, y: 300 },
    { x: 5560, y: 560 },
  ],
  boosts: [{ x: 360, y: 560 }],
  signs: [
    { x: 230, y: 560, icon: "boost", text: "Speed boost" },
    { x: 2860, y: 520, icon: "saw", text: "Time your run" },
    { x: 3250, y: 520, icon: "crusher", text: "Wait for it" },
    { x: 5660, y: 560, icon: "finish", text: "Final run" },
  ],
  finish: { x: 7700, y: 540 },
};

export const LEVELS: LevelDef[] = [LEVEL_1, LEVEL_2, LEVEL_3];

/** Level signs describe face controls; someone on the keyboard reads the keys instead. */
export function keyboardSign(sign: SignDef): SignDef {
  if (sign.icon === "tilt") return { ...sign, icon: "arrows", text: "Arrow keys to roll" };
  if (sign.icon === "mouth") return { ...sign, icon: "space", text: "Space to jump" };
  return sign;
}
