"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useEffectEvent, useRef, useState, type CSSProperties, type RefObject } from "react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/surface";
import { useIdle } from "@/lib/idle";
import type { SoundSynthesizer } from "../engine/audio";
import { pairAspect, photoOn } from "../engine/pairs";
import { warmUp } from "../engine/preload";
import { ROUND_MS } from "../engine/scoring";
import { secondsTaken, TICK_MS, timerState } from "../engine/timer";
import type { ActiveQuestion, PlayerAnswer, Side } from "../engine/types";
import { OUTCOME, outcomeOf, TONE_WELL, type Outcome } from "./labels";
import { PhotoSlot, type LoadStatus } from "./photo-slot";
import { PhotoViewer } from "./photo-viewer";
import { RoundHud, type ClockMode } from "./round-hud";
import { cn } from "@/lib/cn";

/** If a photo is still loading after this long, start the clock anyway so the booth never sticks. */
const LOAD_GRACE_MS = 8000;

/**
 * Next ignores presses this soon after the reveal. Focus moves to Next on
 * reveal, and a held Enter key auto-repeats into a click on it, which would
 * skip the result before anyone saw it.
 */
const NEXT_LOCK_MS = 500;

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

interface Reveal {
  pick: Side | null;
  correct: boolean;
}

function sideForKey(key: string): Side | null {
  const k = key.length === 1 ? key.toLowerCase() : key;
  if (k === "a" || k === "1" || k === "ArrowLeft") return "A";
  if (k === "b" || k === "2" || k === "ArrowRight") return "B";
  return null;
}

/** Enter and Space on a focused control already click it; the global shortcut stays out of the way. */
function isControl(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest("button, a, input, textarea, select, summary, [role='tab'], [contenteditable='true']") !== null;
}

/** The visible one of a pair of elements (the other is display:none at this width). */
function visibleOf(...refs: RefObject<HTMLElement | null>[]): HTMLElement | null {
  for (const ref of refs) {
    const el = ref.current;
    if (el && el.offsetParent !== null) return el;
  }
  return null;
}

