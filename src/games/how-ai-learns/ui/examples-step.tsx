"use client";

import { AnimatePresence, motion } from "motion/react";
import Image from "next/image";
import { Camera, Check, CircleCheck, Images, Square, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CameraProblem, CameraPrompt, CameraWaiting } from "@/components/game/camera-notice";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { KeyHints } from "@/components/ui/key-hints";
import { cn } from "@/lib/cn";
import { joinWords } from "./copy";
import { LIBRARY_BATCH, MAX_EXAMPLES, MIN_EXAMPLES, type ExamplePhoto } from "./state";
import { StepLayout } from "./step-layout";
import { cameraPermission, useCamera } from "./use-camera";
import type { LearnGame } from "./use-learn-game";

export const CAMERA_PHOTO_PRIVACY = "Photos stay in this browser tab. Nothing is uploaded, and Next player deletes them.";

/** 3, 2, 1 before the first photo: time to pick the thing up. */
const COUNT_FROM = 3;
const COUNT_MS = 600;
/** Between photos: time to turn it a little. */
const SHOT_GAP_MS = 650;
/** Photos taken by one press, at most. */
const BURST = 5;
const NOTE_MS = 4500;

type Phase = { kind: "idle" } | { kind: "countdown"; value: number } | { kind: "shooting"; taken: number; want: number };

interface Run {
  group: string;
  base: number;
  want: number;
  taken: number;
  misses: number;
  stop: boolean;
}

interface GroupView {
  id: string;
  label: string;
  hasLibrary: boolean;
  photos: ExamplePhoto[];
  /** Library photos still available to add. */
  left: number;
}

/** How many photos one press takes: up to 5 needed, then 5 more, never past the maximum. */
function burstFor(have: number) {
  if (have >= MAX_EXAMPLES) return 0;
  return Math.min(have < MIN_EXAMPLES ? MIN_EXAMPLES - have : BURST, MAX_EXAMPLES - have);
}

/**
 * Step 2: examples. One camera on screen the whole time. Press Take photos
 * (or Space): 3, 2, 1, then five photos in a row while the visitor turns the
 * thing a little. When a thing has its five, the next one is up. Library
 * photos stay one tap away for anyone with nothing to show.
 */
