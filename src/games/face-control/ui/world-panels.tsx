"use client";

import { Camera, Check, Circle, Keyboard, Play, RotateCcw, ScanFace, SlidersHorizontal, Trophy, Users } from "lucide-react";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Stat } from "@/components/ui/score";
import { Kbd } from "@/components/ui/surface";
import { cn } from "@/lib/cn";
import { formatScore, formatTime } from "../engine/format";
import { LEVELS } from "../engine/game/levels";
import { LEVEL_COUNT, type MachineState, type PracticeTask } from "../play/machine";
import type { FaceControlSession } from "../play/session";
import { CameraSlot } from "./camera-slot";
import type { RunValues } from "./hooks";
import { MouthPrompt } from "./meters";

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

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

/** "Press Space" on laptops; hidden on narrow screens where nobody has a keyboard. */
function KeyHint({ keys, action }: { keys: string[]; action: string }) {
  return (
    <span className="type-small hidden items-center gap-1.5 text-fg-subtle lg:inline-flex">
      {keys.map((k, i) => (
        <span key={k} className="inline-flex items-center gap-1.5">
          {i > 0 ? "or" : "Press"} <Kbd>{k}</Kbd>
        </span>
      ))}
      {action}
    </span>
  );
}

const TASKS: { id: PracticeTask; face: string; keys: string; touch: string }[] = [
  { id: "left", face: "Tilt left", keys: "Press ←", touch: "Hold ◀" },
  { id: "right", face: "Tilt right", keys: "Press →", touch: "Hold ▶" },
  { id: "jump", face: "Open your mouth", keys: "Press Space", touch: "Tap jump" },
];

/** Practice: a compact strip with the three moves, ticked off as the visitor does them. */
export function PracticePanel({ session, machine, touch }: { session: FaceControlSession; machine: MachineState; touch: boolean }) {
  const face = machine.mode === "face";
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[calc(4.25rem+env(safe-area-inset-top))] z-20 flex justify-center px-4 sm:px-6">
      <motion.section
        aria-labelledby="practice-title"
        className="pointer-events-auto flex w-full max-w-[46rem] flex-col gap-4 rounded-xl bg-surface p-4 shadow-ring sm:p-5"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0, transition: { duration: 0.3, ease: EASE_OUT } }}
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <h2 id="practice-title" className="type-label text-game">
            Practice
          </h2>
          <ul className="flex flex-wrap gap-2">
            {TASKS.map((task) => {
              const done = machine.practice[task.id];
              return (
                <li key={task.id}>
                  <Chip tone={done ? "game" : "neutral"} icon={done ? <Check strokeWidth={3} /> : <Circle />} className="h-9 px-3.5 text-[0.9375rem]">
                    {face ? task.face : touch ? task.touch : task.keys}
                    <span className="sr-only">{done ? ", done" : ", to do"}</span>
                  </Chip>
                </li>
              );
            })}
          </ul>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p aria-live="polite" className="type-small text-fg-muted">
            {machine.practiceComplete ? "You’re ready. Level 1 starts now." : "Try each move. You can’t lose lives here."}
          </p>
          <Button variant="secondary" size="lg" onClick={() => session.act({ type: "skip-practice" })}>
            Start level 1
          </Button>
        </div>
      </motion.section>
    </div>
  );
}

export function LevelIntroPanel({
  session,
  machine,
  run,
  bestTime,
}: {
  session: FaceControlSession;
  machine: MachineState;
  run: RunValues;
  bestTime: number | undefined;
}) {
  const level = LEVELS[machine.levelIndex];
  const face = machine.mode === "face";
  return (
    <WorldPanel labelledBy="level-title">
      <div className="flex flex-col gap-3">
        <span className="type-label text-game">
          Level {machine.levelIndex + 1} of {LEVEL_COUNT}
        </span>
        <h2 id="level-title" className="type-display-2 text-fg">
          {level.name}
        </h2>
        <p className="type-body-lg text-fg-muted">{level.tagline}</p>
      </div>
      <div className="flex flex-wrap gap-x-10 gap-y-4">
        <Stat value={level.sparks.length} label="Sparks to find" />
        <Stat value={run.lives} label={run.lives === 1 ? "Life" : "Lives"} />
        {bestTime !== undefined ? <Stat value={formatTime(bestTime)} label="Your best time" /> : null}
      </div>
      {face ? <MouthPrompt session={session} label="Open your mouth to start" /> : null}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <Button variant="game" size="lg" arrow autoFocus onClick={() => session.act({ type: "start-level" })}>
          Start level
        </Button>
        <KeyHint keys={["Space"]} action="to start" />
      </div>
    </WorldPanel>
  );
}

