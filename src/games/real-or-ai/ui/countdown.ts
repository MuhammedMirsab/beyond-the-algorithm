"use client";

import { useEffect, useState } from "react";
import { ROUND_MS, SECONDS_PER_ROUND } from "../engine/scoring";
import { timerState } from "../engine/timer";

/**
 * A round's clock, as the round reports it. The HUD and the closer look draw
 * from it: they never count, they read the time from `startedAt`.
 */
export type Clock =
  | { state: "waiting" }
  | { state: "running"; startedAt: number }
  | { state: "stopped"; remainingMs: number };

/** How much of the round is left, 1 to 0, right now. */
export function fractionLeft(clock: Clock, now: number): number {
  if (clock.state === "waiting") return 1;
  if (clock.state === "stopped") return timerState(ROUND_MS - clock.remainingMs).fraction;
  return timerState(now - clock.startedAt).fraction;
}

/**
 * Whole seconds left on the clock. While it runs, a frame loop reads the
 * time and updates only when the number changes (once a second); waiting and
 * stopped clocks need no loop at all.
 */
export function useSecondsLeft(clock: Clock): number {
  const [tick, setTick] = useState<{ startedAt: number; seconds: number }>({ startedAt: -1, seconds: SECONDS_PER_ROUND });

  useEffect(() => {
    if (clock.state !== "running") return;
    let raf = 0;
    const loop = () => {
      const t = timerState(performance.now() - clock.startedAt);
      setTick((prev) => (prev.startedAt === clock.startedAt && prev.seconds === t.secondsLeft ? prev : { startedAt: clock.startedAt, seconds: t.secondsLeft }));
      if (!t.done) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [clock]);

  if (clock.state === "waiting") return SECONDS_PER_ROUND;
  if (clock.state === "stopped") return timerState(ROUND_MS - clock.remainingMs).secondsLeft;
  // A new clock before its first frame: it's the full round.
  return tick.startedAt === clock.startedAt ? tick.seconds : SECONDS_PER_ROUND;
}
