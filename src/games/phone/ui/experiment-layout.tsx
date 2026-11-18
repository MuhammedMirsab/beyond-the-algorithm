"use client";

import { ArrowRight, Check, LayoutGrid, Smartphone } from "lucide-react";
import { useEffect, useRef, type HTMLAttributes, type ReactNode } from "react";
import { SensorArt } from "@/components/art/sensor-art";
import { PhoneFrame } from "@/components/game/phone-frame";
import { Button, IconButton } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { KeyHints, type KeyHint } from "@/components/ui/key-hints";
import { StepDots } from "@/components/ui/progress";
import { cn } from "@/lib/cn";
import type { Experiment } from "../data/experiments";
import { clamp, type Guess } from "../engine/math";
import { useLink } from "../link/link";
import { LinkCard } from "../link/link-ui";
import { isProblem } from "../sensors/status";
import { FRAMED_QUERY, useMediaQuery, useThrottled, useViewportHeight, useViewportWidth } from "../sensors/use-device";
import { SensorHow } from "./explainers";
import {
  GateIssue,
  GateNote,
  gateNeedsStart,
  GuessCard,
  LiveSummary,
  Readout,
  SourceBadge,
  Tasks,
  type ReadoutRow,
  type SensorGate,
  type Source,
  type Task,
} from "./parts";

/** Everything an experiment needs from the game around it. */
export interface ExperimentContext {
  experiment: Experiment;
  /** 0-based position in the lab. */
  index: number;
  total: number;
  tested: boolean;
  markTested: () => void;
  /** The live guess and the reading behind it, kept for the summary at the end. */
  report: (guess: string | null, live: boolean, reading: string | null) => void;
  onNext: () => void;
  nextLabel: string;
  /** To the overview of all eight. */
  onBack: () => void;
  /** The booth laptop is showing a linked phone: show what happens, offer no controls. */
  mirrored: boolean;
}

export interface ExperimentProps {
  ctx: ExperimentContext;
}

/** Height of the shell header plus breathing room above and below the phone. */
const CHROME_HEIGHT = 64 + 72;
const PHONE_ASPECT = 2.092;

/** The drawn phone is as big as the window allows, from 250 to 380 px wide. */
function phoneWidthFor(viewportWidth: number, viewportHeight: number) {
  return Math.round(clamp(Math.min((viewportHeight - CHROME_HEIGHT) / PHONE_ASPECT, viewportWidth * 0.34), 250, 380));
}

/**
 * One template for all eight experiments.
 *
 * On a phone: the live picture first, its guess right under it, then the one
 * thing to do now, with the main button pinned within reach of a thumb. The
 * details (readings, what apps work out, how it works) wait below.
 *
 * On the booth laptop: the sensor's screen inside a drawn phone (for motion,
 * a 3D twin that turns with the visitor's phone), with the guess, the things
 * to try and the details beside it.
 */
