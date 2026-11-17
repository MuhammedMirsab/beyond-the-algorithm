"use client";

import { FlaskConical, LoaderCircle, ShieldCheck, TriangleExclamationPoint } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import type { Format } from "@number-flow/react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Segmented } from "@/components/ui/controls";
import { Score } from "@/components/ui/score";
import { StatusDot } from "@/components/ui/surface";
import { cn } from "@/lib/cn";
import type { Guess } from "../engine/math";
import { useThrottled } from "../sensors/use-device";
import { isProblem, type IssueCopy, type SensorStatus } from "../sensors/status";

export type Source = "live" | "sim";

/** Says where the numbers come from. Simulations are always labelled. */
export function SourceBadge({ source, className }: { source: Source; className?: string }) {
  return source === "live" ? (
    <StatusDot tone="success" label="Live sensor" className={className} />
  ) : (
    <Chip icon={<FlaskConical />} className={className}>
      Simulated on this device
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

/** The app's conclusion from the current reading: the inference, live. */
export function GuessCard({ guess, waiting }: { guess: Guess | null; waiting: string }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-lg bg-game-soft p-5">
      <span className="type-label text-game">Its guess</span>
      {guess ? (
        <>
          <p className="type-title-2 text-fg">{guess.label}</p>
          <p className="type-small text-fg-muted">{guess.because}</p>
        </>
      ) : (
        <p className="type-body text-fg-muted">{waiting}</p>
      )}
    </div>
  );
}

/**
 * Turning a real sensor on: the reason, one button, the wait for the browser,
 * then a way to stop. Problems say what happened and offer the simulation.
 */
export function LiveControl({
  status,
  startLabel,
  startIcon,
  stopLabel,
  onStart,
  onStop,
  issue,
  onSimulate,
  privacy,
  liveHint,
}: {
  status: SensorStatus;
  startLabel: string;
  startIcon: ReactNode;
  stopLabel: string;
  onStart: () => void;
  onStop: () => void;
  issue: IssueCopy;
  onSimulate: () => void;
  privacy: string;
  /** What to do once it's on. */
  liveHint: ReactNode;
}) {
  if (isProblem(status)) {
    return (
      <div role="alert" className="flex flex-col gap-4 rounded-lg bg-surface p-5 shadow-ring">
        <div className="flex items-start gap-3">
          <TriangleExclamationPoint aria-hidden className="mt-0.5 size-5 shrink-0 text-warning" />
          <div className="flex min-w-0 flex-col gap-1">
            <p className="type-body font-semibold text-fg">{issue.title}</p>
            <p className="type-small text-fg-muted">{issue.text}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button variant="game" size="lg" onClick={onSimulate}>
            Use the simulation
          </Button>
          {status !== "insecure" ? (
            <Button variant="secondary" size="lg" onClick={onStart}>
              Try again
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  if (status === "live") {
    return (
      <div className="flex flex-col gap-4">
        <div className="type-body text-fg-muted">{liveHint}</div>
        <div>
          <Button variant="secondary" size="lg" onClick={onStop}>
            {stopLabel}
          </Button>
        </div>
      </div>
    );
  }

  const waiting = status === "starting";
  return (
    <div className="flex flex-col gap-3">
      <div>
        <Button variant="game" size="lg" icon={startIcon} loading={waiting} onClick={onStart}>
          {startLabel}
        </Button>
      </div>
      <p className="type-small inline-flex items-start gap-1.5 text-fg-subtle" aria-live="polite">
        {waiting ? (
          <>
            <LoaderCircle aria-hidden className="mt-0.5 size-4 shrink-0 animate-spin" />
            If your browser asks, choose Allow.
          </>
        ) : (
          <>
            <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0" />
            {privacy}
          </>
        )}
      </p>
    </div>
  );
}

/** Whether the "Try it" area is showing a filled button right now. */
export function liveControlHasPrimary(status: SensorStatus) {
  return status === "idle" || status === "starting" || isProblem(status);
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
        <span className={cn("type-label", source === "live" ? "text-success" : "text-fg-muted")}>
          {source === "live" ? "Live" : "Simulated"}
        </span>
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

/** Key hints only make sense with a keyboard: hidden on touch screens. */
export function KeyHint({ children }: { children: ReactNode }) {
  return <span className="type-small hidden items-center gap-1.5 text-fg-subtle pointer-fine:inline-flex">{children}</span>;
}
