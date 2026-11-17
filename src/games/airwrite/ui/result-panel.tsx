"use client";

import { motion } from "motion/react";
import { Check, CircleAlert, CircleHelp, EyeOff, LoaderCircle, PenLine, RotateCcw, RotateCw, Type, X } from "lucide-react";
import { Fragment, useEffect, useRef, type ReactNode, type RefObject } from "react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Progress } from "@/components/ui/progress";
import { MachineLabel } from "@/components/ui/surface";
import type { InkImage } from "../engine/exportImage";
import type { StrokeXY } from "../engine/recognition/pdollar";
import { normaliseWord } from "../engine/words";
import { AirWriteHowItWorks, type ReadingStory } from "./how-it-works";
import { InkFigure } from "./ink-figure";
import { cn } from "@/lib/cn";

/** One press of Read my writing. Kept with every phase so Try again can read it again. */
export interface ReadRequest {
  id: number;
  ink: InkImage;
  /** The strokes in surface pixels, exactly as given to the recogniser. */
  strokes: StrokeXY[];
  /** The word the visitor chose to write, if any. Only used to say whether it matched. */
  target: string | null;
  /** Whether a fingertip in the air wrote any of the ink (otherwise mouse or touch). */
  usedCamera: boolean;
  /** Hand-model frames per second at the time, when the camera was on. */
  fps: number | null;
}

export type ReadPhase =
  | ({ kind: "reading" } & ReadRequest)
  | ({
      kind: "result";
      story: ReadingStory;
      /** The visitor's first result: the HowItWorks reveal sits under it. */
      first: boolean;
    } & ReadRequest)
  | ({ kind: "error" } & ReadRequest);

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

/** Below this, the answer is shown as a best guess. */
const SURE = 0.6;

const pct = (value: number) => Math.round(value * 100);

/** Big for a word, smaller for a sentence, so nothing is ever clipped. */
function sizeFor(text: string): string {
  const longest = Math.max(...text.split(" ").map((w) => [...w].length));
  if (longest <= 8 && text.length <= 14) return "type-display-1";
  if (longest <= 13 && text.length <= 28) return "type-display-2";
  return "type-title-1 [overflow-wrap:anywhere]";
}

