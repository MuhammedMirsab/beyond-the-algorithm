"use client";

import { Check, LayoutGrid } from "lucide-react";
import { useEffect, useRef, type CSSProperties, type HTMLAttributes, type ReactNode } from "react";
import { SensorArt } from "@/components/art/sensor-art";
import { PhoneFrame } from "@/components/game/phone-frame";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { cn } from "@/lib/cn";
import type { Experiment } from "../data/experiments";
import { clamp, type Guess } from "../engine/math";
import { useLink } from "../link/link";
import { LinkHandoff } from "../link/link-panel";
import { FRAMED_QUERY, useCapabilities, useMediaQuery, useViewportHeight, useViewportWidth } from "../sensors/use-device";
import { GuessCard, LiveSummary, Readout, SourceBadge, type ReadoutRow, type Source } from "./parts";

/** Everything an experiment needs from the game around it. */
export interface ExperimentContext {
  experiment: Experiment;
  /** 0-based position in the lab. */
  index: number;
  total: number;
  tested: boolean;
  markTested: () => void;
  onNext: () => void;
  nextLabel: string;
  onBack: () => void;
}

export interface ExperimentProps {
  ctx: ExperimentContext;
}

/** Height of the shell header plus breathing room above and below the phone. */
const CHROME_HEIGHT = 64 + 64;
const PHONE_ASPECT = 2.092;

/** The phone is as big as the window allows, from 260 to 380 px wide. */
function phoneWidthFor(viewportWidth: number, viewportHeight: number) {
  return Math.round(clamp(Math.min((viewportHeight - CHROME_HEIGHT) / PHONE_ASPECT, viewportWidth * 0.36), 260, 380));
}

/**
 * One template for all eight experiments. On the booth laptop the sensor's
 * screen sits inside a drawn phone with the controls beside it; on a real
 * phone the screen goes full width and the controls follow underneath.
 */
export function ExperimentLayout({
  ctx,
  live,
  source,
  stage,
  stageLabel,
  island,
  surface,
  frameStyle,
  backdrop,
  tryIt,
  readout,
  guess,
  guessWaiting,
  extra,
  primaryTaken,
  summary,
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
  /** Style for the drawn phone only (the 3D tilt), never the full-width screen. */
  frameStyle?: CSSProperties;
  /** The room behind the phone (light experiment). */
  backdrop?: string;
  tryIt: ReactNode;
  readout: ReadoutRow[];
  guess: Guess | null;
  /** Shown in place of the guess before there's a reading. */
  guessWaiting: string;
  /** Extra material under the inferences (charts, facts). */
  extra?: ReactNode;
  /** The Try it area shows a filled button, so Next stays secondary. */
  primaryTaken: boolean;
  /** One sentence for screen readers, throttled. */
  summary: string;
}) {
  const framed = useMediaQuery(FRAMED_QUERY) === true;
  const caps = useCapabilities();
  const vw = useViewportWidth();
  const vh = useViewportHeight();
  const heading = useRef<HTMLHeadingElement>(null);
  const { experiment } = ctx;
  const link = useLink();
  // The visitor's phone is driving this screen: the laptop's own controls only mirror it.
  const mirrored = link.role === "host" && link.linked;

  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [experiment.id]);

  // Sized by its own width, not the window: the column is narrow on a phone and on a tablet beside the drawn phone.
  const header = (
    <header className="@container">
      <div className="flex items-center gap-5 @lg:gap-6">
        <div className="size-[140px] shrink-0 rounded-xl bg-sunken @lg:size-40">
          <SensorArt sensor={experiment.id} active={live} />
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <span className="type-label text-game">
            Sensor {ctx.index + 1} of {ctx.total}
          </span>
          <h1 ref={heading} tabIndex={-1} className="type-title-2 text-fg outline-none @lg:type-title-1">
            {experiment.name}
          </h1>
          <p className="type-body text-fg-muted @lg:type-body-lg">{experiment.question}</p>
          {ctx.tested ? (
            <Chip tone="success" icon={<Check />} className="self-start">
              Tested
            </Chip>
          ) : null}
        </div>
      </div>
    </header>
  );

  const panel = (
    <>
      <section aria-labelledby="try-it" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="try-it" className="type-title-3 text-fg">
            Try it
          </h2>
          <SourceBadge source={source} />
        </div>
        {mirrored ? (
          <p className="type-body text-fg-muted">
            Controlled from the visitor&apos;s phone. Everything on this screen follows what they do on it.
          </p>
        ) : (
          tryIt
        )}
      </section>

      <section aria-labelledby="readings" className="flex flex-col gap-4">
        <h2 id="readings" className="type-title-3 text-fg">
          What it measures
        </h2>
        <Readout rows={readout} />
        <GuessCard guess={guess} waiting={guessWaiting} />
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

      <nav aria-label="Experiments" className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <Button
          variant={ctx.tested && !primaryTaken ? "game" : "secondary"}
          size="lg"
          arrow={ctx.tested && !primaryTaken}
          onClick={ctx.onNext}
          className="w-full sm:w-auto"
        >
          {ctx.nextLabel}
        </Button>
        <Button variant="ghost" size="lg" icon={<LayoutGrid />} onClick={ctx.onBack} className="w-full sm:w-auto">
          Back to the lab
        </Button>
      </nav>
    </>
  );

  if (!framed) {
    return (
      <div className="mx-auto flex w-full max-w-[40rem] flex-col gap-10 px-4 pb-[calc(env(safe-area-inset-bottom)+40px)] pt-2 sm:px-6">
        {header}
        <div
          role="region"
          aria-label={stageLabel}
          {...surface}
          className={cn(
            "relative h-[min(66dvh,600px)] min-h-[400px] overflow-hidden rounded-xl bg-black shadow-ring",
            surface?.className,
          )}
        >
          {stage}
        </div>
        {panel}
      </div>
    );
  }

  const width = phoneWidthFor(vw, vh);
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
          style={frameStyle}
        >
          <PhoneFrame width={width} island={island}>
            {stage}
          </PhoneFrame>
        </div>
      </div>
      <div className="flex min-w-0 flex-col gap-10 py-2">
        {header}
        {panel}
        {caps.touch ? null : <LinkHandoff size={88} className="self-start" />}
      </div>
    </div>
  );
}
