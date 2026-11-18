"use client";

import NumberFlow from "@number-flow/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowBigUp, Camera, Check, ChevronLeft, ChevronRight, Keyboard, Play, RotateCcw, ScanFace, SlidersHorizontal, Trophy } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { NextPlayerIcon } from "@/components/game/next-player";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { KeyHints } from "@/components/ui/key-hints";
import { Kbd } from "@/components/ui/surface";
import { cn } from "@/lib/cn";
import { formatScore, formatTime } from "../engine/format";
import { LEVELS } from "../engine/game/levels";
import { LEVEL_CARD_MS, LEVEL_COUNT, type MachineState, type PracticeTask } from "../play/machine";
import { PRACTICE_STEER, type FaceControlSession } from "../play/session";
import { CameraSlot } from "./camera-slot";
import type { RunValues } from "./hooks";
import { Lives, MovePictogram, SparkIcon } from "./icons";
import { MouthPrompt } from "./meters";
import { GUIDANCE } from "./use-calibration";

const EASE_OUT = [0.22, 1, 0.36, 1] as const;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** A centred panel over the dimmed world. Scrolls on short screens instead of clipping. */
export function WorldPanel({ labelledBy, children, className }: { labelledBy: string; children: ReactNode; className?: string }) {
  return (
    <motion.div
      className="absolute inset-0 z-[25] flex overflow-y-auto bg-canvas/55 px-4 pb-6 pt-[calc(4.5rem+env(safe-area-inset-top))] sm:px-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: 0.25, ease: EASE_OUT } }}
      exit={{ opacity: 0, transition: { duration: 0.2, ease: EASE_OUT } }}
    >
      <motion.section
        aria-labelledby={labelledBy}
        className={cn("m-auto flex w-full max-w-[34rem] flex-col gap-6 rounded-xl bg-surface p-6 shadow-float sm:p-8", className)}
        initial={{ y: 12, scale: 0.98 }}
        animate={{ y: 0, scale: 1, transition: { duration: 0.4, ease: EASE_OUT } }}
        exit={{ y: 8, transition: { duration: 0.35, ease: EASE_OUT } }}
      >
        {children}
      </motion.section>
    </motion.div>
  );
}

/* ── Practice ─────────────────────────────────────────────────────── */

const TASKS: { id: PracticeTask; face: string; keys: string; key: string; touch: string; touchIcon: ReactNode }[] = [
  { id: "left", face: "Tilt left", keys: "Roll left", key: "←", touch: "Hold left", touchIcon: <ChevronLeft /> },
  { id: "right", face: "Tilt right", keys: "Roll right", key: "→", touch: "Hold right", touchIcon: <ChevronRight /> },
  { id: "jump", face: "Open your mouth", keys: "Jump", key: "Space", touch: "Tap jump", touchIcon: <ArrowBigUp /> },
];

/**
 * Practice: the three moves as pictures, each with a live bar that fills as
 * your face gets there and a tick when it counts. The ball in the world does
 * the move at the same time, so the mapping is learnt by doing, not reading.
 */
