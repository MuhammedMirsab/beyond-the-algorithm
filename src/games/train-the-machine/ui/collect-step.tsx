"use client";

import { Check, CircleCheck, CircleDot, Hand, ScanFace, Sun, TriangleAlert, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Button, IconButton } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Progress } from "@/components/ui/progress";
import { Kbd } from "@/components/ui/surface";
import { cn } from "@/lib/cn";
import { WINDOW_INTERVAL_MS, WINDOW_SIZE, analyzeTemporalMotion, averageShape, bodyShape, extractFeatureVector } from "../engine/features";
import { captureIssueText, validateCapture, type CaptureIssue } from "../engine/quality";
import type { Sounds } from "../engine/sound";
import type { PerceptionResult } from "../engine/types";
import { CameraStage, StageBanner, StageCountdown, StageFlash, StageRecording } from "./camera-stage";
import { ExampleThumb } from "./figures";
import { EXAMPLES_NEEDED, MAX_EXAMPLES, snapshot, type Example, type Examples, type Move, type MoveId } from "./model";
import type { PerceptionStatus } from "./use-perception";

type Phase = { kind: "idle" } | { kind: "countdown"; value: number } | { kind: "recording"; progress: number };

/** 3, 2, 1: time to step back into position after pressing Space. */
const COUNT_FROM = 3;
const COUNT_MS = 800;
/** A rejected example's message, or a "now the other move" note, stays this long. */
const ISSUE_MS = 4500;
const NOTE_MS = 3500;

export interface PerceptionRefs {
  latestRef: RefObject<PerceptionResult | null>;
  windowRef: RefObject<PerceptionResult[]>;
  samplesRef: RefObject<number>;
  status: PerceptionStatus;
}

