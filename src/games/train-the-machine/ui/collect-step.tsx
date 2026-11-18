"use client";

import { AnimatePresence, motion } from "motion/react";
import { Check, CircleCheck, CircleDot, LoaderCircle, Square, TriangleAlert, X } from "lucide-react";
import { useEffect, useRef, useState, type RefObject } from "react";
import { Button, IconButton } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { KeyHints } from "@/components/ui/key-hints";
import { cn } from "@/lib/cn";
import { WINDOW_INTERVAL_MS, WINDOW_SIZE, analyzeTemporalMotion, averageShape, bodyShape, extractFeatureVector } from "../engine/features";
import { captureIssueText, validateCapture, type CaptureIssue } from "../engine/quality";
import type { Sounds } from "../engine/sound";
import type { PerceptionResult } from "../engine/types";
import { CameraStage, Pips, StageBanner, StageCountdown, StageFlash, StagePlate, StageRecording } from "./camera-stage";
import { ExampleThumb, MoveGlyph } from "./figures";
import { liveHint } from "./hints";
import { EXAMPLES_NEEDED, MAX_EXAMPLES, burstSize, snapshot, type Example, type Examples, type Move, type MoveId } from "./model";
import type { PerceptionStatus } from "./use-perception";

type Phase =
  | { kind: "idle" }
  | { kind: "countdown"; value: number }
  /** Taking a run of examples. `clip` is a moving example's progress, null between shots and for still poses. */
  | { kind: "shooting"; taken: number; want: number; clip: number | null };

/** 3, 2, 1: time to step back into position after pressing Space. */
const COUNT_FROM = 3;
const COUNT_MS = 800;
/** Between snapshots of a still pose: time to shift a little, so the examples are not all the same. */
const STILL_GAP_MS = 1000;
/** Between clips of a movement. */
const CLIP_GAP_MS = 400;
/** Rejected examples in a row before a run stops and says why. */
const MAX_MISSES = 3;
/** A rejected example's message, or a "now the other move" note, stays this long. */
const ISSUE_MS = 4500;
const NOTE_MS = 4500;

export interface PerceptionRefs {
  latestRef: RefObject<PerceptionResult | null>;
  windowRef: RefObject<PerceptionResult[]>;
  samplesRef: RefObject<number>;
  status: PerceptionStatus;
}

