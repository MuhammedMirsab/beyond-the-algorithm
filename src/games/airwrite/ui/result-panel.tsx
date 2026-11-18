"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, CircleAlert, CircleHelp, EyeOff, PenLine, RotateCcw, RotateCw, X } from "lucide-react";
import { Fragment, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { FeedbackPrompt } from "@/components/game/feedback-prompt";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { KeyHints } from "@/components/ui/key-hints";
import { MachineLabel } from "@/components/ui/surface";
import type { InkImage } from "../engine/exportImage";
import type { LetterBox } from "../engine/letters";
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
  /** The word the visitor is writing, if any. Only used to say whether it matched. */
  target: string | null;
  /** The visitor picked that word themselves (a suggested word never says "doesn't match"). */
  targetChosen: boolean;
  /** Whether a fingertip in the air wrote any of the ink (otherwise mouse or touch). */
  usedCamera: boolean;
  /** Hand-model frames per second at the time, when the camera was on. */
  fps: number | null;
}

export type ReadPhase =
  | ({
      kind: "reading";
      /** The letters it split the ink into, shown (unlabelled) while it reads. */
      boxes: LetterBox[];
    } & ReadRequest)
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
/** Letters sit in their boxes this long before they fly up into the word. */
const TAGS_MS = 480;

const pct = (value: number) => Math.round(value * 100);

/** Big for a word, smaller for a sentence, so nothing is ever clipped. */
function sizeFor(text: string): string {
  const longest = Math.max(...text.split(" ").map((w) => [...w].length));
  if (longest <= 8 && text.length <= 14) return "type-display-1";
  if (longest <= 13 && text.length <= 28) return "type-display-2";
  return "type-title-1 [overflow-wrap:anywhere]";
}

/**
 * The answer, letter by letter. When every letter came from a box on the
 * ink, each one flies up out of its box into the word (shared layout ids),
 * so you see the reading being assembled; otherwise the letters fade in.
 */
function Reveal({ text, flyIds, landed, className }: { text: string; flyIds: string[] | null; landed: boolean; className?: string }) {
  const words = text.split(" ").map((word) => [...word]);
  const count = words.reduce((n, chars) => n + chars.length, 0);
  const step = Math.min(0.04, 0.3 / Math.max(1, count));
  const starts = words.map((_, w) => words.slice(0, w).reduce((n, chars) => n + chars.length, 0));
  return (
    <h2 aria-label={text} className={cn("text-fg", sizeFor(text), className)}>
      {words.map((chars, w) => (
        <Fragment key={w}>
          <span aria-hidden className={cn("inline-block", chars.length <= 13 && "whitespace-nowrap")}>
            {chars.map((char, c) => {
              const index = starts[w] + c;
              if (flyIds) {
                return landed ? (
                  <motion.span
                    key={`${c}-in`}
                    layoutId={flyIds[index]}
                    className="inline-block"
                    transition={{ type: "spring", duration: 0.55, bounce: 0.22 }}
                  >
                    {char}
                  </motion.span>
                ) : (
                  <span key={`${c}-wait`} className="inline-block opacity-0">
                    {char}
                  </span>
                );
              }
              return (
                <motion.span
                  key={c}
                  className="inline-block"
                  initial={{ opacity: 0, y: "0.25em", filter: "blur(4px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  transition={{ duration: 0.28, ease: EASE_OUT, delay: index * step }}
                >
                  {char}
                </motion.span>
              );
            })}
          </span>
          {w < words.length - 1 ? " " : null}
        </Fragment>
      ))}
    </h2>
  );
}

function Actions({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-3 pt-2">{children}</div>;
}

/** How sure, as a bar that fills once the word has landed. */
function Sureness({ value, show }: { value: number; show: boolean }) {
  return (
    <div className="flex max-w-[22rem] flex-col gap-2.5">
      <motion.span
        className="type-title-3 tabular-nums text-fg"
        initial={false}
        animate={{ opacity: show ? 1 : 0 }}
        transition={{ duration: 0.2, ease: EASE_OUT }}
      >
        {pct(value)}% sure
      </motion.span>
      <span role="progressbar" aria-label="How sure the computer is" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct(value)} className="relative h-1.5 w-full overflow-hidden rounded-full bg-fg/10">
        <motion.span
          className="absolute inset-0 origin-left rounded-full bg-game"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: show ? value : 0 }}
          transition={{ duration: 0.6, ease: EASE_OUT }}
        />
      </span>
    </div>
  );
}