export function PracticePanel({ session, machine, touch }: { session: FaceControlSession; machine: MachineState; touch: boolean }) {
  const face = machine.mode === "face";
  const bars = useRef<Record<PracticeTask, HTMLSpanElement | null>>({ left: null, right: null, jump: null });
  const done = machine.practice;
  const count = TASKS.filter((t) => done[t.id]).length;

  useEffect(() => {
    if (!face) return;
    return session.onFrame((s) => {
      const fill: Record<PracticeTask, number> = {
        left: s.hasFace ? clamp01(-s.steer / PRACTICE_STEER) : 0,
        right: s.hasFace ? clamp01(s.steer / PRACTICE_STEER) : 0,
        jump: s.hasFace ? clamp01(s.mouthLevel) : 0,
      };
      for (const id of ["left", "right", "jump"] as const) {
        const el = bars.current[id];
        // A move that has counted keeps its full bar.
        if (el && !done[id]) el.style.transform = `scaleX(${fill[id].toFixed(3)})`;
      }
    });
  }, [session, face, done]);

  return (
    <motion.section
      aria-labelledby="practice-title"
      className="pointer-events-auto flex w-full flex-col gap-3 rounded-lg bg-surface/95 p-3 shadow-ring sm:p-4 md:w-[clamp(21rem,32vw,27rem)]"
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0, transition: { duration: 0.35, ease: EASE_OUT } }}
    >
      <div className="flex items-baseline justify-between gap-3 px-1">
        <h2 id="practice-title" className="type-small font-semibold text-fg">
          <span className="text-game">Practice</span> · try each move
        </h2>
        <span className="type-label tabular-nums text-fg-subtle">{count} of 3</span>
      </div>
      <ol className="grid grid-cols-3 gap-2">
        {TASKS.map((task) => {
          const ok = done[task.id];
          return (
            <li
              key={task.id}
              className={cn(
                "relative flex flex-col items-center gap-2 rounded-md px-2 pb-2.5 pt-3 text-center transition-colors duration-300 ease-out",
                ok ? "bg-game-soft text-game" : "bg-sunken text-fg",
              )}
            >
              <span className="grid h-8 place-items-center [&_svg]:size-7">
                {face ? (
                  <MovePictogram move={task.id} />
                ) : touch ? (
                  task.touchIcon
                ) : (
                  <Kbd size="md" className={ok ? "bg-game text-game-ink" : undefined}>
                    {task.key}
                  </Kbd>
                )}
              </span>
              <span className="type-small font-semibold leading-tight">
                {face ? task.face : touch ? task.touch : task.keys}
                <span className="sr-only">{ok ? ", done" : ", to do"}</span>
              </span>
              {face ? (
                <span aria-hidden className="relative h-1.5 w-full overflow-hidden rounded-full bg-fg/10">
                  <span
                    ref={(el) => {
                      bars.current[task.id] = el;
                    }}
                    className={cn("absolute inset-0 origin-left rounded-full", ok ? "bg-game" : "bg-fg/50")}
                    style={{ transform: ok ? "scaleX(1)" : "scaleX(0)" }}
                  />
                </span>
              ) : null}
              <AnimatePresence>
                {ok ? (
                  <motion.span
                    aria-hidden
                    className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-game text-game-ink [&_svg]:size-3"
                    initial={{ scale: 0.4, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1, transition: { type: "spring", duration: 0.4, bounce: 0.4 } }}
                  >
                    <Check strokeWidth={3.5} />
                  </motion.span>
                ) : null}
              </AnimatePresence>
            </li>
          );
        })}
      </ol>
      <div className="flex items-center justify-between gap-3 pl-1">
        <p aria-live="polite" className="type-small text-fg-muted">
          {machine.practiceComplete ? "All three. Level 1 is next." : "No lives to lose here."}
        </p>
        <Button variant="ghost" size="sm" onClick={() => session.act({ type: "skip-practice" })}>
          {machine.practiceComplete ? "Start now" : "Skip to level 1"}
        </Button>
      </div>
    </motion.section>
  );
}

/* ── Level title card ─────────────────────────────────────────────── */

/**
 * Between levels: the level's name and what to find, then 3, 2, 1, Go on the
 * same card. It starts by itself (the thin bar shows when), so nobody has to
 * find a button between practice and play; an open mouth or Space starts it sooner.
 */
