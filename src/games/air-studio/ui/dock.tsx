"use client";

import { Circle, LoaderCircle, Music, Play, Settings, Square, Target } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, type ReactNode } from "react";
import { Button, IconButton } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { TAKE_CAP_S } from "../engine/audio/recorder";
import { INSTRUMENTS } from "../engine/instruments/index";
import { fmtTime } from "../engine/music";
import type { InstrumentId } from "../engine/settings";
import type { StudioSession, StudioView } from "../play/session";
import { AdaptiveButton } from "./adaptive-button";
import { BeatDots } from "./beat-dots";
import { InstrumentGlyph } from "./instrument-glyph";

export type DockPanel = "play-along" | "take" | "settings";

const EASE_OUT = [0.22, 1, 0.36, 1] as const;
const SPRING = { type: "spring", duration: 0.35, bounce: 0 } as const;

/** Phones get the 44px size, so each group fits on one row. */
const PHONE_BUTTON = "max-sm:h-11 max-sm:px-3.5 max-sm:[&_svg]:size-[18px]";
const PHONE_ICON = "max-sm:size-11 max-sm:[&_svg]:size-5";

/** The seconds recorded so far, written straight into the DOM from the audio clock. */
function RecordClock({ session }: { session: StudioSession }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let raf = 0;
    let shown = "";
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const t = session.recordingElapsed();
      const text = `${fmtTime(t ?? 0)} / ${fmtTime(TAKE_CAP_S)}`;
      if (text !== shown && ref.current) {
        shown = text;
        ref.current.textContent = text;
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [session]);
  return <span ref={ref} className="tabular-nums" />;
}

/** A thin ring around an instrument while its recordings download. */
function LoadRing({ value }: { value: number }) {
  const r = 21;
  const c = 2 * Math.PI * r;
  return (
    <svg aria-hidden viewBox="0 0 48 48" className="pointer-events-none absolute inset-0 m-auto size-[calc(100%-4px)] -rotate-90">
      <circle cx={24} cy={24} r={r} fill="none" strokeWidth={2.5} className="stroke-fg/10" />
      <circle
        cx={24}
        cy={24}
        r={r}
        fill="none"
        strokeWidth={2.5}
        strokeLinecap="round"
        className="stroke-game transition-[stroke-dashoffset] duration-200 ease-out"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - Math.max(0.04, value))}
      />
    </svg>
  );
}

/**
 * The five instruments, one tap each. The one playing is named and outlined
 * in gold; the rest are their pictures (named for screen readers and on
 * hover). Switching keeps the current one playing until the new one is ready.
 */
export function InstrumentSwitch({
  current,
  loading,
  onPick,
}: {
  current: InstrumentId | null;
  loading: { id: InstrumentId; progress: number } | null;
  onPick: (id: InstrumentId) => void;
}) {
  return (
    <div role="group" aria-label="Instrument" className="pointer-events-auto flex items-center gap-1 rounded-full bg-surface p-1.5 shadow-ring">
      {INSTRUMENTS.map((inst) => {
        const on = current === inst.id;
        const busy = loading?.id === inst.id;
        return (
          <motion.button
            key={inst.id}
            layout
            transition={SPRING}
            type="button"
            aria-pressed={on}
            aria-busy={busy || undefined}
            title={on ? undefined : inst.name}
            onClick={() => onPick(inst.id)}
            className={cn(
              "relative inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full font-semibold sm:h-14",
              "transition-[background-color,color,box-shadow,scale] duration-150 ease-out active:scale-[0.97]",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg",
              on ? "bg-game-soft pl-3 pr-4 text-fg shadow-[inset_0_0_0_1.5px_var(--game)] sm:pl-4 sm:pr-5" : "w-11 text-fg-muted hover:bg-fg/[0.06] hover:text-fg sm:w-14",
            )}
          >
            <motion.span
              layout="position"
              key={on ? "on" : "off"}
              // A small wiggle as it is picked up.
              initial={on ? { rotate: -14 } : false}
              animate={{ rotate: [on ? -14 : 0, on ? 7 : 0, 0] }}
              transition={{ duration: 0.42, ease: EASE_OUT }}
              className={cn("relative grid size-8 place-items-center", on && "text-game")}
            >
              <InstrumentGlyph id={inst.id} strokeWidth={2} className="size-6" />
              {busy && loading ? <LoadRing value={loading.progress} /> : null}
            </motion.span>
            {on ? (
              <motion.span layout="position" className="text-[0.9375rem]">
                {inst.name}
              </motion.span>
            ) : (
              <span className="sr-only">{inst.name}</span>
            )}
          </motion.button>
        );
      })}
    </div>
  );
}