function ResultBody({
  phase,
  primaryRef,
  flyIds,
  landed,
  onTryAgain,
  onKeepWriting,
}: {
  phase: Extract<ReadPhase, { kind: "result" }>;
  primaryRef: RefObject<HTMLButtonElement | null>;
  flyIds: string[] | null;
  landed: boolean;
  onTryAgain: () => void;
  onKeepWriting: () => void;
}) {
  const { story, target, targetChosen } = phase;
  const { result } = story;
  const readable = !story.hidden && result.kind === "text";
  const matched = target && readable ? normaliseWord(result.text) === normaliseWord(target) : null;

  return (
    <div className="flex min-w-0 flex-col gap-5">
      {readable ? (
        <>
          <div className="flex min-h-7 flex-wrap items-center gap-2">
            <AnimatePresence>
              {landed && matched ? (
                <motion.span
                  key="match"
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1, transition: { type: "spring", duration: 0.45, bounce: 0.35, delay: 0.15 } }}
                >
                  <Chip tone="success" icon={<Check strokeWidth={2.5} />}>
                    You wrote {target}
                  </Chip>
                </motion.span>
              ) : null}
              {landed && matched === false && targetChosen ? (
                <motion.span key="miss" initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { duration: 0.2, delay: 0.15 } }}>
                  <Chip icon={<X />}>Not quite {target}</Chip>
                </motion.span>
              ) : null}
            </AnimatePresence>
            {!landed ? <span className="type-label text-fg-subtle">Matching each letter</span> : null}
          </div>
          <Reveal key={phase.id} text={result.text} flyIds={flyIds} landed={landed} />
          <Sureness value={result.confidence} show={landed} />
          <motion.div initial={false} animate={{ opacity: landed ? 1 : 0 }} transition={{ duration: 0.25, ease: EASE_OUT, delay: landed ? 0.25 : 0 }} className="flex flex-col gap-3">
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
          </motion.div>
        </>
      ) : story.hidden ? (
        <div className="flex flex-col gap-3">
          <Chip icon={<EyeOff />} className="self-start">
            Hidden
          </Chip>
          <h2 className="type-display-2 text-fg">Try another word</h2>
          <p className="type-body-lg max-w-[30rem] text-fg-muted">This screen is for everyone, so some words stay hidden.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <Chip icon={<CircleHelp />} className="self-start">
            No match close enough
          </Chip>
          <h2 className="type-display-2 text-fg">Couldn&apos;t read that</h2>
          <p className="type-body-lg max-w-[30rem] text-fg-muted">Write one big capital at a time, and pinch between letters.</p>
        </div>
      )}

      <Actions>
        <Button ref={primaryRef} variant="game" size="lg" icon={<RotateCcw />} onClick={onTryAgain}>
          {readable ? "Write another" : "Try again"}
        </Button>
        <Button variant="secondary" size="lg" icon={<PenLine />} onClick={onKeepWriting}>
          Keep writing
        </Button>
        <KeyHints items={[{ keys: ["Esc"], label: "Keep writing" }]} className="hidden lg:flex" />
      </Actions>
      <MachineLabel className="tabular-nums">Read on this device · {Math.max(1, Math.round(result.ms))} ms</MachineLabel>
    </div>
  );
}

