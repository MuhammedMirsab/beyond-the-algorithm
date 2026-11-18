"use client";

import NumberFlow from "@number-flow/react";
import { motion } from "motion/react";
import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { START_LIVES } from "../engine/game/bridge";
import { LEVELS } from "../engine/game/levels";
import { formatTime } from "../engine/format";
import type { FaceControlSession } from "../play/session";
import type { RunValues } from "./hooks";
import { FlagIcon, Lives, SparkIcon } from "./icons";

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

/** Where each checkpoint sits on the track, 0 (start) to 1 (finish). */
function checkpointMarks(levelIndex: number): number[] {
  const level = LEVELS[levelIndex];
  if (!level?.finish) return [];
  const span = level.finish.x - level.spawn.x;
  return (level.checkpoints ?? []).map((c) => (c.x - level.spawn.x) / span).filter((f) => f > 0 && f < 1);
}

/**
 * The level as a line from start to finish, with the ball on it: you always
 * see how far there is to go (goal gradient). Moved straight from the world
 * every frame, never through React state.
 */
function LevelTrack({ session, levelIndex }: { session: FaceControlSession; levelIndex: number }) {
  const ball = useRef<HTMLSpanElement>(null);
  const fill = useRef<HTMLSpanElement>(null);
  const marks = checkpointMarks(levelIndex);

  useEffect(() => {
    let raf = 0;
    let shown = -1;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const p = Math.round(session.ctx.view.progress * 1000) / 1000;
      if (p === shown) return;
      shown = p;
      if (ball.current) ball.current.style.left = `${p * 100}%`;
      if (fill.current) fill.current.style.transform = `scaleX(${p})`;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [session]);

  return (
    <div aria-hidden className="flex items-center gap-2">
      <span className="relative h-1.5 flex-1 rounded-full bg-fg/12">
        <span ref={fill} className="absolute inset-0 origin-left rounded-full bg-game/45" style={{ transform: "scaleX(0)" }} />
        {marks.map((m) => (
          <span key={m} className="absolute top-1/2 h-2.5 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-fg/35" style={{ left: `${m * 100}%` }} />
        ))}
        <span
          ref={ball}
          className="absolute left-0 top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-game shadow-[0_0_0_2.5px_var(--color-surface)]"
        />
      </span>
      <FlagIcon className="text-fg-muted" />
    </div>
  );
}

/** A small number that bumps when it goes up: the spark you just took lands here. */
function Bump({ value, children, className }: { value: number; children: ReactNode; className?: string }) {
  return (
    <motion.span
      key={value}
      className={cn("inline-flex items-center gap-1.5", className)}
      initial={value > 0 ? { scale: 1.22 } : false}
      animate={{ scale: 1, transition: { type: "spring", duration: 0.4, bounce: 0.35 } }}
    >
      {children}
    </motion.span>
  );
}

/**
 * The status panel in the top-left during a level: which level, the clock, the
 * track to the finish, lives, sparks and score. One unit instead of five
 * chips, so the eye finds it in one place.
 */
export function Hud({ session, run }: { session: FaceControlSession; run: RunValues }) {
  const level = LEVELS[run.levelIndex] ?? LEVELS[0];
  return (
    <motion.section
      aria-label="Game status"
      className="pointer-events-none flex w-full flex-col gap-2.5 rounded-lg bg-surface/95 px-4 pb-3 pt-2.5 shadow-ring md:w-[clamp(18rem,25vw,23rem)]"
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0, transition: { duration: 0.35, ease: EASE_OUT } }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="type-small min-w-0 truncate font-semibold text-fg">
          <span className="text-game">
            Level {run.levelIndex + 1} of {LEVELS.length}
          </span>
          <span className="text-fg-muted"> · {level.name}</span>
        </p>
        <span className="type-label shrink-0 tabular-nums text-fg-muted" aria-label={`Time ${formatTime(run.levelTime)}`}>
          {formatTime(run.levelTime)}
        </span>
      </div>
      <LevelTrack session={session} levelIndex={run.levelIndex} />
      <dl className="flex items-center gap-4">
        <div className="mr-auto flex items-center gap-2">
          <dt className="sr-only">Lives</dt>
          <dd>
            <Lives lives={run.lives} total={START_LIVES} />
          </dd>
        </div>
        <div className="flex items-center">
          <dt className="sr-only">Sparks</dt>
          <dd className="type-small font-semibold tabular-nums text-fg">
            <Bump value={run.sparks}>
              <SparkIcon className="text-game" />
              {run.sparks}
              <span className="font-medium text-fg-subtle">/{run.sparksTotal}</span>
            </Bump>
          </dd>
        </div>
        <div className="flex items-center gap-1.5">
          <dt className="type-label text-fg-subtle">Score</dt>
          <dd className="type-small font-semibold tabular-nums text-fg">
            <NumberFlow value={run.score} format={{ useGrouping: true }} />
          </dd>
        </div>
      </dl>
    </motion.section>
  );
}