export function RoundScreen({
  question,
  index,
  nextQuestion,
  isLast,
  sound,
  onAnswer,
  onNext,
  onIdle,
}: {
  question: ActiveQuestion;
  index: number;
  nextQuestion: ActiveQuestion | null;
  isLast: boolean;
  sound: SoundSynthesizer;
  onAnswer: (answer: PlayerAnswer) => void;
  onNext: () => void;
  onIdle: () => void;
}) {
  const aspect = pairAspect(question.pair);
  const subject = question.pair.subject;

  const [status, setStatus] = useState<Record<Side, LoadStatus>>({ A: "loading", B: "loading" });
  const [graceOver, setGraceOver] = useState(false);
  const ready = (status.A !== "loading" && status.B !== "loading") || graceOver;
  const [elapsed, setElapsed] = useState(0);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  // `side` outlives `open` so the closing fade keeps showing the photo that was open.
  const [viewer, setViewer] = useState<{ open: boolean; side: Side }>({ open: false, side: "A" });

  const startRef = useRef<number | null>(null);
  // Set synchronously by the first answer, so a timeout and a click in the same instant can't both count.
  const answeredRef = useRef(false);
  const revealedAtRef = useRef(0);
  const nextInlineRef = useRef<HTMLButtonElement>(null);
  const nextStickyRef = useRef<HTMLButtonElement>(null);

  const timer = timerState(elapsed);
  const mode: ClockMode = reveal ? "stopped" : ready ? "running" : "waiting";
  const outcome: Outcome | null = reveal ? outcomeOf({ selectedOptionKey: reveal.pick, isCorrect: reveal.correct }) : null;

  function commit(pick: Side | null) {
    if (answeredRef.current || startRef.current === null) return;
    answeredRef.current = true;
    const now = performance.now();
    revealedAtRef.current = now;
    // Real elapsed time at this moment, not a value from an older render (the old keyboard bug recorded 1 s).
    const elapsedMs = pick === null ? ROUND_MS : Math.min(ROUND_MS, now - startRef.current);
    const correct = pick === question.correctOptionKey;
    setElapsed(elapsedMs);
    setReveal({ pick, correct });
    setViewer((v) => ({ ...v, open: false }));
    onAnswer({
      questionIndex: index,
      pairId: question.pair.id,
      selectedOptionKey: pick,
      correctOptionKey: question.correctOptionKey,
      isCorrect: correct,
      timeTakenSeconds: secondsTaken(elapsedMs),
    });
    if (correct) sound.playCorrect();
    else sound.playIncorrect();
  }

  const choose = (side: Side) => {
    if (!ready || reveal || viewer.open) return;
    commit(side);
  };

  const next = () => {
    if (!reveal || performance.now() - revealedAtRef.current < NEXT_LOCK_MS) return;
    sound.playWhoosh();
    onNext();
  };

  // A photo that never finishes loading must not freeze the booth.
  useEffect(() => {
    if (ready) return;
    const id = window.setTimeout(() => setGraceOver(true), LOAD_GRACE_MS);
    return () => window.clearTimeout(id);
  }, [ready]);

  // The clock starts once both photos are on screen, so slow Wi-Fi doesn't eat anyone's time.
  const timeUp = useEffectEvent(() => commit(null));
  useEffect(() => {
    if (!ready || reveal) return;
    if (startRef.current === null) startRef.current = performance.now();
    const start = startRef.current;
    const id = window.setInterval(() => {
      const now = performance.now() - start;
      if (now >= ROUND_MS) {
        window.clearInterval(id);
        timeUp();
        return;
      }
      setElapsed(now);
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [ready, reveal]);

  // Keyboard: A / 1 / Left and B / 2 / Right answer; Enter or Space goes on after the reveal.
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    // The viewer takes its own keys, and answering is off while it is open.
    if (viewer.open) return;
    if (!reveal) {
      if (!ready || e.repeat) return;
      const side = sideForKey(e.key);
      if (side) {
        e.preventDefault();
        commit(side);
      }
      return;
    }
    if ((e.key === "Enter" || e.key === " ") && !e.repeat && !isControl(e.target)) {
      e.preventDefault();
      next();
    }
  });
  useEffect(() => {
    const listener = (e: KeyboardEvent) => onKey(e);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  // After the reveal, focus Next so Enter and Space work from anywhere.
  useEffect(() => {
    if (!reveal) return;
    visibleOf(nextInlineRef, nextStickyRef)?.focus({ preventScroll: true });
  }, [reveal]);

  // Warm the next round's photos once this round's are showing.
  useEffect(() => {
    if (!ready || !nextQuestion) return;
    return warmUp([nextQuestion.optionA.src, nextQuestion.optionB.src]);
  }, [ready, nextQuestion]);

  // A finished round left alone (the visitor walked off) resets for the next one.
  useIdle(onIdle, { enabled: reveal !== null });

  const announcement = outcome
    ? `${OUTCOME[outcome].title}. Photo ${question.correctOptionKey} was made by AI.`
    : ready
      ? `Round ${index + 1} of ${question.totalQuestions}. Which photo did AI make?`
      : "";

  const nextLabel = isLast ? "See results" : "Next round";

  return (
    <section
      aria-label={`Round ${index + 1} of ${question.totalQuestions}`}
      className={cn(
        "mx-auto flex w-full flex-col gap-4 pb-6 pt-2",
        "[--gutter:1rem] sm:[--gutter:1.5rem] lg:[--gutter:2rem] [--gap:0.75rem] md:[--gap:1rem] lg:[--gap:1.5rem]",
        // Vertical space everything except the photos needs, with the reveal showing, so nothing jumps.
        "[--chrome:30rem] lg:[--chrome:24.5rem] [--photo-h:max(12rem,calc(100dvh_-_var(--chrome)))]",
        "px-[var(--gutter)] md:max-w-[calc(2*var(--photo-h)*var(--ratio)_+_var(--gap)_+_2*var(--gutter))]",
      )}
      style={{ "--ratio": aspect } as CSSProperties}
    >
      <RoundHud index={index} total={question.totalQuestions} difficulty={question.pair.difficulty} timer={timer} mode={mode} />

      <div className="flex min-h-14 items-center">
        <AnimatePresence mode="wait" initial={false}>
          {outcome ? (
            <ResultLine key="result" outcome={outcome} aiSide={question.correctOptionKey} pick={reveal?.pick ?? null} />
          ) : (
            <motion.h1
              key="question"
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="type-title-2 text-fg lg:type-title-1"
            >
              Which photo did AI make?
            </motion.h1>
          )}
        </AnimatePresence>
      </div>

      <div className="grid grid-cols-1 gap-[var(--gap)] md:grid-cols-2">
        {(["A", "B"] as const).map((side) => (
          <PhotoSlot
            key={side}
            side={side}
            photo={photoOn(question, side)}
            subject={subject}
            status={status[side]}
            revealed={reveal !== null}
            picked={reveal?.pick === side}
            pickCorrect={reveal?.correct ?? false}
            canChoose={ready && reveal === null}
            onChoose={choose}
            onZoom={(s) => {
              if (!reveal) sound.playSelect();
              setViewer({ open: true, side: s });
            }}
            onSettle={(s, result) => setStatus((prev) => (prev[s] === "loading" ? { ...prev, [s]: result } : prev))}
          />
        ))}
      </div>

      {reveal ? (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: EASE_OUT }}
          className="flex flex-col gap-4 pt-1 lg:flex-row lg:items-end lg:gap-8"
        >
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <h2 className="type-title-3 text-fg">What gives it away</h2>
            <ol className="grid gap-3 md:grid-cols-3 md:gap-6">
              {question.pair.aiItem.clues.map((clue, i) => (
                <li key={clue} className="flex min-w-0 items-start gap-3">
                  <span
                    aria-hidden
                    className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-game-soft font-mono text-[0.75rem] font-semibold text-game"
                  >
                    {i + 1}
                  </span>
                  <p className="type-body min-w-0 text-fg-muted">{clue}</p>
                </li>
              ))}
            </ol>
          </div>
          <div className="hidden shrink-0 flex-col items-end gap-2 md:flex">
            <Button ref={nextInlineRef} variant="game" size="lg" arrow onClick={next}>
              {nextLabel}
            </Button>
            <span className="type-caption hidden items-center gap-1.5 text-fg-subtle lg:inline-flex">
              or press <Kbd>Enter</Kbd>
            </span>
          </div>
        </motion.div>
      ) : (
        <p className="type-small flex flex-wrap items-center gap-x-1.5 gap-y-1 text-fg-subtle">
          <span className="hidden items-center gap-1.5 lg:inline-flex">
            Press <Kbd>A</Kbd> or <Kbd>B</Kbd>, or click a photo.
          </span>
          <span className="lg:hidden">Tap the photo AI made.</span>
          <span>The magnifier gives you a closer look.</span>
        </p>
      )}

      {reveal ? (
        // On phones Next stays reachable at the bottom while the clues scroll.
        <div className="sticky bottom-0 z-10 -mx-[var(--gutter)] mt-auto border-t border-line bg-canvas px-[var(--gutter)] pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 md:hidden">
          <Button ref={nextStickyRef} variant="game" size="lg" arrow onClick={next} className="w-full">
            {nextLabel}
          </Button>
        </div>
      ) : null}

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <PhotoViewer
        open={viewer.open}
        side={viewer.side}
        question={question}
        aspect={aspect}
        revealed={reveal !== null}
        timer={timer}
        onSideChange={(s) => setViewer({ open: true, side: s })}
        onClose={() => setViewer((v) => ({ ...v, open: false }))}
        finalFocus={() => (answeredRef.current ? (visibleOf(nextInlineRef, nextStickyRef) ?? true) : true)}
      />
    </section>
  );
}

function ResultLine({ outcome, aiSide, pick }: { outcome: Outcome; aiSide: Side; pick: Side | null }) {
  const meta = OUTCOME[outcome];
  const Icon = meta.icon;
  const detail =
    outcome === "fooled" && pick ? `Photo ${aiSide} was made by AI. You picked ${pick}.` : `Photo ${aiSide} was made by AI.`;
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15 }}
      className="flex min-w-0 items-center gap-3"
    >
      <motion.span
        initial={{ scale: 0.6 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", duration: 0.35, bounce: 0.3 }}
        className={cn("grid size-11 shrink-0 place-items-center rounded-full", TONE_WELL[meta.tone])}
      >
        <Icon aria-hidden className="size-6" strokeWidth={2.75} />
      </motion.span>
      <div className="flex min-w-0 flex-col">
        <h1 className="type-title-2 text-fg">{meta.title}</h1>
        <p className="type-small text-fg-muted">{detail}</p>
      </div>
    </motion.div>
  );
}
