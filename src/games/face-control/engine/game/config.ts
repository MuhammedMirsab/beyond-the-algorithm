/** World units. The camera always shows exactly WORLD_H units vertically. */
export const WORLD_H = 720;
/** Anything that falls below this line is lost. */
export const KILL_Y = 800;
/** Visual ball radius. */
export const BALL_R = 22;
/** Radius used for hazard tests — a little smaller than the ball, so near-misses feel fair. */
export const HIT_R = 17;
/** Radius used for collecting sparks — a little bigger, so pickups feel generous. */
export const PICK_R = 36;
/** Procedural textures are drawn at this multiple of their world size for crisp zoomed rendering. */
export const TEX = 3;

export const PHYS = {
  gravity: 2000,
  /** Apex ≈ 168 units, airtime ≈ 0.82 s. */
  jumpVelocity: 820,
  padVelocity: 1190,
  maxFall: 1150,
  /** Exponential approach rates (per second) towards the target speed. */
  accelGround: 7.5,
  accelAir: 3.8,
  /** Speeding back up after a direction change. */
  brakeGround: 10,
  /** Rolling friction when the head is neutral — the ball coasts briefly, like a ball should. */
  coastGround: 4.2,
  coastAir: 0.6,
  /** Forgiveness windows (seconds): face input has a little latency, so we are generous. */
  coyote: 0.15,
  jumpBuffer: 0.24,
  boostSpeed: 600,
  boostTime: 0.8,
};