/** The short pause before the answer: the ink is split into letters while you watch. */
function ReadingBody({ letters }: { letters: number }) {
  return (
    <div className="flex flex-col gap-5">
      <span className="type-label text-game">Reading on this device</span>
      <h2 className="type-display-2 text-fg">{letters > 1 ? `${letters} letters found` : letters === 1 ? "1 letter found" : "Reading your writing"}</h2>
      <p className="type-body-lg max-w-[30rem] text-fg-muted">Splitting the ink into letters, then matching each one against shapes it knows.</p>
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
 * what it saw. The reveal is the game's peak: boxes split the ink while it
 * reads, each box gets its letter, the letters fly up into the word, then
 * the sureness bar fills. The header stays above it, so Next player and How
 * it works are always there.
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
  const reduce = useReducedMotion();
  const [landedId, setLandedId] = useState<number | null>(null);
  const landed = phase.kind !== "result" || reduce === true || landedId === phase.id;

  // Keyboard focus follows the panel: onto it while reading, onto the main action once there's an answer.
  useEffect(() => {
    if (phase.kind === "reading") panelRef.current?.focus({ preventScroll: true });
    else primaryRef.current?.focus({ preventScroll: true });
  }, [phase.kind, phase.id]);

  // Letters wait in their boxes for a moment, then fly up into the word.
  useEffect(() => {
    if (phase.kind !== "result" || reduce) return;
    const timer = window.setTimeout(() => setLandedId(phase.id), TAGS_MS);
    return () => window.clearTimeout(timer);
  }, [phase.kind, phase.id, reduce]);

  const result = phase.kind === "result" ? phase.story : null;
  const readable = !!result && !result.hidden && result.result.kind === "text";
  const boxes: LetterBox[] =
    phase.kind === "reading" ? phase.boxes : result ? (result.hidden ? result.boxes.map((b) => ({ ...b, char: null })) : result.boxes) : [];
  // Each letter can fly only when the boxes line up with the reading, letter for letter.
  const letters = readable ? [...result.result.text.replace(/\s+/g, "")] : [];
  const flyIds = readable && boxes.length === letters.length && boxes.every((b) => b.char) ? boxes.map((_, i) => `aw-${phase.id}-${i}`) : null;

  return (
    <motion.section
      ref={panelRef}
      tabIndex={-1}
      aria-label="Your result"
      aria-busy={phase.kind === "reading"}
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE_OUT } }}
      exit={{ opacity: 0, y: 12, transition: { duration: 0.35, ease: EASE_OUT } }}
      className={cn("overflow-y-auto overscroll-contain bg-canvas focus-visible:outline-none", className)}
    >
      {/* Pinned under the floating header, so scrolled content fades out behind it instead of running into its text. */}
      <div aria-hidden className="sticky top-0 z-10 h-[calc(4rem+env(safe-area-inset-top))] bg-canvas shadow-[0_12px_12px_-4px_var(--color-canvas)]" />
      <div className="mx-auto flex w-full max-w-[69rem] flex-col gap-12 px-4 pb-[calc(2.5rem+env(safe-area-inset-bottom))] pt-4 sm:px-6 lg:px-8 lg:pt-8">
        <div className="grid items-center gap-6 rounded-xl bg-surface p-5 shadow-ring sm:p-8 md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] md:gap-10">
          {/* Phones: the answer first, the picture under it. Wider: picture left, answer right. */}
          <figure className="order-2 flex min-w-0 flex-col gap-3 md:order-1">
            <figcaption className="type-label text-fg-subtle">What the computer saw</figcaption>
            <InkFigure ink={phase.ink} boxes={boxes} flyIds={flyIds && !landed ? flyIds : null} reading={phase.kind === "reading"} />
          </figure>

          {/* The live region stays mounted; only its content swaps (150 ms), so every change is announced. */}
          <div aria-live="polite" className="order-1 min-w-0 md:order-2">
            <motion.div key={`${phase.kind}-${phase.id}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15 }}>
              {phase.kind === "reading" ? (
                <ReadingBody letters={phase.boxes.length} />
              ) : phase.kind === "error" ? (
                <ErrorBody primaryRef={primaryRef} onRetry={onRetry} onKeepWriting={onKeepWriting} />
              ) : (
                <ResultBody phase={phase} primaryRef={primaryRef} flyIds={flyIds} landed={landed} onTryAgain={onTryAgain} onKeepWriting={onKeepWriting} />
              )}
            </motion.div>
          </div>
        </div>

        {phase.kind === "result" ? <FeedbackPrompt className="-mt-6 self-start max-sm:w-full" /> : null}

        {phase.kind === "result" && phase.first ? (
          <AirWriteHowItWorks story={phase.story} fps={phase.fps} usedCamera={phase.usedCamera} />
        ) : null}
      </div>
    </motion.section>
  );
}
