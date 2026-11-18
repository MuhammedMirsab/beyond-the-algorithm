"use client";

import { Check, FlaskConical, LoaderCircle, ShieldCheck, TriangleExclamationPoint } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";
import type { Format } from "@number-flow/react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Segmented } from "@/components/ui/controls";
import { Score } from "@/components/ui/score";
import { StatusDot } from "@/components/ui/surface";
import { cn } from "@/lib/cn";
import type { Guess } from "../engine/math";
import { useLink } from "../link/link";
import { useThrottled } from "../sensors/use-device";
import { isProblem, type IssueCopy, type SensorStatus } from "../sensors/status";

export type Source = "live" | "sim";

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

/** Says where the numbers come from. Simulations are always labelled. */
export function SourceBadge({ source, className }: { source: Source; className?: string }) {
  const link = useLink();
  return source === "live" ? (
    <StatusDot tone="success" label={link.following ? "Live from the visitor's phone" : "Live sensor"} className={className} />
  ) : (
    <Chip icon={<FlaskConical />} className={className}>
      Simulated
    </Chip>
  );
}

/** "Real sensor" or "Simulation", when this device can do both. */
export function ModeSwitch({ value, onChange }: { value: Source; onChange: (next: Source) => void }) {
  return (
    <Segmented
      label="Where the readings come from"
      value={value}
      onValueChange={onChange}
      options={[
        { value: "live", label: "Real sensor" },
        { value: "sim", label: "Simulation" },
      ]}
    />
  );
}

export interface ReadoutRow {
  label: string;
  value: string;
}