/** A unique id for a new example (outside the component: it reads the clock). */
const newExampleId = (move: MoveId) => `${move}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const clock = () => performance.now();

interface Run {
  target: MoveId;
  /** Examples the move had when the run started. */
  base: number;
  want: number;
  taken: number;
  misses: number;
  stop: boolean;
}

/**
 * Step 2: show each move 5 times. One press of Record (or Space) counts
 * down, then takes the examples one after another while the visitor stays in
 * position. When a move has its 5, the other move is next.
 */
export function CollectStep({
  moves,
  examples,
  active,
  onSelect,
  onAdd,
  onRemove,
  onTrain,
  stream,
  videoRef,
  canvasRef,
  perception,
  trackerReady,
  sounds,
}: {
  moves: readonly [Move, Move];
  examples: Examples;
  active: MoveId;
  onSelect: (id: MoveId) => void;
  onAdd: (id: MoveId, example: Example) => void;
  onRemove: (id: MoveId, exampleId: string) => void;
  onTrain: () => void;
  stream: MediaStream | null;
  videoRef: RefObject<HTMLVideoElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  perception: PerceptionRefs;
  /** The body and hand models are loaded: frames are being read. */
  trackerReady: boolean;
  sounds: () => Sounds | null;
}) {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [issue, setIssue] = useState<{ issue: CaptureIssue; id: number } | null>(null);
  const [note, setNote] = useState<{ text: string; id: number } | null>(null);
  const [flash, setFlash] = useState(0);
  const [message, setMessage] = useState("");
  const runRef = useRef<Run | null>(null);
  const timersRef = useRef(new Set<ReturnType<typeof setTimeout>>());
  // Timers outlive renders: they read the latest props from here.
  const latest = useRef({ moves, examples, active, onAdd, onSelect, perception, trackerReady });
  useEffect(() => {
    latest.current = { moves, examples, active, onAdd, onSelect, perception, trackerReady };
  });

  const move = moves[0].id === active ? moves[0] : moves[1];
  const count = examples[active].length;
  const ready = moves.every((m) => examples[m.id].length >= EXAMPLES_NEEDED);
  const busy = phase.kind !== "idle";
  const next = burstSize(count);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
      runRef.current = null;
    };
  }, []);

  const later = (fn: () => void, ms: number) => {
    const timer = setTimeout(() => {
      timersRef.current.delete(timer);
      fn();
    }, ms);
    timersRef.current.add(timer);
  };

  const moveById = (id: MoveId) => (latest.current.moves[0].id === id ? latest.current.moves[0] : latest.current.moves[1]);

  const showNote = (text: string) => {
    const id = Date.now();
    setNote({ text, id });
    later(() => setNote((current) => (current?.id === id ? null : current)), NOTE_MS);
  };

  const miss = (problem: CaptureIssue) => {
    sounds()?.miss();
    const id = Date.now();
    setIssue({ issue: problem, id });
    setMessage(captureIssueText(problem));
    later(() => setIssue((current) => (current?.id === id ? null : current)), ISSUE_MS);
  };

  /** The run is over: say what happened and move on to the other move when this one is done. */
  const finish = () => {
    const run = runRef.current;
    runRef.current = null;
    setPhase({ kind: "idle" });
    if (!run || run.taken === 0) return;
    const target = moveById(run.target);
    const other = moveById(run.target === "a" ? "b" : "a");
    const total = run.base + run.taken;
    if (run.base >= EXAMPLES_NEEDED || total < EXAMPLES_NEEDED) return;
    sounds()?.done();
    if (latest.current.examples[other.id].length < EXAMPLES_NEEDED) {
      latest.current.onSelect(other.id);
      showNote(`${target.name} is done. Now show it ${other.name}.`);
      setMessage(`${target.name} is done. Now show it ${other.name}.`);
    } else {
      showNote("Both moves are ready. Train it.");
      setMessage("Both moves are ready. Train it.");
    }
  };

  /** Check one example (a moment, or a recording), turn it into 44 numbers and keep it. */
  const settle = (target: Move, frame: PerceptionResult | null, window: PerceptionResult[], sequence: PerceptionResult[] | null) => {
    const run = runRef.current;
    if (!run) return;
    const problem = validateCapture({ frame, sequence: sequence ?? undefined, traits: target.traits });
    const features = problem ? null : extractFeatureVector(frame, window);
    if (problem || !features || !frame) {
      run.misses += 1;
      miss(problem ?? "no_person");
    } else {
      run.misses = 0;
      run.taken += 1;
      const shot = snapshot(videoRef.current);
      latest.current.onAdd(target.id, {
        id: newExampleId(target.id),
        features,
        motion: analyzeTemporalMotion(window),
        moving: sequence !== null,
        thumbnail: shot?.url ?? null,
        ratio: shot?.ratio ?? 4 / 3,
        keypoints: frame.poseLandmarks,
        shape: sequence ? averageShape(sequence.map(bodyShape)) : bodyShape(frame),
      });
      sounds()?.shutter();
      setFlash((n) => n + 1);
      setIssue(null);
      const total = run.base + run.taken;
      setMessage(total <= EXAMPLES_NEEDED ? `${target.name}: ${total} of ${EXAMPLES_NEEDED}.` : `${target.name}: ${total} examples.`);
    }
    if (run.taken >= run.want || run.misses >= MAX_MISSES || run.stop) {
      finish();
      return;
    }
    setPhase({ kind: "shooting", taken: run.taken, want: run.want, clip: null });
    later(shoot, target.traits.moving ? CLIP_GAP_MS : STILL_GAP_MS);
  };

  const shoot = () => {
    const run = runRef.current;
    if (!run) return;
    if (run.stop) {
      finish();
      return;
    }
    const target = moveById(run.target);
    const { latestRef, windowRef, samplesRef } = latest.current.perception;
    if (!target.traits.moving) {
      settle(target, latestRef.current, [...windowRef.current], null);
      return;
    }
    // A moving example is the next 25 samples of the same window the test uses.
    const start = samplesRef.current;
    const began = clock();
    sounds()?.tick(780);
    setPhase({ kind: "shooting", taken: run.taken, want: run.want, clip: 0 });
    const poll = () => {
      const current = runRef.current;
      if (!current) return;
      const got = Math.min(WINDOW_SIZE, samplesRef.current - start);
      const stalled = clock() - began > WINDOW_SIZE * WINDOW_INTERVAL_MS * 2.5;
      if (got >= WINDOW_SIZE || stalled) {
        const sequence = got > 0 ? windowRef.current.slice(-got) : [];
        const frame = [...sequence].reverse().find((f) => f.hasPerson) ?? null;
        settle(target, frame, sequence, sequence);
        return;
      }
      setPhase({ kind: "shooting", taken: current.taken, want: current.want, clip: got / WINDOW_SIZE });
      later(poll, 50);
    };
    later(poll, 50);
  };

  const countdown = (value: number) => {
    const run = runRef.current;
    if (!run) return;
    if (run.stop) {
      finish();
      return;
    }
    if (value === 0) {
      shoot();
      return;
    }
    setPhase({ kind: "countdown", value });
    sounds()?.tick(value === 1 ? 660 : 520);
    later(() => countdown(value - 1), COUNT_MS);
  };

  /** Record (or Space): start a run, or stop the one in progress. */
  const press = () => {
    const run = runRef.current;
    if (run) {
      run.stop = true;
      setMessage("Stopping.");
      return;
    }
    const { active: id, examples: current, trackerReady: tracking } = latest.current;
    if (!tracking) return;
    const target = moveById(id);
    const base = current[id].length;
    const want = burstSize(base);
    if (want <= 0) return;
    runRef.current = { target: id, base, want, taken: 0, misses: 0, stop: false };
    setIssue(null);
    setNote(null);
    setMessage(`Recording ${want} of ${target.name} in ${COUNT_FROM}.`);
    countdown(COUNT_FROM);
  };

  // Space records (or stops) from anywhere on this screen, except while typing.
  const pressRef = useRef<() => void>(() => {});
  useEffect(() => {
    pressRef.current = press;
  });
  useEffect(() => {
    const isSpace = (e: KeyboardEvent) => e.code === "Space" || e.key === " ";
    const typing = (target: EventTarget | null) =>
      target instanceof HTMLElement && !!target.closest("input, textarea, select, [contenteditable='true']");
    const onKeyDown = (e: KeyboardEvent) => {
      if (!isSpace(e) || e.altKey || e.ctrlKey || e.metaKey || typing(e.target)) return;
      e.preventDefault();
      if (!e.repeat) pressRef.current();
    };
    // Space would also "click" a focused button on key up; it means Record here.
    const onKeyUp = (e: KeyboardEvent) => {
      if (isSpace(e) && !typing(e.target)) e.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  const hint = issue
    ? { icon: <TriangleAlert aria-hidden className="text-warning" />, text: captureIssueText(issue.issue) }
    : note
      ? { icon: <CircleCheck aria-hidden className="text-success" />, text: note.text }
      : trackerReady && !busy
        ? liveHint(perception.status, move)
        : null;

  const plateLine = !trackerReady
    ? "Starting the body tracker"
    : phase.kind === "countdown"
      ? "Get ready"
      : phase.kind === "shooting"
        ? move.traits.moving
          ? "Keep going"
          : "Hold it. Change it a little each time."
        : count < EXAMPLES_NEEDED
          ? `${count} of ${EXAMPLES_NEEDED}`
          : `${count} examples`;
  const recordLabel = count < EXAMPLES_NEEDED ? `Record ${next}` : next > 0 ? `Record ${next} more` : "Record";
  const helper = !trackerReady
    ? "Starting the body tracker. The camera is on."
    : busy
      ? move.traits.moving
        ? "Keep doing the move until the dots fill up."
        : "It takes one snapshot a second. Move a little between them."
      : next === 0
        ? `${MAX_EXAMPLES} examples of ${move.name} is plenty.`
        : ready
          ? "Train it now, or record more examples first."
          : move.traits.moving
            ? `It records ${next} clips of 1.5 seconds in a row.`
            : `It takes ${next} snapshots in a row, one a second.`;

  return (
    <section className="mx-auto grid w-full max-w-[75rem] items-start gap-x-8 gap-y-6 px-4 pb-10 pt-2 sm:px-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:grid-rows-[auto_1fr] lg:px-8">
      <header className="flex min-w-0 flex-col gap-2 lg:col-start-2 lg:row-start-1">
        <span className="type-label text-game">Step 2 of 3 · Show it your moves</span>
        <h1 data-step-focus tabIndex={-1} className="type-display-2 break-words text-fg outline-none">
          {move.name}
        </h1>
        <p className="type-body-lg text-fg-muted">{move.hint}</p>
      </header>

      <div className="min-w-0 lg:col-start-1 lg:row-span-2 lg:row-start-1">
        <CameraStage stream={stream} videoRef={videoRef} canvasRef={canvasRef}>
          <StageFlash id={flash} />
          {phase.kind === "shooting" && phase.clip !== null ? <StageRecording progress={phase.clip} /> : null}
          <StagePlate tone={busy ? "game" : "dark"}>
            <span
              className={cn(
                "grid size-11 shrink-0 place-items-center rounded-md transition-colors duration-150",
                busy ? "bg-game-ink text-game" : "bg-game text-game-ink",
              )}
            >
              {trackerReady ? <MoveGlyph icon={move.icon} className="size-7" /> : <LoaderCircle aria-hidden className="size-6 animate-spin" />}
            </span>
            <span className="flex min-w-0 flex-col gap-1">
              <span className="type-title-3 truncate">{move.name}</span>
              <span className="flex items-center gap-2.5">
                {trackerReady ? <Pips count={Math.min(count, EXAMPLES_NEEDED)} of={EXAMPLES_NEEDED} tone={busy ? "ink" : "light"} /> : null}
                <span className="type-small truncate font-semibold tabular-nums">{plateLine}</span>
              </span>
            </span>
          </StagePlate>
          <StageCountdown value={phase.kind === "countdown" ? phase.value : null} />
          {hint ? (
            <StageBanner key={hint.text} icon={hint.icon}>
              {hint.text}
            </StageBanner>
          ) : null}
        </CameraStage>
      </div>

      <div className="flex min-w-0 flex-col gap-6 lg:col-start-2 lg:row-start-2">
        {/* Record and Train side by side: whichever comes next is the filled one. */}
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant={busy ? "secondary" : ready ? "secondary" : "game"}
              size="lg"
              icon={busy ? <Square /> : <CircleDot />}
              onClick={press}
              disabled={!trackerReady || (!busy && next === 0)}
              className="min-w-[10rem]"
            >
              {busy ? "Stop" : recordLabel}
            </Button>
            <Button variant={ready ? "game" : "secondary"} size="lg" arrow={ready} disabled={!ready || busy} onClick={onTrain}>
              Train it
            </Button>
          </div>
          <KeyHints className="hidden lg:flex" items={[{ keys: ["Space"], label: busy ? "Stop" : recordLabel }]} />
          <p className="type-small text-fg-subtle">{helper}</p>
        </div>

        <div className="flex flex-col gap-3">
          {moves.map((m) => (
            <MoveCollector
              key={m.id}
              move={m}
              examples={examples[m.id]}
              selected={m.id === active}
              locked={busy}
              onSelect={() => onSelect(m.id)}
              onRemove={(exampleId) => onRemove(m.id, exampleId)}
            />
          ))}
        </div>
        <p className="sr-only" aria-live="polite">
          {message}
        </p>
      </div>
    </section>
  );
}

function MoveCollector({
  move,
  examples,
  selected,
  locked,
  onSelect,
  onRemove,
}: {
  move: Move;
  examples: Example[];
  selected: boolean;
  locked: boolean;
  onSelect: () => void;
  onRemove: (exampleId: string) => void;
}) {
  const count = examples.length;
  const done = count >= EXAMPLES_NEEDED;
  const empty = Math.max(0, EXAMPLES_NEEDED - count);
  return (
    <div
      className={cn(
        "group/card relative flex flex-col gap-3 rounded-lg p-4 transition-colors duration-150 ease-out",
        selected ? "bg-raised ring-2 ring-game" : "bg-surface shadow-ring hover:bg-raised",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        disabled={locked}
        aria-pressed={selected}
        className={cn(
          "flex min-w-0 items-center justify-between gap-3 text-left outline-none",
          // The whole card selects the move; the remove buttons sit above this layer.
          "after:absolute after:inset-0 after:rounded-lg after:content-['']",
          "focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-fg",
        )}
      >
        <span className="flex min-w-0 items-center gap-3">
          <span
            className={cn(
              "grid size-9 shrink-0 place-items-center rounded-md transition-colors duration-150",
              selected ? "bg-game text-game-ink" : "bg-game-soft text-game",
            )}
          >
            <MoveGlyph icon={move.icon} className="size-6" />
          </span>
          <span className={cn("type-title-3 truncate", selected ? "text-fg" : "text-fg-muted")}>{move.name}</span>
          <span className="sr-only">{selected ? ", recording this move" : ", select to record"}</span>
        </span>
        {done ? (
          <Chip tone="success" icon={<Check />}>
            {count === EXAMPLES_NEEDED ? "Ready" : `${count}, ready`}
          </Chip>
        ) : (
          <span className="type-body shrink-0 font-semibold tabular-nums text-fg-muted">
            {count} of {EXAMPLES_NEEDED}
          </span>
        )}
      </button>
      <ol className="pointer-events-none relative z-[1] grid grid-cols-5 gap-2" aria-label={`${move.name} examples`}>
        <AnimatePresence initial={false}>
          {examples.map((example, i) => (
            <motion.li
              key={example.id}
              layout
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
              transition={{ type: "spring", duration: 0.35, bounce: 0 }}
              className="relative aspect-[4/3] overflow-hidden rounded-sm bg-sunken"
            >
              <ExampleThumb thumbnail={example.thumbnail} keypoints={example.keypoints} ratio={example.ratio} label={`${move.name} example ${i + 1}`} />
              <IconButton
                label={`Remove ${move.name} example ${i + 1}`}
                icon={<X />}
                size="sm"
                onClick={() => onRemove(example.id)}
                disabled={locked}
                className={cn(
                  "pointer-events-auto absolute right-0.5 top-0.5 size-7 bg-black/75 text-white shadow-none hover:bg-black [&_svg]:size-3.5",
                  "after:absolute after:-inset-2 after:content-['']",
                  // Shown while the pointer is over the card, on keyboard focus, and always on touch screens.
                  "opacity-0 group-hover/card:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100",
                )}
              />
            </motion.li>
          ))}
        </AnimatePresence>
        {Array.from({ length: empty }, (_, i) => (
          <li
            key={`empty-${i}`}
            aria-hidden
            className="type-caption grid aspect-[4/3] place-items-center rounded-sm bg-sunken tabular-nums text-fg-faint"
          >
            {count + i + 1}
          </li>
        ))}
      </ol>
    </div>
  );
}