export function ExamplesStep({ game }: { game: LearnGame }) {
  const { state, dataset, dispatch, actions, libraryPoolFor } = game;
  const { camera, videoRef, start, capture: grabFrame } = useCamera();
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [note, setNote] = useState<{ text: string; id: number } | null>(null);
  const [flash, setFlash] = useState(0);
  const [message, setMessage] = useState("");
  const runRef = useRef<Run | null>(null);
  const timersRef = useRef(new Set<ReturnType<typeof setTimeout>>());

  const groups: GroupView[] =
    dataset.status === "ready"
      ? state.groups.map((g) => {
          const hasLibrary = g.library !== null;
          const photos = state.examples[g.id] ?? [];
          const taken = new Set(photos.map((p) => p.id));
          const left = hasLibrary ? libraryPoolFor(g.id).filter((p) => !taken.has(p.id)).length : 0;
          return { id: g.id, label: g.name.trim(), hasLibrary, photos, left };
        })
      : [];
  const firstShort = groups.find((g) => g.photos.length < MIN_EXAMPLES);
  const active = groups.find((g) => g.id === state.capture) ?? firstShort ?? groups[0];
  const short = groups.filter((g) => g.photos.length < MIN_EXAMPLES);
  const ready = groups.length > 0 && short.length === 0;
  const busy = phase.kind !== "idle";
  const live = camera.status === "live";
  const next = active ? burstFor(active.photos.length) : 0;

  // Timers outlive renders: they read the latest values from here.
  const latest = useRef({ groups, active, grabFrame, addCameraPhoto: actions.addCameraPhoto, dispatch });
  useEffect(() => {
    latest.current = { groups, active, grabFrame, addCameraPhoto: actions.addCameraPhoto, dispatch };
  });

  // The camera opens on its own when this visitor, or the browser, already allowed it.
  const welcomed = state.cameraWelcomed;
  const cameraOff = camera.status === "off";
  useEffect(() => {
    if (!cameraOff) return;
    if (welcomed) {
      void start();
      return;
    }
    let live = true;
    void cameraPermission().then((permission) => {
      if (!live || permission !== "granted") return;
      dispatch({ type: "camera-welcomed" });
    });
    return () => {
      live = false;
    };
  }, [cameraOff, welcomed, start, dispatch]);

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

  const showNote = (text: string) => {
    const id = Date.now();
    setNote({ text, id });
    setMessage(text);
    later(() => setNote((current) => (current?.id === id ? null : current)), NOTE_MS);
  };

  const finish = () => {
    const run = runRef.current;
    runRef.current = null;
    setPhase({ kind: "idle" });
    if (!run || run.taken === 0) {
      if (run && run.misses > 0) showNote("The camera isn’t sending pictures yet. Try again.");
      return;
    }
    if (run.base >= MIN_EXAMPLES || run.base + run.taken < MIN_EXAMPLES) return;
    // This one is done: on to the next thing that still needs photos.
    const after = latest.current.groups.find((g) => g.id !== run.group && g.photos.length < MIN_EXAMPLES);
    const done = latest.current.groups.find((g) => g.id === run.group);
    if (after) {
      latest.current.dispatch({ type: "capture", category: after.id });
      showNote(`${done?.label ?? "That"} is done. Now show it ${after.label}.`);
    } else {
      showNote("Every group has its photos. Train it.");
    }
  };

  const shoot = () => {
    const run = runRef.current;
    if (!run) return;
    if (run.stop) {
      finish();
      return;
    }
    const group = latest.current.groups.find((g) => g.id === run.group);
    const canvas = latest.current.grabFrame();
    if (!group || !canvas) {
      run.misses += 1;
    } else {
      run.misses = 0;
      run.taken += 1;
      latest.current.addCameraPhoto(group.id, group.label, canvas);
      setFlash((n) => n + 1);
      setMessage(`${group.label}: photo ${run.base + run.taken}.`);
    }
    if (run.taken >= run.want || run.misses >= 3) {
      finish();
      return;
    }
    setPhase({ kind: "shooting", taken: run.taken, want: run.want });
    later(shoot, SHOT_GAP_MS);
  };

  const countdown = (value: number) => {
    const run = runRef.current;
    if (!run) return;
    if (run.stop) {
      finish();
      return;
    }
    if (value === 0) {
      setPhase({ kind: "shooting", taken: 0, want: run.want });
      shoot();
      return;
    }
    setPhase({ kind: "countdown", value });
    later(() => countdown(value - 1), COUNT_MS);
  };

  /** Take photos (or Space): start a run of photos, or stop the one in progress. */
  const press = () => {
    const run = runRef.current;
    if (run) {
      run.stop = true;
      return;
    }
    const group = latest.current.active;
    if (!group || camera.status !== "live") return;
    const want = burstFor(group.photos.length);
    if (want <= 0) return;
    runRef.current = { group: group.id, base: group.photos.length, want, taken: 0, misses: 0, stop: false };
    setNote(null);
    setMessage(`Taking ${want} photos of ${group.label} in ${COUNT_FROM}.`);
    countdown(COUNT_FROM);
  };

  const pressRef = useRef<() => void>(() => {});
  useEffect(() => {
    pressRef.current = press;
  });
  useEffect(() => {
    const typing = (target: EventTarget | null) =>
      target instanceof HTMLElement && !!target.closest("input, textarea, select, [contenteditable='true'], [role='slider']");
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.code !== "Space" && e.key !== " ") || e.altKey || e.ctrlKey || e.metaKey || typing(e.target)) return;
      e.preventDefault();
      if (!e.repeat) pressRef.current();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if ((e.code === "Space" || e.key === " ") && !typing(e.target)) e.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  if (dataset.status !== "ready" || !active) return null;

  const select = (id: string) => {
    if (busy) return;
    dispatch({ type: "capture", category: id });
  };

  const takeLabel = busy ? "Stop" : active.photos.length < MIN_EXAMPLES ? `Take ${next} photos` : next > 0 ? `Take ${next} more` : "Full";
  const plateLine =
    phase.kind === "countdown"
      ? "Get ready"
      : phase.kind === "shooting"
        ? "Turn it a little each time"
        : active.photos.length < MIN_EXAMPLES
          ? `${active.photos.length} of ${MIN_EXAMPLES}`
          : `${active.photos.length} photos`;

  return (
    <StepLayout
      step="examples"
      title="Show it each thing"
      lead={
        <p>
          {MIN_EXAMPLES} photos of each, from a few angles.
        </p>
      }
      secondary={
        <Button variant="ghost" size="lg" onClick={() => actions.go("pick")} disabled={busy}>
          Change what to teach
        </Button>
      }
      primary={
        <Button variant="game" size="lg" arrow disabled={!ready || busy} onClick={() => void actions.train()}>
          Train it
        </Button>
      }
      note={ready ? null : `Add ${joinWords(short.map((g) => needed(MIN_EXAMPLES - g.photos.length, g.label)))} first.`}
    >
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_23rem] lg:gap-8">
        {/* The camera: always in view, overlays only at its edges. */}
        <div className="flex min-w-0 flex-col gap-3">
          <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-sunken shadow-ring">
            {live ? (
              <>
                <video
                  ref={videoRef}
                  muted
                  playsInline
                  autoPlay
                  aria-label="Your camera"
                  className={cn("absolute inset-0 size-full object-cover", camera.mirrored && "-scale-x-100")}
                />
                {flash > 0 ? (
                  <motion.span
                    key={flash}
                    aria-hidden
                    initial={{ opacity: 0.4 }}
                    animate={{ opacity: 0 }}
                    transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                    className="pointer-events-none absolute inset-0 bg-white"
                  />
                ) : null}
                <Plate group={active} line={plateLine} busy={busy} />
                <Countdown value={phase.kind === "countdown" ? phase.value : null} />
                <AnimatePresence>
                  {note ? (
                    <motion.p
                      key={note.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, transition: { duration: 0.15 } }}
                      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                      className="type-title-3 pointer-events-none absolute inset-x-3 bottom-3 mx-auto flex w-fit max-w-[calc(100%-1.5rem)] items-center gap-3 rounded-lg bg-black/75 px-4 py-3 text-white sm:bottom-5"
                    >
                      <CircleCheck aria-hidden className="size-6 shrink-0 text-success" />
                      {note.text}
                    </motion.p>
                  ) : null}
                </AnimatePresence>
              </>
            ) : (
              <div className="absolute inset-0 grid place-items-center overflow-y-auto p-6">
                {camera.status === "waiting" ? (
                  <CameraWaiting />
                ) : camera.status === "error" ? (
                  <CameraProblem issue={camera.issue} onRetry={() => void start()} />
                ) : (
                  <CameraPrompt
                    text="Each photo becomes one example. Nothing to show? Add photos from the library instead."
                    privacy={CAMERA_PHOTO_PRIVACY}
                    onAllow={() => {
                      dispatch({ type: "camera-welcomed" });
                      void start();
                    }}
                  />
                )}
              </div>
            )}
          </div>
          <p aria-live="polite" className="sr-only">
            {message}
          </p>
        </div>

        {/* Beside the camera (so it never falls below the fold): the shutter, then where the photos go and how far along each group is. */}
        <div className="flex min-w-0 flex-col gap-5">
          {live ? (
            <div className="flex flex-col gap-2.5">
              <Button
                variant={busy ? "secondary" : ready ? "secondary" : "game"}
                size="lg"
                icon={busy ? <Square /> : <Camera />}
                disabled={!busy && next <= 0}
                onClick={press}
                className="self-start sm:min-w-[12rem]"
              >
                {takeLabel}
              </Button>
              <KeyHints className="hidden lg:flex" items={[{ keys: ["Space"], label: busy ? "Stop" : "Take photos" }]} />
            </div>
          ) : null}
          <ul className="flex flex-col gap-3" aria-label="What it will learn">
            {groups.map((group) => (
              <GroupCard
                key={group.id}
                group={group}
                selected={group.id === active.id}
                locked={busy}
                onSelect={() => select(group.id)}
                onLibrary={() => actions.addFromLibrary(group.id)}
                onRemove={(photo) => actions.removeExample(photo)}
              />
            ))}
          </ul>
        </div>
      </div>
    </StepLayout>
  );
}