/** A group that has just been revealed: it slides up into the dock and a gold ring fades off it once. */
function NewGroup({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 14, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: 0.4, ease: EASE_OUT } }}
      exit={{ opacity: 0, transition: { duration: 0.15 } }}
      className={cn("relative flex items-center gap-1", className)}
    >
      <motion.span
        aria-hidden
        initial={{ opacity: 1 }}
        animate={{ opacity: 0 }}
        transition={{ duration: 1.8, delay: 0.5, ease: EASE_OUT }}
        className="pointer-events-none absolute -inset-1 rounded-full ring-2 ring-game"
      />
      {children}
    </motion.div>
  );
}

/**
 * What to do with the instrument, revealed step by step (see reveal.ts):
 * Play along and Record, then Practice. Settings is always at the end.
 * Record is the one filled action.
 */
export function DockActions({
  session,
  view,
  onOpen,
  onPractice,
}: {
  session: StudioSession;
  view: StudioView;
  onOpen: (panel: DockPanel) => void;
  onPractice: () => void;
}) {
  const { reveal, playAlong, rec, take, takeMode, countIn } = view;
  const style = session.styleFor(playAlong.choice);
  const recording = rec.state === "recording" || rec.state === "waiting";

  return (
    <motion.div layout transition={SPRING} role="toolbar" aria-label="Studio" className="pointer-events-auto flex items-center gap-1 rounded-full bg-surface p-1.5 shadow-ring">
      <AnimatePresence initial={false}>
        {reveal >= 2 ? (
          <NewGroup key="make">
            {playAlong.running ? (
              <span className="flex items-center">
                <Button variant="ghost" size="lg" onClick={() => onOpen("play-along")} aria-haspopup="dialog" className={cn("gap-3 px-4", PHONE_BUTTON)}>
                  <BeatDots beats={style?.sig === "3/4" ? 3 : 4} />
                  <span className="tabular-nums">
                    <span className="hidden xl:inline">{style ? style.genre : "Click"} · </span>
                    {playAlong.bpm}
                  </span>
                  <span className="sr-only">beats a minute. Change play along</span>
                </Button>
                <IconButton label="Stop play along" icon={<Square className="fill-current" />} variant="ghost" size="lg" onClick={session.stopPlayAlong} className={PHONE_ICON} />
              </span>
            ) : (
              <AdaptiveButton
                icon={playAlong.starting ? <LoaderCircle className="animate-spin" /> : <Music />}
                label="Play along"
                size="lg"
                from="lg"
                popup
                onClick={() => onOpen("play-along")}
                className={PHONE_ICON}
              />
            )}
            {recording ? (
              <Button
                variant="secondary"
                size="lg"
                onClick={() => void session.stopRecording()}
                aria-keyshortcuts="R"
                className={cn("px-5", PHONE_BUTTON)}
                icon={<Square className="fill-current text-danger" />}
              >
                {rec.state === "waiting" ? (
                  <span className="tabular-nums">Starts in {countIn ?? 1}</span>
                ) : (
                  <>
                    <span className="sr-only">Stop recording,</span>
                    <RecordClock session={session} />
                  </>
                )}
              </Button>
            ) : (
              <Button
                variant="game"
                size="lg"
                onClick={() => void session.record()}
                loading={rec.state === "saving"}
                aria-keyshortcuts="R"
                title="Record (R)"
                className={cn("px-5", PHONE_BUTTON)}
                icon={<Circle className="fill-current" />}
              >
                <span className="hidden sm:inline">{take ? "Record again" : "Record"}</span>
                <span className="sr-only sm:hidden">Record</span>
              </Button>
            )}
            {take && !recording ? (
              takeMode === "off" ? (
                <AdaptiveButton icon={<Play className="fill-current" />} label="Your take" size="lg" from="xl" popup onClick={() => onOpen("take")} className={PHONE_ICON} />
              ) : (
                <AdaptiveButton icon={<Square className="fill-current" />} label="Stop your take" size="lg" from="xl" variant="secondary" onClick={session.stopTake} className={PHONE_ICON} />
              )
            ) : null}
          </NewGroup>
        ) : null}
        {reveal >= 3 ? (
          <NewGroup key="practice">
            <AdaptiveButton icon={<Target />} label="Practice" size="lg" from="lg" onClick={onPractice} disabled={recording || rec.state === "saving"} className={PHONE_ICON} />
          </NewGroup>
        ) : null}
      </AnimatePresence>
      <motion.span layout="position" className="flex">
        <IconButton label="Settings" icon={<Settings />} variant="ghost" size="lg" aria-haspopup="dialog" onClick={() => onOpen("settings")} className={PHONE_ICON} />
      </motion.span>
    </motion.div>
  );
}
