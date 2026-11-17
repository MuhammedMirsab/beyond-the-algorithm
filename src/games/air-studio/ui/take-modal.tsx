"use client";

import { Circle, Play, Repeat, Square } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { Score } from "@/components/ui/score";
import { fmtTime } from "../engine/music";
import { INSTRUMENT_NAMES } from "../engine/settings";
import type { StudioSession, StudioView } from "../play/session";
import { Metric, OffsetChart, offsetWords, Recommendations } from "./report-bits";

/** "piano", "piano and drums", "piano, drums and guitar". */
export function listWords(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** How far the take has played, drawn straight from the audio clock. */
function TakeProgress({ session, duration }: { session: StudioSession; duration: number }) {
  const bar = useRef<HTMLDivElement>(null);
  const time = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const pos = session.takePosition();
      const p = pos === null || duration <= 0 ? 0 : Math.min(1, pos / duration);
      if (bar.current) bar.current.style.transform = `scaleX(${p})`;
      if (time.current) time.current.textContent = `${fmtTime(pos ?? 0)} / ${fmtTime(duration)}`;
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [session, duration]);
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      <div aria-hidden className="relative h-1.5 w-full overflow-hidden rounded-full bg-fg/10">
        <div ref={bar} className="absolute inset-0 origin-left rounded-full bg-game" style={{ transform: "scaleX(0)" }} />
      </div>
      <span ref={time} className="type-label tabular-nums text-fg-subtle" />
    </div>
  );
}

/**
 * The one take: listen to it, loop it to play along with it, and the
 * report from its own event log. Timing is scored only if a beat played.
 */
export function TakeModal({ session, view, open, onOpenChange }: { session: StudioSession; view: StudioView; open: boolean; onOpenChange: (open: boolean) => void }) {
  const take = view.take;
  if (!take) return null;
  const r = take.report;
  const listening = view.takeMode === "listen";
  const loop = session.takeLoop;
  const instruments = listWords(take.instruments.map((i) => INSTRUMENT_NAMES[i].toLowerCase()));

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Your take"
      description={`${fmtTime(take.duration)} long, ${take.events} ${take.events === 1 ? "note" : "notes"}${instruments ? ` on ${instruments}` : ""}. It stays on this computer until Next player.`}
      size="lg"
      footer={
        <>
          <Button
            variant="ghost"
            icon={<Circle className="fill-current" />}
            onClick={() => {
              onOpenChange(false);
              void session.record();
            }}
          >
            Record again
          </Button>
          <Button
            variant="game"
            icon={<Repeat />}
            onClick={() => {
              void session.playTake("loop");
              onOpenChange(false);
            }}
          >
            Play along with it
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-8">
        <div className="flex items-center gap-4 rounded-lg bg-surface p-4 shadow-ring">
          <Button
            variant="secondary"
            size="lg"
            icon={listening ? <Square className="fill-current" /> : <Play className="fill-current" />}
            onClick={() => (listening ? session.stopTake() : void session.playTake("listen"))}
          >
            {listening ? "Stop" : "Listen"}
          </Button>
          <TakeProgress session={session} duration={take.duration} />
        </div>
        {loop?.bars ? (
          <p className="type-small -mt-4 text-fg-subtle">
            Play along with it and it repeats every {loop.bars === 1 ? "bar" : `${loop.bars} bars`}, in time with the beat you recorded to.
          </p>
        ) : null}

        {take.gridded && r.overall !== null ? (
          <div className="grid items-end gap-6 sm:grid-cols-[auto_minmax(0,1fr)]">
            <Score value={r.overall} label="Timing score" tone="game" animated={false} />
            <div className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-3">
              <Metric label="Close to the beat" value={r.timingAccuracy === null ? null : `${r.timingAccuracy}%`} />
              <Metric label="Steadiness" value={r.rhythmConsistency === null ? null : `${r.rhythmConsistency}%`} />
              <Metric label="On average" value={offsetWords(r.meanOffsetMs)} />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-3">
            <Metric label="Notes played" value={String(r.events)} />
            <Metric label="Timing score" value={null} />
            <Metric label="Accidental notes" value={String(r.accidental)} />
          </div>
        )}
        {r.notes.map((n) => (
          <p key={n} className="type-body -mt-2 text-fg-muted">
            {n}
          </p>
        ))}
        {take.gridded ? <OffsetChart offsets={r.offsets} window={40} /> : null}
        <Recommendations items={r.recommendations} />
      </div>
    </Modal>
  );
}
