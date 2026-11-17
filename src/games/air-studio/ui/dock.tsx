"use client";

import { ChevronDown, Circle, LoaderCircle, Music, Play, Settings, SlidersHorizontal, Square, Target } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button, IconButton } from "@/components/ui/button";
import { Kbd } from "@/components/ui/surface";
import { cn } from "@/lib/cn";
import { TAKE_CAP_S } from "../engine/audio/recorder";
import { fmtTime } from "../engine/music";
import { INSTRUMENT_NAMES } from "../engine/settings";
import type { StudioSession, StudioView } from "../play/session";
import { AdaptiveButton } from "./adaptive-button";
import { BeatDots } from "./beat-dots";
import { InstrumentGlyph } from "./instrument-glyph";

export type DockPanel = "instrument" | "options" | "play-along" | "take" | "settings";

function Divider() {
  return <span aria-hidden className="mx-0.5 hidden h-8 w-px shrink-0 bg-line-strong sm:block" />;
}

/** Phones get the 44px size, so the whole bar fits on one row. */
const PHONE_BUTTON = "max-sm:h-11 max-sm:px-3 max-sm:[&_svg]:size-[18px]";
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

/**
 * The play screen's controls in one row: the instrument and its options,
 * Play along, the take, then Practice and Settings. Record is the one filled
 * action.
 */
export function Dock({
  session,
  view,
  onOpen,
  onPractice,
  className,
}: {
  session: StudioSession;
  view: StudioView;
  onOpen: (panel: DockPanel) => void;
  onPractice: () => void;
  className?: string;
}) {
  const { instrument, playAlong, rec, take, takeMode, countIn } = view;
  const style = session.styleFor(playAlong.choice);
  const recording = rec.state === "recording" || rec.state === "waiting";

  return (
    <div
      role="toolbar"
      aria-label="Studio controls"
      className={cn("pointer-events-auto flex max-w-full items-center gap-0.5 overflow-x-auto rounded-full bg-surface p-1.5 shadow-ring no-scrollbar sm:gap-1.5", className)}
    >
      {/* The instrument: always named, it's the main thing on screen. */}
      <Button
        variant="ghost"
        size="lg"
        onClick={() => onOpen("instrument")}
        aria-haspopup="dialog"
        className={cn("gap-2.5 pl-3 pr-4 sm:pl-4", PHONE_BUTTON)}
        icon={instrument ? <InstrumentGlyph id={instrument} strokeWidth={2} className="size-6!" /> : undefined}
      >
        {/* The name needs md: between 640 and 768 px it pushed Practice and Settings out of the row. */}
        <span className="hidden md:inline">{instrument ? INSTRUMENT_NAMES[instrument] : "Instrument"}</span>
        <ChevronDown aria-hidden className="-ml-1 hidden size-4! text-fg-subtle sm:block" />
        <span className="sr-only md:hidden">{instrument ? `${INSTRUMENT_NAMES[instrument]}, change instrument` : "Choose an instrument"}</span>
      </Button>
      <AdaptiveButton icon={<SlidersHorizontal />} label="Options" size="lg" from="xl" popup onClick={() => onOpen("options")} disabled={!instrument} className={PHONE_ICON} />

      <Divider />

      {/* Play along: the click or a band. */}
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
          from="xl"
          popup
          onClick={() => onOpen("play-along")}
          className={PHONE_ICON}
        />
      )}

      {/* The one take. */}
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
          className={cn("px-5", PHONE_BUTTON)}
          icon={<Circle className="fill-current" />}
        >
          <span className="hidden sm:inline">{take ? "Record again" : "Record"}</span>
          <span className="sr-only sm:hidden">Record</span>
          {/* aria-keyshortcuts already announces R; the key cap is for eyes only. */}
          <Kbd aria-hidden tone="on-game" className="ml-0.5 hidden xl:inline-grid">
            R
          </Kbd>
        </Button>
      )}
      {take && !recording ? (
        takeMode === "off" ? (
          <AdaptiveButton icon={<Play className="fill-current" />} label="Your take" size="lg" from="xl" popup onClick={() => onOpen("take")} className={PHONE_ICON} />
        ) : (
          <AdaptiveButton icon={<Square className="fill-current" />} label="Stop your take" size="lg" from="xl" variant="secondary" onClick={session.stopTake} className={PHONE_ICON} />
        )
      ) : null}

      <Divider />

      <AdaptiveButton icon={<Target />} label="Practice" size="lg" from="xl" onClick={onPractice} disabled={recording || rec.state === "saving"} className={PHONE_ICON} />
      <IconButton label="Settings" icon={<Settings />} variant="ghost" size="lg" aria-haspopup="dialog" onClick={() => onOpen("settings")} className={PHONE_ICON} />
    </div>
  );
}