export function PausedPanel({ session, machine, run }: { session: FaceControlSession; machine: MachineState; run: RunValues }) {
  const face = machine.mode === "face";
  return (
    <WorldPanel labelledBy="pause-title">
      <div className="flex flex-col gap-3">
        <span className="type-label text-game">
          Level {machine.levelIndex + 1} · {formatTime(run.levelTime)}
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
            Recalibrate
          </Button>
        ) : (
          <Button variant="secondary" size="lg" icon={<Camera />} onClick={() => session.act({ type: "choose-camera" })}>
            Use the camera
          </Button>
        )}
        <Button variant="ghost" size="lg" icon={<SlidersHorizontal />} onClick={session.openSettings}>
          Change settings
        </Button>
        <Button variant="ghost" size="lg" icon={<Users />} onClick={() => session.act({ type: "next-player" })}>
          Next player
        </Button>
      </div>
      <KeyHint keys={["P", "Esc"]} action="to resume" />
    </WorldPanel>
  );
}

/** The face left the camera: the game waits, and carries on by itself when the face is back. */
export function FaceLostPanel({ session }: { session: FaceControlSession }) {
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
      <div className="flex flex-wrap gap-3">
        <Button variant="secondary" size="lg" icon={<Keyboard />} onClick={() => session.act({ type: "choose-keyboard" })}>
          Continue with keyboard
        </Button>
        <Button variant="ghost" size="lg" icon={<ScanFace />} onClick={() => session.act({ type: "recalibrate" })}>
          Recalibrate
        </Button>
      </div>
    </WorldPanel>
  );
}

function ScoreRow({ label, value, total = false }: { label: string; value: string; total?: boolean }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-4", total && "mt-1 border-t border-line pt-2.5")}>
      <dt className={cn(total ? "type-body font-semibold text-fg" : "type-small text-fg-muted")}>{label}</dt>
      <dd className={cn("tabular-nums", total ? "type-title-3 text-fg" : "type-small font-semibold text-fg")}>{value}</dd>
    </div>
  );
}

export function LevelCompletePanel({ session, machine }: { session: FaceControlSession; machine: MachineState }) {
  const outcome = machine.outcome;
  if (!outcome) return null;
  const r = outcome.result;
  const last = r.levelIndex >= LEVEL_COUNT - 1;
  const face = machine.mode === "face";
  const allSparks = r.sparks === r.sparksTotal;
  const noFalls = r.deaths === 0;
  return (
    <WorldPanel labelledBy="done-title">
      <div className="flex flex-col gap-3">
        <span className="type-label text-game">Level {r.levelIndex + 1} complete</span>
        <h2 id="done-title" className="type-display-2 text-fg">
          {last ? "Final level cleared" : "Nicely rolled"}
        </h2>
      </div>
      <div className="flex flex-wrap items-end gap-x-10 gap-y-4">
        <Stat value={formatTime(r.time)} label="Time" />
        <Stat value={`${r.sparks}/${r.sparksTotal}`} label="Sparks" />
        <Stat value={r.deaths} label={r.deaths === 1 ? "Fall" : "Falls"} />
        {outcome.previousBest !== null ? (
          outcome.newBestTime ? (
            <Chip tone="game" icon={<Trophy />} className="mb-1">
              New best time
            </Chip>
          ) : (
            <Stat value={formatTime(outcome.previousBest)} label="Your best time" />
          )
        ) : null}
      </div>
      <dl className="flex flex-col gap-1.5 rounded-lg bg-sunken px-4 py-3.5">
        <ScoreRow label={`Sparks, ${r.sparks} × 100`} value={`+${formatScore(r.sparkScore)}`} />
        <ScoreRow label="Level complete" value={`+${formatScore(r.completionBonus)}`} />
        <ScoreRow label="Time bonus" value={`+${formatScore(r.timeBonus)}`} />
        {allSparks ? <ScoreRow label="Every spark" value="+300" /> : null}
        {noFalls ? <ScoreRow label="No falls" value="+200" /> : null}
        <ScoreRow label="Score so far" value={formatScore(r.total)} total />
      </dl>
      {face ? <MouthPrompt session={session} label="Open your mouth to continue" /> : null}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <Button variant="game" size="lg" arrow autoFocus onClick={() => session.act({ type: "next" })}>
          {last ? "See results" : "Next level"}
        </Button>
        <KeyHint keys={["Space"]} action="to continue" />
      </div>
    </WorldPanel>
  );
}