export function LevelCard({
  session,
  machine,
  run,
  bestTime,
  countdown,
}: {
  session: FaceControlSession;
  machine: MachineState;
  run: RunValues;
  bestTime: number | undefined;
  /** 3, 2, 1, 0 (Go) once counting, else null. */
  countdown: number | null;
}) {
  const level = LEVELS[machine.levelIndex];
  const face = machine.mode === "face" && machine.camera;
  const waiting = countdown === null;
  return (
    <motion.div
      className="pointer-events-none absolute inset-0 z-[25] grid place-items-center px-4 pt-16"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: 0.25, ease: EASE_OUT } }}
      exit={{ opacity: 0, transition: { duration: 0.25, ease: EASE_OUT } }}
    >
      <motion.section
        aria-labelledby="level-title"
        className="flex w-full max-w-[27rem] flex-col items-center gap-5 rounded-xl bg-surface/95 px-6 pb-6 pt-7 text-center shadow-float sm:px-8"
        initial={{ y: 18, scale: 0.97 }}
        animate={{ y: 0, scale: 1, transition: { duration: 0.45, ease: EASE_OUT } }}
        exit={{ y: -10, scale: 0.98, transition: { duration: 0.25, ease: EASE_OUT } }}
      >
        <div className="flex flex-col items-center gap-2.5">
          <span className="type-label text-game">
            Level {machine.levelIndex + 1} of {LEVEL_COUNT}
          </span>
          <h2 id="level-title" className="type-display-2 text-fg">
            {level.name}
          </h2>
          <p className="type-body-lg text-fg-muted">{level.tagline}</p>
        </div>
        <ul className="type-small flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-fg-muted">
          <li className="inline-flex items-center gap-1.5">
            <SparkIcon className="text-game" />
            <span>
              <span className="font-semibold tabular-nums text-fg">{level.sparks.length}</span> sparks
            </span>
          </li>
          <li className="inline-flex items-center gap-2">
            <Lives lives={run.lives} total={5} />
            <span>
              <span className="font-semibold tabular-nums text-fg">{run.lives}</span> {run.lives === 1 ? "life" : "lives"}
            </span>
          </li>
          {bestTime !== undefined ? (
            <li>
              Your best <span className="font-semibold tabular-nums text-fg">{formatTime(bestTime)}</span>
            </li>
          ) : null}
        </ul>

        <div className="grid h-[6.5rem] w-full place-items-center">
          <AnimatePresence mode="popLayout" initial={false}>
            {waiting ? (
              <motion.div
                key="waiting"
                className="flex w-full flex-col items-center gap-3"
                exit={{ opacity: 0, transition: { duration: 0.12 } }}
              >
                <span aria-hidden className="relative h-1 w-40 overflow-hidden rounded-full bg-fg/10">
                  <motion.span
                    className="absolute inset-0 origin-left rounded-full bg-game"
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ duration: LEVEL_CARD_MS / 1000, ease: "linear" }}
                  />
                </span>
                <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
                  <Button variant="ghost" size="sm" icon={<Play />} onClick={() => session.act({ type: "start-level" })}>
                    Start now
                  </Button>
                  <div className="hidden items-center lg:flex">
                    {face ? (
                      <span className="type-small text-fg-subtle">or open your mouth</span>
                    ) : (
                      <KeyHints items={[{ keys: ["Space"], label: "Start" }]} />
                    )}
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.span
                key={countdown}
                aria-live="assertive"
                className="type-score text-game"
                initial={{ opacity: 0, scale: 0.82 }}
                animate={{ opacity: 1, scale: 1, transition: { type: "spring", duration: 0.35, bounce: 0.3 } }}
                exit={{ opacity: 0, scale: 1.08, transition: { duration: 0.12, ease: EASE_OUT } }}
              >
                {countdown === 0 ? "Go" : countdown}
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </motion.section>
    </motion.div>
  );
}

/* ── Pause ────────────────────────────────────────────────────────── */