/** Letter-by-letter reveal: under 600 ms in total, blur no more than 4px. */
function Reveal({ text, className }: { text: string; className?: string }) {
  const words = text.split(" ").map((word) => [...word]);
  const count = words.reduce((n, chars) => n + chars.length, 0);
  const step = Math.min(0.04, 0.3 / Math.max(1, count));
  // Index of each word's first letter across the whole text, for the stagger.
  const starts = words.map((_, w) => words.slice(0, w).reduce((n, chars) => n + chars.length, 0));
  return (
    <h2 aria-label={text} className={cn("text-fg", sizeFor(text), className)}>
      {words.map((chars, w) => (
        <Fragment key={w}>
          <span aria-hidden className={cn("inline-block", chars.length <= 13 && "whitespace-nowrap")}>
            {chars.map((char, c) => (
              <motion.span
                key={c}
                className="inline-block"
                initial={{ opacity: 0, y: "0.25em", filter: "blur(4px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                transition={{ duration: 0.28, ease: EASE_OUT, delay: (starts[w] + c) * step }}
              >
                {char}
              </motion.span>
            ))}
          </span>
          {w < words.length - 1 ? " " : null}
        </Fragment>
      ))}
    </h2>
  );
}

function KindChip({ story }: { story: ReadingStory }) {
  if (story.hidden) return <Chip icon={<EyeOff />}>Hidden</Chip>;
  if (story.result.kind === "unreadable") return <Chip icon={<CircleHelp />}>Couldn&apos;t read it</Chip>;
  return (
    <Chip tone="game" icon={<Type />}>
      Text
    </Chip>
  );
}

function Actions({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-3 pt-2">{children}</div>;
}

function ResultBody({
  phase,
  primaryRef,
  onTryAgain,
  onKeepWriting,
}: {
  phase: Extract<ReadPhase, { kind: "result" }>;
  primaryRef: RefObject<HTMLButtonElement | null>;
  onTryAgain: () => void;
  onKeepWriting: () => void;
}) {
  const { story, target } = phase;
  const { result } = story;
  const readable = !story.hidden && result.kind === "text";
  const matched = target && readable ? normaliseWord(result.text) === normaliseWord(target) : null;

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <KindChip story={story} />
        {matched === true ? (
          <Chip tone="success" icon={<Check strokeWidth={2.5} />}>
            Matches {target}
          </Chip>
        ) : matched === false ? (
          <Chip icon={<X />}>Doesn&apos;t match {target}</Chip>
        ) : null}
      </div>

      {readable ? (
        <>
          <Reveal key={phase.id} text={result.text} />
          <div className="flex max-w-[22rem] flex-col gap-2.5">
            <span className="type-title-3 tabular-nums text-fg">{pct(result.confidence)}% sure</span>
            <Progress value={result.confidence} label="How sure the computer is" tone="game" />
          </div>
          {result.confidence < SURE ? (
            <p className="type-body max-w-[30rem] text-fg-muted">A best guess. Clear capitals, with a pinch between letters, read best.</p>
          ) : null}
          {result.alternatives.length ? (
            <p className="type-body-lg text-fg-muted">
              Or maybe:{" "}
              {result.alternatives.map((alt, i) => (
                <Fragment key={alt}>
                  {i > 0 ? ", " : null}
                  <span className="font-semibold text-fg">{alt}</span>
                </Fragment>
              ))}
            </p>
          ) : null}
        </>
      ) : story.hidden ? (
        <div className="flex flex-col gap-3">
          <h2 className="type-display-2 text-fg">Try another word</h2>
          <p className="type-body-lg max-w-[30rem] text-fg-muted">This screen is for everyone, so some words stay hidden.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <h2 className="type-display-2 text-fg">Couldn&apos;t read that</h2>
          <p className="type-body-lg max-w-[30rem] text-fg-muted">Write one big capital at a time, and pinch between letters.</p>
        </div>
      )}

      <Actions>
        <Button ref={primaryRef} variant="game" size="lg" icon={<RotateCcw />} onClick={onTryAgain}>
          Try again
        </Button>
        <Button variant="secondary" size="lg" icon={<PenLine />} onClick={onKeepWriting}>
          Keep writing
        </Button>
      </Actions>
      <MachineLabel className="tabular-nums">Read on this device · {Math.max(1, Math.round(result.ms))} ms</MachineLabel>
    </div>
  );
}

/** The short pause before the answer. Reading itself takes milliseconds; this lets the moment register. */
function ReadingBody() {
  return (
    <div className="flex flex-col gap-5">
      <LoaderCircle aria-hidden className="size-8 animate-spin text-game" />
      <h2 className="type-display-2 text-fg">Reading your writing</h2>
      <p className="type-body-lg max-w-[30rem] text-fg-muted">Splitting it into letters and matching each one, on this device.</p>
    </div>
  );
}

function ErrorBody({
  primaryRef,
  onRetry,
  onKeepWriting,
}: {
  primaryRef: RefObject<HTMLButtonElement | null>;
  onRetry: () => void;
  onKeepWriting: () => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <span className="grid size-14 place-items-center rounded-full bg-game-soft text-game [&_svg]:size-6">
        <CircleAlert aria-hidden />
      </span>
      <h2 className="type-display-2 text-fg">Couldn&apos;t finish reading</h2>
      <p className="type-body-lg max-w-[30rem] text-fg-muted">Try again. If it happens again, clear and write it once more.</p>
      <Actions>
        <Button ref={primaryRef} variant="game" size="lg" icon={<RotateCw />} onClick={onRetry}>
          Try again
        </Button>
        <Button variant="secondary" size="lg" icon={<PenLine />} onClick={onKeepWriting}>
          Keep writing
        </Button>
      </Actions>
    </div>
  );
}

/**
 * Covers the writing area while it reads, then shows what it read next to
 * what it saw. The header stays above it, so Next player and How it works are always there.
 */
export function ResultPanel({
  phase,
  onTryAgain,
  onKeepWriting,
  onRetry,
  className,
}: {
  phase: ReadPhase;
  onTryAgain: () => void;
  onKeepWriting: () => void;
  onRetry: () => void;
  className?: string;
}) {
  const panelRef = useRef<HTMLElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);

  // Keyboard focus follows the panel: onto it while reading, onto the main action once there's an answer.
  useEffect(() => {
    if (phase.kind === "reading") panelRef.current?.focus({ preventScroll: true });
    else primaryRef.current?.focus({ preventScroll: true });
  }, [phase.kind, phase.id]);

  const boxes = phase.kind === "result" ? (phase.story.hidden ? phase.story.boxes.map((b) => ({ ...b, char: null })) : phase.story.boxes) : [];

  return (
    <motion.section
      ref={panelRef}
      tabIndex={-1}
      aria-label="Your result"
      aria-busy={phase.kind === "reading"}
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE_OUT } }}
      exit={{ opacity: 0, y: 12, transition: { duration: 0.35, ease: EASE_OUT } }}
      className={cn(
        "overflow-y-auto overscroll-contain bg-canvas pt-[calc(4rem+env(safe-area-inset-top))] focus-visible:outline-none",
        className,
      )}
    >
      <div className="mx-auto flex w-full max-w-[69rem] flex-col gap-12 px-4 pb-[calc(2.5rem+env(safe-area-inset-bottom))] pt-4 sm:px-6 lg:px-8 lg:pt-8">
        <div className="grid items-center gap-6 rounded-xl bg-surface p-5 shadow-ring sm:p-8 md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] md:gap-10">
          {/* Phones: the answer first, the picture under it. Wider: picture left, answer right. */}
          <figure className="order-2 flex min-w-0 flex-col gap-3 md:order-1">
            <figcaption className="type-label text-fg-subtle">What the computer saw</figcaption>
            <InkFigure ink={phase.ink} boxes={boxes} />
          </figure>

          {/* The live region stays mounted; only its content swaps (150 ms), so every change is announced. */}
          <div aria-live="polite" className="order-1 min-w-0 md:order-2">
            <motion.div key={`${phase.kind}-${phase.id}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15 }}>
              {phase.kind === "reading" ? (
                <ReadingBody />
              ) : phase.kind === "error" ? (
                <ErrorBody primaryRef={primaryRef} onRetry={onRetry} onKeepWriting={onKeepWriting} />
              ) : (
                <ResultBody phase={phase} primaryRef={primaryRef} onTryAgain={onTryAgain} onKeepWriting={onKeepWriting} />
              )}
            </motion.div>
          </div>
        </div>

        {phase.kind === "result" && phase.first ? (
          <AirWriteHowItWorks story={phase.story} fps={phase.fps} usedCamera={phase.usedCamera} />
        ) : null}
      </div>
    </motion.section>
  );
}