/** What the camera can't see right now, most important first. */
export function liveHint(status: PerceptionStatus, move: Move | null): { icon: ReactNode; text: string } | null {
  if (!status.hasPerson) return { icon: <ScanFace aria-hidden />, text: "Step in front of the camera so it can see you." };
  if (!status.shouldersVisible) return { icon: <ScanFace aria-hidden />, text: "Step back so your shoulders are in view." };
  if (move?.traits.needsHands && !status.hasHands) return { icon: <Hand aria-hidden />, text: "Show your hand to the camera." };
  if (status.light === "low") return { icon: <Sun aria-hidden />, text: "Find more light. The camera can barely see you." };
  if (status.light === "bright") return { icon: <Sun aria-hidden />, text: "Too bright. Move out of the direct light." };
  return null;
}

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
  sounds: () => Sounds | null;
}) {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [issue, setIssue] = useState<{ issue: CaptureIssue; id: number } | null>(null);
  const [note, setNote] = useState<{ text: string; id: number } | null>(null);
  const [flash, setFlash] = useState(0);
  const [message, setMessage] = useState("");
  const busyRef = useRef(false);
  const timersRef = useRef(new Set<ReturnType<typeof setTimeout>>());

  const move = moves[0].id === active ? moves[0] : moves[1];
  const count = examples[active].length;
  const full = count >= MAX_EXAMPLES;
  const ready = moves.every((m) => examples[m.id].length >= EXAMPLES_NEEDED);
  const busy = phase.kind !== "idle";

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
      busyRef.current = false;
    };
  }, []);

  const later = (fn: () => void, ms: number) => {
    const timer = setTimeout(() => {
      timersRef.current.delete(timer);
      fn();
    }, ms);
    timersRef.current.add(timer);
  };

  const miss = (problem: CaptureIssue) => {
    sounds()?.miss();
    const id = Date.now();
    setIssue({ issue: problem, id });
    setMessage(captureIssueText(problem));
    later(() => setIssue((current) => (current?.id === id ? null : current)), ISSUE_MS);
  };

  /** Check the moment (or recording), turn it into 44 numbers and keep it. */
  const keep = (target: Move, frame: PerceptionResult | null, window: PerceptionResult[], sequence: PerceptionResult[] | null) => {
    busyRef.current = false;
    setPhase({ kind: "idle" });
    const problem = validateCapture({ frame, sequence: sequence ?? undefined, traits: target.traits });
    const features = problem ? null : extractFeatureVector(frame, window);
    if (problem || !features || !frame) {
      miss(problem ?? "no_person");
      return;
    }
    const shot = snapshot(videoRef.current);
    onAdd(target.id, {
      id: `${target.id}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
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

    const total = examples[target.id].length + 1;
    const other = moves[0].id === target.id ? moves[1] : moves[0];
    const otherCount = examples[other.id].length;
    const counted = total <= EXAMPLES_NEEDED ? `${target.name}: ${total} of ${EXAMPLES_NEEDED}.` : `${target.name}: ${total} examples.`;
    // The game switches to the other move by itself here; say so where people are looking.
    const next =
      total === EXAMPLES_NEEDED
        ? otherCount < EXAMPLES_NEEDED
          ? `${target.name} is done. Now show it ${other.name}.`
          : "Both moves are ready. Train it when you are."
        : null;
    setMessage(next ? `${counted} ${next}` : counted);
    if (next) {
      const id = Date.now();
      setNote({ text: next, id });
      later(() => setNote((current) => (current?.id === id ? null : current)), NOTE_MS);
    }
  };

  const capture = (target: Move) => {
    const { latestRef, windowRef, samplesRef } = perception;
    if (!target.traits.moving) {
      keep(target, latestRef.current, [...windowRef.current], null);
      return;
    }
    // A moving example is the next 25 samples of the same window the test uses.
    const start = samplesRef.current;
    const began = performance.now();
    sounds()?.tick(780);
    setPhase({ kind: "recording", progress: 0 });
    const poll = () => {
      const got = Math.min(WINDOW_SIZE, samplesRef.current - start);
      const stalled = performance.now() - began > WINDOW_SIZE * WINDOW_INTERVAL_MS * 2.5;
      if (got >= WINDOW_SIZE || stalled) {
        const sequence = got > 0 ? windowRef.current.slice(-got) : [];
        const frame = [...sequence].reverse().find((f) => f.hasPerson) ?? null;
        keep(target, frame, sequence, sequence);
        return;
      }
      setPhase({ kind: "recording", progress: got / WINDOW_SIZE });
      later(poll, 50);
    };
    later(poll, 50);
  };

  const record = () => {
    if (busyRef.current || full) return;
    busyRef.current = true;
    const target = move;
    setIssue(null);
    setNote(null);
    setMessage(`Recording ${target.name} in ${COUNT_FROM}.`);
    const step = (value: number) => {
      if (value === 0) {
        capture(target);
        return;
      }
      setPhase({ kind: "countdown", value });
      sounds()?.tick(value === 1 ? 660 : 520);
      later(() => step(value - 1), COUNT_MS);
    };
    step(COUNT_FROM);
  };

  // Space records from anywhere on this screen, except while typing.
  const recordRef = useRef(record);
  useEffect(() => {
    recordRef.current = record;
  });
  useEffect(() => {
    const isSpace = (e: KeyboardEvent) => e.code === "Space" || e.key === " ";
    const typing = (target: EventTarget | null) =>
      target instanceof HTMLElement && !!target.closest("input, textarea, select, [contenteditable='true']");
    const onKeyDown = (e: KeyboardEvent) => {
      if (!isSpace(e) || e.altKey || e.ctrlKey || e.metaKey || typing(e.target)) return;
      e.preventDefault();
      if (!e.repeat) recordRef.current();
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
      : liveHint(perception.status, move);

  const recordLabel = phase.kind === "countdown" ? "Get ready" : phase.kind === "recording" ? "Recording" : "Record";

  return (
    <section className="mx-auto grid w-full max-w-[75rem] items-start gap-x-8 gap-y-6 px-4 pb-10 pt-2 sm:px-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:grid-rows-[auto_1fr] lg:px-8">
      <header className="flex min-w-0 flex-col gap-2 lg:col-start-2 lg:row-start-1">
        <span className="type-label text-game">Step 2 of 3 · Teaching</span>
        <h1 data-step-focus tabIndex={-1} className="type-display-2 break-words text-fg outline-none">
          {move.name}
        </h1>
        <p className="type-body-lg text-fg-muted">
          {move.hint}
          {move.traits.moving ? " Each example records 1.5 seconds." : null}
        </p>
      </header>

      <div className="min-w-0 lg:col-start-1 lg:row-span-2 lg:row-start-1">
        <CameraStage stream={stream} videoRef={videoRef} canvasRef={canvasRef}>
          <StageFlash id={flash} />
          <StageCountdown value={phase.kind === "countdown" ? phase.value : null} />
          {phase.kind === "recording" ? <StageRecording progress={phase.progress} /> : null}
          {hint ? <StageBanner icon={hint.icon}>{hint.text}</StageBanner> : null}
        </CameraStage>
      </div>

      <div className="flex min-w-0 flex-col gap-6 lg:col-start-2 lg:row-start-2">
        {/* Record and Train side by side: whichever comes next is the filled one. */}
        <div className="flex flex-col gap-2.5">
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant={ready ? "secondary" : "game"}
              size="lg"
              icon={<CircleDot />}
              onClick={record}
              disabled={busy || full}
              className="min-w-[10rem]"
            >
              {recordLabel}
            </Button>
            <Button variant={ready ? "game" : "secondary"} size="lg" arrow={ready} disabled={!ready || busy} onClick={onTrain}>
              Train it
            </Button>
          </div>
          <p className="type-small text-fg-subtle">
            {full
              ? `${MAX_EXAMPLES} examples of ${move.name} is plenty.`
              : ready
                ? "Train it now, or add more examples first."
                : `Show each move ${EXAMPLES_NEEDED} times to train it.`}
            <span className="hidden lg:inline">
              {" "}
              Press <Kbd>Space</Kbd> to record.
            </span>
          </p>
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
        <span className="flex min-w-0 items-center gap-2.5">
          <CircleDot aria-hidden className={cn("size-5 shrink-0", selected ? "text-game" : "text-fg-faint")} />
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
      <Progress value={count / EXAMPLES_NEEDED} label={`${move.name}: ${count} of ${EXAMPLES_NEEDED} examples`} tone="game" />
      <ol className="pointer-events-none relative z-[1] grid grid-cols-5 gap-2" aria-label={`${move.name} examples`}>
        {examples.map((example, i) => (
          <li key={example.id} className="relative aspect-[4/3] overflow-hidden rounded-sm bg-sunken">
            <ExampleThumb
              thumbnail={example.thumbnail}
              keypoints={example.keypoints}
              ratio={example.ratio}
              label={`${move.name} example ${i + 1}`}
            />
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
          </li>
        ))}
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