export function PausedPanel({ session, machine, run }: { session: FaceControlSession; machine: MachineState; run: RunValues }) {
  const face = machine.mode === "face";
  const level = LEVELS[machine.levelIndex];
  return (
    <WorldPanel labelledBy="pause-title">
      <div className="flex flex-col gap-3">
        <span className="type-label text-game">
          Level {machine.levelIndex + 1} · {level.name} · {formatTime(run.levelTime)}
        </span>
        <h2 id="pause-title" className="type-display-2 text-fg">
          Paused
        </h2>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Button variant="game" size="lg" arrow autoFocus icon={<Play />} className="sm:col-span-2" onClick={() => session.act({ type: "resume" })}>
          Resume
        </Button>
        <Button variant="secondary" size="lg" icon={<RotateCcw />} onClick={() => session.act({ type: "restart-level" })}>
          Restart level
        </Button>
        {face ? (
          <Button variant="secondary" size="lg" icon={<ScanFace />} onClick={() => session.act({ type: "recalibrate" })}>
            Check my face again
          </Button>
        ) : (
          <Button variant="secondary" size="lg" icon={<Camera />} onClick={() => session.act({ type: "choose-camera" })}>
            Use your face
          </Button>
        )}
        <Button variant="ghost" size="lg" icon={<SlidersHorizontal />} onClick={session.openSettings}>
          Change settings
        </Button>
        <Button variant="ghost" size="lg" icon={<NextPlayerIcon />} onClick={() => session.act({ type: "next-player" })}>
          Next player
        </Button>
      </div>
      <KeyHints items={[{ keys: ["P", "Esc"], label: "Resume" }]} className="hidden lg:flex" />
    </WorldPanel>
  );
}

/* ── Face lost ────────────────────────────────────────────────────── */

/** The face left the camera: the game waits, and carries on by itself when the face is back. */
export function FaceLostPanel({ session }: { session: FaceControlSession }) {
  const hint = useRef<HTMLParagraphElement>(null);

  useEffect(
    () =>
      session.onFrame((s) => {
        const el = hint.current;
        if (!el) return;
        const text = s.hasFace ? "Found you. Carrying on" : GUIDANCE["no-face"];
        if (el.textContent !== text) el.textContent = text;
        el.dataset.ok = s.hasFace ? "true" : "false";
      }),
    [session],
  );

  return (
    <WorldPanel labelledBy="lost-title">
      <div className="flex flex-col gap-2">
        <span className="type-label text-game">Game paused</span>
        <h2 id="lost-title" className="type-title-1 text-fg">
          Can’t see your face
        </h2>
        <p className="type-body-lg text-fg-muted">Look at the screen. The game carries on by itself once the camera finds you.</p>
      </div>
      <CameraSlot session={session} className="aspect-[4/3] w-full rounded-lg" />
      <p
        ref={hint}
        aria-live="polite"
        data-ok="false"
        className="type-body -mt-2 font-semibold text-fg-muted transition-colors duration-150 data-[ok=true]:text-game"
      >
        {GUIDANCE["no-face"]}
      </p>
      <div className="flex flex-wrap gap-3">
        <Button variant="secondary" size="lg" icon={<Keyboard />} onClick={() => session.act({ type: "choose-keyboard" })}>
          Continue with keyboard
        </Button>
        <Button variant="ghost" size="lg" icon={<ScanFace />} onClick={() => session.act({ type: "recalibrate" })}>
          Check my face again
        </Button>
      </div>
    </WorldPanel>
  );
}

/* ── Level complete ───────────────────────────────────────────────── */

/** The sparks of the level as stars: the ones you took light up, sweeping left to right. */
function SparkRow({ got, total }: { got: number; total: number }) {
  return (
    <div role="img" aria-label={`${got} of ${total} sparks`} className="flex flex-wrap items-center gap-1">
      {Array.from({ length: total }, (_, i) => (
        <motion.span
          key={i}
          aria-hidden
          initial={i < got ? { opacity: 0.25, scale: 0.7 } : false}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3, ease: EASE_OUT, delay: 0.15 + (i / Math.max(1, total)) * 0.45 }}
        >
          <SparkIcon className={cn("size-[1.1rem]", i < got ? "text-game" : "text-fg/15")} />
        </motion.span>
      ))}
    </div>
  );
}

function verdict(sparks: number, total: number, falls: number, last: boolean) {
  if (sparks === total && falls === 0) return "A perfect run";
  if (sparks === total) return "Every spark found";
  if (falls === 0) return "Not a single fall";
  return last ? "Final level cleared" : "Nicely rolled";
}

