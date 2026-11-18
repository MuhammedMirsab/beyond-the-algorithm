"use client";

import { AnimatePresence, motion } from "motion/react";
import { ZoomIn } from "lucide-react";
import { useEffect, useEffectEvent, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from "react";
import { Button } from "@/components/ui/button";
import { KeyHints } from "@/components/ui/key-hints";
import { useIdle } from "@/lib/idle";
import type { SoundSynthesizer } from "../engine/audio";
import { freeCorner, type ClueSpot } from "../engine/clues";
import { pairAspect, photoOn } from "../engine/pairs";
import { warmUp } from "../engine/preload";
import { ROUND_MS } from "../engine/scoring";
import { secondsTaken } from "../engine/timer";
import type { ActiveQuestion, PlayerAnswer, Side } from "../engine/types";
import { CluePins, pinSpots } from "./clue-pins";
import type { Clock } from "./countdown";
import { EASE_OUT, formatSeconds, LEVEL_CHANGE, LEVEL_NAME, OUTCOME, outcomeOf, SPRING_POP, TONE_WELL, type Outcome } from "./labels";
import { preloadOriginal, useFinePointer, useLoupe } from "./loupe";
import { PhotoSlot, type LoadStatus } from "./photo-slot";
import { PhotoViewer } from "./photo-viewer";
import { cn } from "@/lib/cn";

/** If a photo is still loading after this long, start the clock anyway so the booth never sticks. */
const LOAD_GRACE_MS = 8000;

/** The clock waits for the round's entrance (and the timer bar refilling) before it starts. */
const ENTER_MS = 450;

/**
 * Next ignores presses this soon after the reveal. Focus moves to Next on
 * reveal, and a held Enter key auto-repeats into a click on it, which would
 * skip the result before anyone saw it.
 */
const NEXT_LOCK_MS = 500;

interface Reveal {
  pick: Side | null;
  correct: boolean;
  seconds: number;
}

interface ViewerState {
  open: boolean;
  side: Side;
  focus: ClueSpot | null;
}

function sideForKey(key: string): Side | null {
  const k = key.length === 1 ? key.toLowerCase() : key;
  if (k === "a" || k === "1" || k === "ArrowLeft") return "A";
  if (k === "b" || k === "2" || k === "ArrowRight") return "B";
  return null;
}

/** Enter and Space on a focused control already click it; the global shortcut stays out of the way. */
export function isControl(target: EventTarget | null): boolean {
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

/**
 * One round: two photos, one question, a clock. Mounted fresh for every
 * round; it enters from the right and leaves to the left, while the HUD
 * above it (owned by the play screen) stays put and reads this round's clock.
 */
export function RoundScreen({
  question,
  index,
  nextQuestion,
  isLast,
  sound,
  onAnswer,
  onNext,
  onIdle,
  onClock,
  onShow,
}: {
  question: ActiveQuestion;
  index: number;
  nextQuestion: ActiveQuestion | null;
  isLast: boolean;
  sound: SoundSynthesizer;
  onAnswer: (answer: PlayerAnswer) => void;
  onNext: () => void;
  onIdle: () => void;
  /** The clock for the HUD: waiting, running from a timestamp, or stopped. */
  onClock: (clock: Clock) => void;
  /** This round is on screen (its photo shape sizes the play area). */
  onShow: (aspect: number) => void;
}) {
  const aspect = pairAspect(question.pair);
  const subject = question.pair.subject;
  const clues = question.pair.aiItem.clues;
  const aiSide = question.correctOptionKey;
  const spots = useMemo(() => pinSpots(question.pair, aspect), [question.pair, aspect]);

  const lensOn = useFinePointer();
  const loupe = useLoupe();

  const [status, setStatus] = useState<Record<Side, LoadStatus>>({ A: "loading", B: "loading" });
  const [clock, setClock] = useState<Clock>({ state: "waiting" });
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [viewer, setViewer] = useState<ViewerState>({ open: false, side: "A", focus: null });
  // The closer look is on screen, including its flight back into the round.
  const [viewerUp, setViewerUp] = useState(false);
  // The answer is showing. If it came in while the closer look was open, it waits until that has flown back; after that it stays.
  const [shown, setShown] = useState(false);
  const [activeClue, setActiveClue] = useState<number | null>(null);

  const outcome: Outcome | null = shown && reveal ? outcomeOf({ selectedOptionKey: reveal.pick, isCorrect: reveal.correct }) : null;
  const running = clock.state === "running";

  // What has to be true before the clock starts, and the clock's own bookkeeping.
  const gate = useRef({ A: false, B: false, entered: false, grace: false, started: false });
  const timers = useRef({ deadline: 0 });
  const startRef = useRef<number | null>(null);
  // Set synchronously by the first answer, so a timeout and a click in the same instant can't both count.
  const answeredRef = useRef(false);
  const revealedAtRef = useRef(0);
  const viewerUpRef = useRef(false);
  const slots = useRef<Record<Side, HTMLDivElement | null>>({ A: null, B: null });
  const nextInlineRef = useRef<HTMLButtonElement>(null);
  const nextStickyRef = useRef<HTMLButtonElement>(null);

  function commit(pick: Side | null) {
    if (answeredRef.current || startRef.current === null) return;
    answeredRef.current = true;
    window.clearTimeout(timers.current.deadline);
    const now = performance.now();
    revealedAtRef.current = now;
    // Real elapsed time at this moment, not a value from an older render (the old keyboard bug recorded 1 s).
    const elapsedMs = pick === null ? ROUND_MS : Math.min(ROUND_MS, now - startRef.current);
    const correct = pick === question.correctOptionKey;
    const seconds = secondsTaken(elapsedMs);
    setClock({ state: "stopped", remainingMs: ROUND_MS - elapsedMs });
    setReveal({ pick, correct, seconds });
    if (!viewerUpRef.current) setShown(true);
    setViewer((v) => ({ ...v, open: false }));
    loupe.hide();
    onAnswer({
      questionIndex: index,
      pairId: question.pair.id,
      selectedOptionKey: pick,
      correctOptionKey: question.correctOptionKey,
      isCorrect: correct,
      timeTakenSeconds: seconds,
    });
    if (correct) sound.playCorrect();
    else sound.playIncorrect();
  }

  /** Starts the clock once both photos are on screen and the round has settled in. */
  function tryStart() {
    const g = gate.current;
    if (g.started || answeredRef.current || !g.entered || !((g.A && g.B) || g.grace)) return;
    g.started = true;
    const startedAt = performance.now();
    startRef.current = startedAt;
    setClock({ state: "running", startedAt });
    timers.current.deadline = window.setTimeout(() => commit(null), ROUND_MS);
  }

  const settle = (side: Side, result: Exclude<LoadStatus, "loading">) => {
    setStatus((prev) => (prev[side] === "loading" ? { ...prev, [side]: result } : prev));
    gate.current[side] = true;
    tryStart();
  };

  const choose = (side: Side) => {
    if (!running || reveal || viewer.open) return;
    commit(side);
  };

  const next = () => {
    if (!reveal || performance.now() - revealedAtRef.current < NEXT_LOCK_MS) return;
    sound.playWhoosh();
    onNext();
  };

  const openViewer = (side: Side, focus: ClueSpot | null = null) => {
    if (!reveal) sound.playSelect();
    loupe.hide();
    viewerUpRef.current = true;
    setViewer({ open: true, side, focus });
    setViewerUp(true);
  };

  const viewerClosed = () => {
    viewerUpRef.current = false;
    setViewerUp(false);
    if (answeredRef.current) setShown(true);
  };

  // The round's own timers: settling in, the loading grace, and the deadline.
  const openGate = useEffectEvent((key: "entered" | "grace") => {
    gate.current[key] = true;
    tryStart();
  });
  useEffect(() => {
    const t = timers.current;
    const enter = window.setTimeout(() => openGate("entered"), ENTER_MS);
    const grace = window.setTimeout(() => openGate("grace"), LOAD_GRACE_MS);
    return () => {
      window.clearTimeout(enter);
      window.clearTimeout(grace);
      window.clearTimeout(t.deadline);
    };
  }, []);

  // Tell the play screen this round is up, and how its clock stands.
  useLayoutEffect(() => onShow(aspect), [aspect, onShow]);
  useEffect(() => onClock(clock), [clock, onClock]);

  // Keyboard: A / 1 / Left and B / 2 / Right answer; Enter or Space goes on after the reveal.
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    // The closer look takes its own keys, and answering waits until it closes.
    if (viewerUp) return;
    if (!reveal) {
      if (!gate.current.started || e.repeat) return;
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

  // Once the answer shows, focus Next so Enter and Space work from anywhere.
  useEffect(() => {
    if (!shown) return;
    visibleOf(nextInlineRef, nextStickyRef)?.focus({ preventScroll: true });
  }, [shown]);

  // Warm the next round's photos once this round's are showing, and this round's originals for the lens.
  useEffect(() => {
    if (!running) return;
    if (lensOn) {
      preloadOriginal(question.optionA.src);
      preloadOriginal(question.optionB.src);
    }
    if (!nextQuestion) return;
    return warmUp([nextQuestion.optionA.src, nextQuestion.optionB.src]);
  }, [running, lensOn, nextQuestion, question]);

  // A finished round left alone (the visitor walked off) resets for the next one.
  useIdle(onIdle, { enabled: reveal !== null });

  const announcement = outcome
    ? `${OUTCOME[outcome].title}. Photo ${aiSide} was made by AI.`
    : running
      ? `Round ${index + 1} of ${question.totalQuestions}. Which photo did AI make?`
      : "";

  const nextLabel = isLast ? "See results" : "Next round";
  const level = question.pair.difficulty;

  return (
    <motion.section
      aria-label={`Round ${index + 1} of ${question.totalQuestions}`}
      initial={{ opacity: 0, x: 32 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -32, transition: { duration: 0.18, ease: EASE_OUT } }}
      transition={{ duration: 0.38, ease: EASE_OUT }}
      className="flex flex-col gap-4"
      style={{ "--ratio": aspect } as CSSProperties}
    >
      <div className="flex min-h-16 items-center">
        <AnimatePresence mode="wait" initial={false}>
          {outcome && reveal ? (
            <ResultLine key="result" outcome={outcome} aiSide={aiSide} reveal={reveal} />
          ) : (
            <motion.div key="question" exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="flex min-w-0 flex-col gap-1">
              <h1 className="type-title-2 text-fg lg:type-title-1">Which photo did AI make?</h1>
              <p className="type-small text-fg-subtle">
                <span className="font-semibold text-game">{LEVEL_NAME[level]}:</span> {LEVEL_CHANGE[level]}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="grid grid-cols-1 gap-[var(--gap)] md:grid-cols-2">
        {(["A", "B"] as const).map((side) => {
          const photo = photoOn(question, side);
          return (
            <PhotoSlot
              key={side}
              side={side}
              photo={photo}
              subject={subject}
              status={status[side]}
              revealed={shown}
              picked={reveal?.pick === side}
              pickCorrect={reveal?.correct ?? false}
              canChoose={running && reveal === null}
              lens={lensOn}
              loupe={loupe}
              pickCorner={photo.isReal ? "left" : freeCorner(spots)}
              slotRef={(el) => {
                slots.current[side] = el;
              }}
              pins={
                spots ? (
                  <CluePins
                    spots={spots}
                    clues={clues}
                    active={activeClue}
                    onActive={setActiveClue}
                    onOpen={(i) => openViewer(aiSide, spots[i])}
                    delay={0.55}
                  />
                ) : null
              }
              onChoose={choose}
              onZoom={(s) => openViewer(s)}
              onSettle={settle}
            />
          );
        })}
      </div>

      {shown ? (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: EASE_OUT, delay: 0.3 }}
          className="flex flex-col gap-4 pt-1 lg:flex-row lg:items-end lg:gap-8"
        >
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <h2 className="type-title-3 text-fg">What gives it away</h2>
            <ol className="grid gap-2 md:grid-cols-3 md:gap-4">
              {clues.map((clue, i) => (
                <li key={clue} className="min-w-0">
                  <ClueRow
                    index={i}
                    text={clue}
                    active={activeClue === i}
                    onActive={setActiveClue}
                    onOpen={spots ? () => openViewer(aiSide, spots[i]) : undefined}
                  />
                </li>
              ))}
            </ol>
          </div>
          <div className="hidden shrink-0 flex-col items-end gap-2.5 md:flex">
            <Button ref={nextInlineRef} variant="game" size="lg" arrow onClick={next}>
              {nextLabel}
            </Button>
            <KeyHints className="hidden pointer-fine:flex" items={[{ keys: ["Enter"], label: nextLabel }]} />
          </div>
        </motion.div>
      ) : (
        <div className="flex min-h-8 flex-wrap items-center gap-x-8 gap-y-2">
          <p className="type-small text-fg-subtle">
            {lensOn ? "Move over a photo to magnify it. Click the one AI made." : "Tap the photo AI made. The magnifier gives you a closer look."}
          </p>
          <KeyHints
            className="hidden pointer-fine:flex"
            items={[
              { keys: ["A"], label: "Pick photo A" },
              { keys: ["B"], label: "Pick photo B" },
            ]}
          />
        </div>
      )}

      {shown ? (
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
        focus={viewer.focus}
        question={question}
        aspect={aspect}
        revealed={reveal !== null}
        clock={clock}
        pins={spots}
        originOf={(s) => slots.current[s]}
        onSideChange={(s) => setViewer((v) => ({ ...v, side: s, focus: null }))}
        onPick={
          reveal === null && running
            ? (s) => {
                commit(s);
              }
            : undefined
        }
        onClose={() => setViewer((v) => ({ ...v, open: false }))}
        onClosed={viewerClosed}
        finalFocus={() => (answeredRef.current ? (visibleOf(nextInlineRef, nextStickyRef) ?? true) : true)}
      />
    </motion.section>
  );
}

/** One line of "What gives it away", linked to its pin on the photo. */
function ClueRow({
  index,
  text,
  active,
  onActive,
  onOpen,
}: {
  index: number;
  text: string;
  active: boolean;
  onActive: (index: number | null) => void;
  onOpen?: () => void;
}) {
  const number = (
    <span
      aria-hidden
      className={cn(
        "mt-0.5 grid size-7 shrink-0 place-items-center rounded-full font-mono text-[0.75rem] font-semibold tabular-nums transition-[background-color,color,scale] duration-150 ease-out",
        active ? "scale-110 bg-game text-game-ink" : "bg-game-soft text-game",
      )}
    >
      {index + 1}
    </span>
  );
  if (!onOpen) {
    return (
      <div className="flex items-start gap-3">
        {number}
        <p className="type-body min-w-0 text-fg-muted">{text}</p>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onOpen}
      onPointerEnter={() => onActive(index)}
      onPointerLeave={() => onActive(null)}
      onFocus={() => onActive(index)}
      onBlur={() => onActive(null)}
      aria-label={`Clue ${index + 1}: ${text} Look closer.`}
      className={cn(
        "group/clue -m-2 flex w-[calc(100%+1rem)] items-start gap-3 rounded-md p-2 text-left",
        "transition-colors duration-150 ease-out hover:bg-fg/[0.04] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg",
        active && "bg-fg/[0.04]",
      )}
    >
      {number}
      <span className="type-body min-w-0 flex-1 text-fg-muted transition-colors duration-150 group-hover/clue:text-fg">
        {text}
        <ZoomIn aria-hidden className="ml-1.5 inline size-4 -translate-y-px text-fg-subtle transition-colors duration-150 group-hover/clue:text-game" />
      </span>
    </button>
  );
}

function ResultLine({ outcome, aiSide, reveal }: { outcome: Outcome; aiSide: Side; reveal: Reveal }) {
  const meta = OUTCOME[outcome];
  const Icon = meta.icon;
  const detail =
    outcome === "found"
      ? `Photo ${aiSide} was made by AI. You spotted it in ${formatSeconds(reveal.seconds)}.`
      : outcome === "fooled" && reveal.pick
        ? `Photo ${aiSide} was made by AI. You picked ${reveal.pick}.`
        : `Photo ${aiSide} was made by AI.`;
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15 }}
      className="flex min-w-0 items-center gap-3.5"
    >
      <motion.span
        initial={{ scale: 0.4, rotate: outcome === "found" ? -25 : 25 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={SPRING_POP}
        className={cn("grid size-12 shrink-0 place-items-center rounded-full", TONE_WELL[meta.tone])}
      >
        <Icon aria-hidden className="size-6" strokeWidth={2.75} />
      </motion.span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <motion.h1
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: EASE_OUT, delay: 0.05 }}
          className="type-title-2 text-fg lg:type-title-1"
        >
          {meta.title}
        </motion.h1>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.15 }}
          className="type-small text-fg-muted"
        >
          {detail}
        </motion.p>
      </div>
    </motion.div>
  );
}