export function ExperimentLayout({
  ctx,
  live,
  source,
  stage,
  stageLabel,
  island,
  surface,
  backdrop,
  wrapFrame,
  gate,
  modeSwitch,
  controls,
  tasks,
  readout,
  guess,
  guessWaiting,
  numbers,
  extra,
  summary,
  keys,
}: {
  ctx: ExperimentContext;
  /** A real sensor is streaming: lifts the sensor in the art. */
  live: boolean;
  source: Source;
  /** What the phone's screen shows. */
  stage: ReactNode;
  stageLabel: string;
  /** Dynamic Island content while a sensor turns on. */
  island?: ReactNode;
  /** Props for the element around the screen (drag to tilt). */
  surface?: Omit<HTMLAttributes<HTMLDivElement>, "style"> & { "data-tilt-surface"?: string };
  /** The room behind the drawn phone (light experiment). */
  backdrop?: string;
  /** Wraps the drawn phone on the laptop (the motion twin). */
  wrapFrame?: (frame: ReactNode, width: number) => ReactNode;
  /** The real sensor's on switch and its problems. Null in the simulation or when no permission is needed. */
  gate?: SensorGate | null;
  /** "Real sensor" or "Simulation", where both work. */
  modeSwitch?: ReactNode;
  /** Simulation controls and other ways to play. */
  controls?: ReactNode;
  tasks: Task[];
  readout: ReadoutRow[];
  guess: Guess | null;
  /** Shown in place of the guess before there's a reading. */
  guessWaiting: string;
  /** The latest reading as one line, for How it works. */
  numbers: string | null;
  /** Extra material under the inferences (charts, facts). */
  extra?: ReactNode;
  /** One sentence for screen readers, throttled. */
  summary: string;
  /** Keys this experiment adds on the laptop. */
  keys?: KeyHint[];
}) {
  const framed = useMediaQuery(FRAMED_QUERY) === true;
  const vw = useViewportWidth();
  const vh = useViewportHeight();
  const heading = useRef<HTMLHeadingElement>(null);
  const { experiment, mirrored, report } = ctx;
  const link = useLink();

  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [experiment.id]);

  // The latest guess goes into the summary at the end, once the sensor has been tried.
  // Readings change many times a second: the summary takes one every couple of seconds.
  const label = ctx.tested ? (guess?.label ?? null) : null;
  const reading = useThrottled(numbers, 2000);
  useEffect(() => {
    if (label && !mirrored) report(label, source === "live", reading);
  }, [label, source, reading, mirrored, report]);

  const needsStart = !mirrored && gateNeedsStart(gate);
  const problem = !mirrored && gate != null && isProblem(gate.status);
  const primaryIsNext = ctx.tested && !needsStart;

  const tryArea = mirrored ? (
    <div className="flex flex-col gap-4">
      <p className="type-body inline-flex items-start gap-2 text-fg-muted">
        <Smartphone aria-hidden className="mt-1 size-4 shrink-0 text-game" />
        The visitor is doing this on their phone. Everything here follows it.
      </p>
      <Tasks tasks={tasks} readOnly />
    </div>
  ) : (
    <div className="flex flex-col gap-5">
      {problem && gate ? <GateIssue gate={gate} /> : null}
      {needsStart && gate ? (framed ? <FramedStart gate={gate} /> : <GateNote gate={gate} />) : null}
      {!needsStart && !problem ? <Tasks tasks={tasks} /> : null}
      {controls}
      {/* Switching to the simulation, or turning the sensor off, is for later: after the things to try. */}
      {modeSwitch}
      {!needsStart && gate?.status === "live" ? (
        <Button variant="ghost" onClick={gate.onStop} className="-ml-3 self-start">
          {gate.stopLabel}
        </Button>
      ) : null}
    </div>
  );

  const details = (
    <>
      <section aria-labelledby="readings" className="flex flex-col gap-4">
        <h2 id="readings" className="type-title-3 text-fg">
          What it measures
        </h2>
        <Readout rows={readout} />
        {ctx.tested ? <p className="type-body max-w-[40rem] text-fg-muted">{experiment.answer}</p> : null}
        <LiveSummary text={summary} />
      </section>

      <section aria-labelledby="inferences" className="flex flex-col gap-4">
        <h2 id="inferences" className="type-title-3 text-fg">
          What an app can work out
        </h2>
        <ol className="flex flex-col gap-3">
          {experiment.inferences.map((item, i) => (
            <li key={item.title} className="flex items-start gap-4 rounded-lg bg-surface p-4 shadow-ring">
              <span
                aria-hidden
                className="grid size-8 shrink-0 place-items-center rounded-full bg-game-soft font-mono text-[0.8125rem] font-semibold text-game"
              >
                {i + 1}
              </span>
              <span className="flex min-w-0 flex-col gap-0.5 pt-0.5">
                <span className="type-body font-semibold text-fg">{item.title}</span>
                <span className="type-small text-fg-muted">{item.text}</span>
              </span>
            </li>
          ))}
        </ol>
        {extra}
      </section>

      <SensorHow sensor={experiment.id} how={experiment.how} numbers={numbers} guess={guess?.label ?? null} />
    </>
  );

  if (!framed) {
    return (
      <div className="mx-auto flex w-full max-w-[40rem] flex-1 flex-col gap-4 px-4 pt-1 sm:px-6">
        <header className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <span className="type-label tabular-nums text-game">
              Sensor {ctx.index + 1} of {ctx.total}
            </span>
            <StepDots total={ctx.total} current={ctx.index} label="Sensor" />
          </div>
          <div className="flex items-center gap-2">
            <h1 ref={heading} tabIndex={-1} className="type-title-2 min-w-0 text-fg outline-none">
              {experiment.name}
            </h1>
            {ctx.tested ? (
              <Chip tone="success" icon={<Check />} className="shrink-0">
                Tried
              </Chip>
            ) : null}
          </div>
          <p className="type-small text-fg-muted">{experiment.question}</p>
        </header>

        <div
          role="region"
          aria-label={stageLabel}
          {...surface}
          className={cn("relative h-[clamp(17rem,44dvh,32rem)] shrink-0 overflow-hidden rounded-xl bg-black shadow-ring", surface?.className)}
        >
          {stage}
        </div>

        <GuessCard guess={guess} waiting={guessWaiting} size="sm" />
        {tryArea}

        <div className="mt-6 flex flex-col gap-10 pb-8">{details}</div>

        {/* The next step, always within reach of a thumb. */}
        <div className="sticky bottom-0 z-20 -mx-4 mt-auto flex items-center gap-3 bg-linear-to-t from-canvas via-canvas/95 to-canvas/0 px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-6 sm:-mx-6 sm:px-6">
          <IconButton label="All sensors" icon={<LayoutGrid />} size="lg" variant="secondary" onClick={ctx.onBack} />
          {needsStart && gate ? (
            <Button variant="game" size="lg" icon={gate.startIcon} loading={gate.status === "starting"} onClick={gate.onStart} className="min-w-0 flex-1">
              {gate.startLabel}
            </Button>
          ) : (
            <Button
              variant={primaryIsNext ? "game" : "secondary"}
              size="lg"
              arrow={primaryIsNext}
              icon={primaryIsNext ? undefined : <ArrowRight />}
              onClick={ctx.onNext}
              className="min-w-0 flex-1"
            >
              {ctx.nextLabel}
            </Button>
          )}
        </div>
      </div>
    );
  }

  const width = phoneWidthFor(vw, vh);
  const frame = (
    <PhoneFrame width={width} island={island} interactive>
      {stage}
    </PhoneFrame>
  );
  return (
    <div className="mx-auto grid w-full max-w-[1200px] grid-cols-[auto_minmax(0,1fr)] items-start gap-8 px-6 pb-16 pt-4 lg:gap-14 lg:px-8">
      <div
        className="sticky top-4 grid place-items-center rounded-2xl bg-sunken p-6 transition-[background-color] duration-300 ease-out lg:p-8"
        style={backdrop ? { backgroundColor: backdrop } : undefined}
      >
        <div
          role="region"
          aria-label={stageLabel}
          {...(mirrored ? {} : surface)}
          inert={mirrored}
          className={cn("rounded-[3rem]", !mirrored && surface?.className)}
        >
          {wrapFrame ? wrapFrame(frame, width) : frame}
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-8 py-2">
        <header className="@container flex items-center gap-5">
          <div className="hidden size-28 shrink-0 rounded-xl bg-sunken @md:block">
            <SensorArt sensor={experiment.id} active={live} />
          </div>
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-3">
              <span className="type-label tabular-nums text-game">
                Sensor {ctx.index + 1} of {ctx.total}
              </span>
              <StepDots total={ctx.total} current={ctx.index} label="Sensor" />
            </div>
            <h1 ref={heading} tabIndex={-1} className="type-title-1 text-fg outline-none">
              {experiment.name}
            </h1>
            <p className="type-body-lg text-fg-muted">{experiment.question}</p>
          </div>
        </header>

        <GuessCard guess={guess} waiting={guessWaiting} size="lg" />

        <section aria-labelledby="try-it" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="try-it" className="type-title-3 text-fg">
              {mirrored ? "On the visitor's phone" : "Try this"}
            </h2>
            <SourceBadge source={source} />
          </div>
          {tryArea}
        </section>

        {mirrored ? null : (
          <nav aria-label="Experiments" className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-3">
              <Button variant={primaryIsNext ? "game" : "secondary"} size="lg" arrow={primaryIsNext} onClick={ctx.onNext}>
                {ctx.nextLabel}
              </Button>
              <Button variant="ghost" size="lg" icon={<LayoutGrid />} onClick={ctx.onBack}>
                All sensors
              </Button>
            </div>
            <div className="hidden pointer-fine:block">
              <KeyHints
                items={[
                  ...(keys ?? []),
                  { keys: ["N"], label: ctx.nextLabel },
                  { keys: ["Esc"], label: "All sensors" },
                ]}
              />
            </div>
          </nav>
        )}

        <div className="mt-4 flex flex-col gap-10">{details}</div>

        {link.role === "host" && !link.following ? <LinkCard compact className="self-start" /> : null}
      </div>
    </div>
  );
}

/** On the laptop the start button sits with the things to try. */
function FramedStart({ gate }: { gate: SensorGate }) {
  return (
    <div className="flex flex-col gap-3">
      <Button variant="game" size="lg" icon={gate.startIcon} loading={gate.status === "starting"} onClick={gate.onStart} className="self-start">
        {gate.startLabel}
      </Button>
      <GateNote gate={gate} />
    </div>
  );
}