export function LevelCompletePanel({ session, machine }: { session: FaceControlSession; machine: MachineState }) {
  const outcome = machine.outcome;
  const reduce = useReducedMotion();
  const r = outcome?.result;
  const rows = r
    ? [
        { label: `${r.sparks} ${r.sparks === 1 ? "spark" : "sparks"}`, value: r.sparkScore },
        { label: "Level cleared", value: r.completionBonus },
        { label: "Time bonus", value: r.timeBonus },
        ...(r.sparks === r.sparksTotal ? [{ label: "Every spark", value: 300 }] : []),
        ...(r.deaths === 0 ? [{ label: "No falls", value: 200 }] : []),
      ]
    : [];
  // The bonuses land one by one and the total counts up with them: a real tally, not a count-up for show.
  const [shown, setShown] = useState(reduce ? rows.length : 0);
  useEffect(() => {
    if (shown >= rows.length) return;
    const timer = window.setTimeout(() => setShown((n) => n + 1), shown === 0 ? 520 : 240);
    return () => window.clearTimeout(timer);
  }, [shown, rows.length]);

  if (!outcome || !r) return null;
  const last = r.levelIndex >= LEVEL_COUNT - 1;
  const face = machine.mode === "face" && machine.camera;
  const start = r.total - rows.reduce((n, row) => n + row.value, 0);
  const total = start + rows.slice(0, shown).reduce((n, row) => n + row.value, 0);

  return (
    <WorldPanel labelledBy="done-title" className="gap-5">
      <div className="flex flex-col gap-3">
        <span className="type-label text-game">
          Level {r.levelIndex + 1} of {LEVEL_COUNT} cleared
        </span>
        <h2 id="done-title" className="type-display-2 text-fg">
          {verdict(r.sparks, r.sparksTotal, r.deaths, last)}
        </h2>
        <SparkRow got={r.sparks} total={r.sparksTotal} />
      </div>

      <dl className="flex flex-wrap items-end gap-x-8 gap-y-3">
        <div className="flex flex-col gap-1">
          <dt className="type-label text-fg-subtle">Time</dt>
          <dd className="type-title-2 tabular-nums text-fg">{formatTime(r.time)}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="type-label text-fg-subtle">{r.deaths === 1 ? "Fall" : "Falls"}</dt>
          <dd className="type-title-2 tabular-nums text-fg">{r.deaths}</dd>
        </div>
        {outcome.previousBest !== null ? (
          outcome.newBestTime ? (
            <div className="mb-1">
              <dt className="sr-only">Your best</dt>
              <dd>
                <Chip tone="game" icon={<Trophy />}>
                  New best time
                </Chip>
              </dd>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              <dt className="type-label text-fg-subtle">Your best</dt>
              <dd className="type-title-2 tabular-nums text-fg-muted">{formatTime(outcome.previousBest)}</dd>
            </div>
          )
        ) : null}
      </dl>

      <div className="flex flex-col gap-1.5 rounded-lg bg-sunken px-4 py-3.5">
        <ul className="flex flex-col gap-1">
          {rows.map((row, i) => (
            <motion.li
              key={row.label}
              className="flex items-baseline justify-between gap-4"
              initial={false}
              animate={{ opacity: i < shown ? 1 : 0.28, x: i < shown ? 0 : -4 }}
              transition={{ duration: 0.25, ease: EASE_OUT }}
            >
              <span className="type-small text-fg-muted">{row.label}</span>
              <span className="type-small font-semibold tabular-nums text-fg">+{formatScore(row.value)}</span>
            </motion.li>
          ))}
        </ul>
        <div className="mt-1 flex items-baseline justify-between gap-4 border-t border-line pt-2.5">
          <span className="type-body font-semibold text-fg">Score</span>
          <span className="type-title-2 tabular-nums text-game">
            <NumberFlow value={total} />
          </span>
        </div>
      </div>

      {face ? <MouthPrompt session={session} label={last ? "Open your mouth to see your results" : "Open your mouth to go on"} /> : null}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <Button variant="game" size="lg" arrow autoFocus onClick={() => session.act({ type: "next" })}>
          {last ? "See my results" : `Go to level ${r.levelIndex + 2}`}
        </Button>
        <KeyHints items={[{ keys: ["Space"], label: "Continue" }]} className="hidden lg:flex" />
      </div>
    </WorldPanel>
  );
}