/** "3 more pen photos", "1 more cup photo". */
function needed(n: number, label: string) {
  return `${n} more ${label} photo${n === 1 ? "" : "s"}`;
}

function Plate({ group, line, busy }: { group: GroupView; line: string; busy: boolean }) {
  const count = Math.min(group.photos.length, MIN_EXAMPLES);
  return (
    <div className="pointer-events-none absolute left-3 top-3 max-w-[calc(100%-1.5rem)] sm:left-4 sm:top-4">
      <div
        className={cn(
          "flex flex-col gap-1.5 rounded-lg px-4 py-2.5 transition-colors duration-150",
          busy ? "bg-game text-game-ink" : "bg-black/75 text-white",
        )}
      >
        <span className="type-title-3 truncate">{group.label}</span>
        <span className="flex items-center gap-2.5">
          <span aria-hidden className="flex gap-1.5">
            {Array.from({ length: MIN_EXAMPLES }, (_, i) => (
              <span
                key={i}
                className={cn(
                  "size-2.5 rounded-full transition-colors duration-150",
                  i < count ? (busy ? "bg-game-ink" : "bg-game") : busy ? "bg-game-ink/20" : "bg-white/25",
                )}
              />
            ))}
          </span>
          <span className="type-small truncate font-semibold tabular-nums">{line}</span>
        </span>
      </div>
    </div>
  );
}