/** Live values in the machine voice. Not aria-live itself: see LiveSummary. */
export function Readout({ rows }: { rows: ReadoutRow[] }) {
  return (
    <dl className="grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-6 gap-y-3 rounded-lg bg-surface p-5 shadow-ring">
      {rows.map((row) => (
        <div key={row.label} className="contents">
          <dt className="type-label text-fg-subtle">{row.label}</dt>
          <dd className="type-label min-w-0 break-words text-right tabular-nums text-fg">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** One sentence for screen readers, released at a calm rate. */
export function LiveSummary({ text }: { text: string }) {
  const calm = useThrottled(text, 2500);
  return (
    <p aria-live="polite" className="sr-only">
      {calm}
    </p>
  );
}

/**
 * The app's conclusion from the current reading: the inference, live. The
 * label swaps with a short fade so a new guess is noticed without a jolt.
 */
export function GuessCard({
  guess,
  waiting,
  size = "md",
  className,
}: {
  guess: Guess | null;
  waiting: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  // A guess that flickers between two answers would be unreadable: show one at most 3 times a second.
  const shown = useThrottled(guess, 320);
  return (
    <div className={cn("flex flex-col gap-1.5 rounded-lg bg-game-soft", size === "sm" ? "min-h-[5.75rem] p-4" : "min-h-[7.5rem] p-5", className)}>
      <span className="type-label text-game">It thinks</span>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={shown ? shown.label : "waiting"}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0, transition: { duration: 0.18, ease: EASE_OUT } }}
          exit={{ opacity: 0, y: -4, transition: { duration: 0.12, ease: EASE_OUT } }}
          className="flex flex-col gap-1"
        >
          {shown ? (
            <>
              <p className={cn("text-fg", size === "lg" ? "type-title-1" : size === "sm" ? "type-title-3" : "type-title-2")}>{shown.label}</p>
              <p className="type-small text-fg-muted">{shown.because}</p>
            </>
          ) : (
            <p className="type-body text-fg-muted">{waiting}</p>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/* ── Things to try ────────────────────────────────────────────────── */

export interface Task {
  id: string;
  label: string;
  done: boolean;
  /** A button that does it for you (switch to the simulation, play the day). */
  action?: { label: string; onClick: () => void };
}

/**
 * Two or three small things to try, each ticked the moment the sensor sees
 * it. The first one not done yet is the one to do now.
 */
export function Tasks({ tasks, readOnly = false }: { tasks: Task[]; readOnly?: boolean }) {
  const current = tasks.findIndex((t) => !t.done);
  return (
    <ol className="flex flex-col gap-1.5" aria-label="Things to try">
      {tasks.map((task, i) => {
        const now = i === current;
        return (
          <li
            key={task.id}
            aria-current={now ? "step" : undefined}
            className={cn(
              "flex min-h-12 items-center gap-3 rounded-md px-3 py-1.5 transition-[background-color] duration-200 ease-out",
              now ? "bg-game-soft" : "bg-transparent",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "relative grid size-8 shrink-0 place-items-center rounded-full font-mono text-[0.8125rem] font-semibold",
                task.done ? "bg-success/15 text-success" : now ? "bg-game text-game-ink" : "bg-fg/[0.07] text-fg-subtle",
              )}
            >
              {task.done ? (
                <motion.span
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", duration: 0.35, bounce: 0.3 }}
                  className="grid place-items-center"
                >
                  <Check className="size-4" strokeWidth={3} />
                </motion.span>
              ) : (
                i + 1
              )}
            </span>
            <span className={cn("type-body min-w-0 flex-1", task.done ? "text-fg-subtle" : now ? "font-semibold text-fg" : "text-fg-muted")}>
              {task.label}
              <span className="sr-only">{task.done ? ", done" : ""}</span>
            </span>
            {task.action && !task.done && !readOnly ? (
              <Button variant="secondary" size="sm" onClick={task.action.onClick} className="shrink-0">
                {task.action.label}
              </Button>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

/** True from the first time `condition` holds (a task stays ticked). */
export function useLatch(condition: boolean): boolean {
  const [latched, setLatched] = useState(false);
  if (condition && !latched) setLatched(true);
  return latched || condition;
}

/* ── Turning a real sensor on ─────────────────────────────────────── */

/** Everything the layout needs to offer a real sensor: one button, then its problems. */
export interface SensorGate {
  status: SensorStatus;
  startLabel: string;
  startIcon: ReactNode;
  onStart: () => void;
  stopLabel: string;
  onStop: () => void;
  issue: IssueCopy;
  /** Problems offer the simulation instead. */
  onSimulate?: () => void;
  /** What happens to the data, said before it's asked for. */
  privacy: string;
}

/** The sensor isn't on yet: the one button that turns it on (or a problem), with what happens to the data. */
export function gateNeedsStart(gate: SensorGate | null | undefined): gate is SensorGate {
  return gate != null && (gate.status === "idle" || gate.status === "starting");
}

/** Under the start button: the privacy promise, then "choose Allow" while the browser asks. */
export function GateNote({ gate }: { gate: SensorGate }) {
  const waiting = gate.status === "starting";
  return (
    <p className="type-small inline-flex items-start gap-1.5 text-fg-subtle" aria-live="polite">
      {waiting ? (
        <>
          <LoaderCircle aria-hidden className="mt-0.5 size-4 shrink-0 animate-spin" />
          If your browser asks, choose Allow.
        </>
      ) : (
        <>
          <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0" />
          {gate.privacy}
        </>
      )}
    </p>
  );
}

/** What went wrong with the real sensor, and what to do: the simulation, or try again. */
export function GateIssue({ gate }: { gate: SensorGate }) {
  if (!isProblem(gate.status)) return null;
  return (
    <div role="alert" className="flex flex-col gap-4 rounded-lg bg-surface p-5 shadow-ring">
      <div className="flex items-start gap-3">
        <TriangleExclamationPoint aria-hidden className="mt-0.5 size-5 shrink-0 text-warning" />
        <div className="flex min-w-0 flex-col gap-1">
          <p className="type-body font-semibold text-fg">{gate.issue.title}</p>
          <p className="type-small text-fg-muted">{gate.issue.text}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-3">
        {gate.onSimulate ? (
          <Button variant="game" size="lg" onClick={gate.onSimulate}>
            Use the simulation
          </Button>
        ) : null}
        {gate.status !== "insecure" ? (
          <Button variant="secondary" size="lg" onClick={gate.onStart}>
            Try again
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/* ── Inside the phone screen ─────────────────────────────────────── */

/**
 * The app chrome inside the phone: clears the status bar and home indicator
 * when drawn inside PhoneFrame, and works full-bleed on a real phone.
 */
export function StageShell({
  title,
  source,
  children,
  className,
  overlay = false,
}: {
  title: string;
  source: Source;
  children: ReactNode;
  className?: string;
  /** Header floats over full-bleed content (camera). */
  overlay?: boolean;
}) {
  return (
    <div className={cn("@container relative flex size-full flex-col overflow-hidden bg-sunken text-fg", className)}>
      <div
        className={cn(
          "z-10 flex items-center justify-between gap-3 px-5 pb-3 pt-[calc(var(--phone-safe-top,0px)+14px)]",
          overlay && "absolute inset-x-0 top-0 bg-gradient-to-b from-black/75 to-transparent pb-8",
        )}
      >
        <span className="type-label text-fg-muted">{title}</span>
        <span className={cn("type-label", source === "live" ? "text-success" : "text-fg-muted")}>{source === "live" ? "Live" : "Simulated"}</span>
      </div>
      {children}
    </div>
  );
}

/** Space under the content so nothing sits on the home indicator. */
export const STAGE_BOTTOM = "pb-[calc(var(--phone-safe-bottom,0px)+18px)]";

/** Big numbers change at most 4 times a second, so the digits read instead of spinning. */
const SCORE_EVERY_MS = 250;

/** A Doto number sized to the phone screen it sits in (never under 40px). */
export function StageScore({
  value,
  label,
  suffix,
  format,
  size = "lg",
  className,
}: {
  value: number;
  label: string;
  suffix?: string;
  format?: Format;
  size?: "lg" | "md";
  className?: string;
}) {
  const shown = useThrottled(value, SCORE_EVERY_MS);
  return (
    <div
      className={cn(
        size === "lg" ? "[&_.type-score]:text-[clamp(2.75rem,20cqw,5.25rem)]" : "[&_.type-score]:text-[clamp(2.5rem,13cqw,3.75rem)]",
        className,
      )}
    >
      <Score value={shown} label={label} suffix={suffix} format={format} />
    </div>
  );
}

/**
 * The Dynamic Island says when a sensor turns on, then shrinks back after a
 * few seconds, like a real phone's indicator.
 */
export function useIslandNotice(on: boolean, content: ReactNode): ReactNode | undefined {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!on) return;
    const show = window.requestAnimationFrame(() => setOpen(true));
    const hide = window.setTimeout(() => setOpen(false), 2800);
    return () => {
      window.cancelAnimationFrame(show);
      window.clearTimeout(hide);
    };
  }, [on]);
  return on && open ? content : undefined;
}

export function IslandLabel({ tone, children }: { tone: "camera" | "microphone" | "location" | "motion"; children: ReactNode }) {
  const dot = { camera: "bg-success", microphone: "bg-warning", location: "bg-game", motion: "bg-game" }[tone];
  return (
    <span className="flex items-center gap-2 px-4">
      <span aria-hidden className={cn("size-2 rounded-full", dot)} />
      <span className="type-label text-white">{children}</span>
    </span>
  );
}