function Countdown({ value }: { value: number | null }) {
  return (
    <div className="pointer-events-none absolute right-3 top-3 sm:right-4 sm:top-4">
      <AnimatePresence initial={false}>
        {value !== null ? (
          <motion.span
            key={value}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="type-score absolute right-0 top-0 grid size-[clamp(5rem,11vw,7rem)] place-items-center rounded-xl bg-black/75 pt-[0.08em] text-white tabular-nums"
          >
            {value}
          </motion.span>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

const SHOWN = 10;

function GroupCard({
  group,
  selected,
  locked,
  onSelect,
  onLibrary,
  onRemove,
}: {
  group: GroupView;
  selected: boolean;
  locked: boolean;
  onSelect: () => void;
  onLibrary: () => void;
  onRemove: (photo: ExamplePhoto) => void;
}) {
  const count = group.photos.length;
  const room = MAX_EXAMPLES - count;
  const batch = Math.min(LIBRARY_BATCH, group.left, room);
  const shown = group.photos.slice(-SHOWN);
  const hidden = count - shown.length;
  return (
    <li
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
          "after:absolute after:inset-0 after:rounded-lg after:content-['']",
          "focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-fg",
        )}
      >
        <span className="flex min-w-0 flex-col">
          <span className={cn("type-title-3 truncate", selected ? "text-fg" : "text-fg-muted")}>{group.label}</span>
          <span className="sr-only">{selected ? ", photos go here" : ", select to take its photos"}</span>
        </span>
        {count >= MIN_EXAMPLES ? (
          <Chip tone="success" icon={<Check />}>
            {count}
          </Chip>
        ) : (
          <span className="type-body shrink-0 font-semibold tabular-nums text-fg-muted">
            {count} of {MIN_EXAMPLES}
          </span>
        )}
      </button>

      {count > 0 ? (
        <ul className="pointer-events-none relative z-[1] grid grid-cols-5 gap-1.5" aria-label={`${group.label} photos`}>
          <AnimatePresence initial={false}>
            {shown.map((photo, i) => (
              <motion.li
                key={photo.id}
                layout
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
                transition={{ type: "spring", duration: 0.35, bounce: 0 }}
                className="relative"
              >
                <Thumb photo={photo} index={hidden + i} label={group.label} locked={locked} onRemove={() => onRemove(photo)} />
                {i === 0 && hidden > 0 ? (
                  <span className="type-caption pointer-events-none absolute inset-0 grid place-items-center rounded-sm bg-black/60 font-semibold text-white">
                    +{hidden}
                  </span>
                ) : null}
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      ) : null}

      {group.hasLibrary && batch > 0 ? (
        <Button
          variant="ghost"
          size="sm"
          icon={<Images />}
          disabled={locked}
          onClick={onLibrary}
          className="relative z-[1] -ml-2 self-start"
        >
          {`Add ${batch} from the library`}
        </Button>
      ) : null}
    </li>
  );
}

function Thumb({ photo, index, label, locked, onRemove }: { photo: ExamplePhoto; index: number; label: string; locked: boolean; onRemove: () => void }) {
  return (
    <button
      type="button"
      onClick={onRemove}
      disabled={locked}
      aria-label={`Remove ${label} photo ${index + 1}${photo.kind === "camera" ? ", taken with the camera" : ""}`}
      className={cn(
        "group/thumb pointer-events-auto relative block aspect-square w-full overflow-hidden rounded-sm bg-sunken",
        "transition-transform duration-150 ease-out active:scale-[0.97]",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg",
      )}
    >
      <Image src={photo.url} alt="" fill unoptimized sizes="80px" className="object-cover" />
      <span
        aria-hidden
        className={cn(
          "absolute right-0.5 top-0.5 grid size-5 place-items-center rounded-full bg-black/70 text-white transition-opacity duration-150",
          "[@media(hover:hover)]:opacity-0 group-hover/thumb:opacity-100 group-focus-visible/thumb:opacity-100",
        )}
      >
        <X className="size-3" strokeWidth={2.5} />
      </span>
    </button>
  );
}
