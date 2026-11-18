"use client";

import { Circle, Play, Repeat, Square } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { Score } from "@/components/ui/score";
import { fmtTime } from "../engine/music";
import { INSTRUMENT_NAMES } from "../engine/settings";
import type { StudioSession, StudioView, TakeInfo } from "../play/session";
import { cn } from "@/lib/cn";
import { Metric, OffsetChart, offsetWords, Recommendations } from "./report-bits";

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

/** "piano", "piano and drums", "piano, drums and guitar". */
export function listWords(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** The take's loudness as bars, a mark for every note, and a playhead from the audio clock. */
function TakeWave({ session, take }: { session: StudioSession; take: TakeInfo }) {
  const lit = useRef<HTMLDivElement>(null);
  const head = useRef<HTMLDivElement>(null);
  const time = useRef<HTMLSpanElement>(null);
  const duration = take.duration;
  useEffect(() => {
    let raf = 0;
    let shown = -1;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const pos = session.takePosition();
      const p = pos === null || duration <= 0 ? 0 : Math.min(1, pos / duration);
      if (Math.abs(p - shown) < 0.001) return;
      shown = p;
      if (lit.current) lit.current.style.clipPath = `inset(0 ${(1 - p) * 100}% 0 0)`;
      if (head.current) {
        head.current.style.transform = `translateX(${p * 100}%)`;
        head.current.style.opacity = pos === null || p === 0 ? "0" : "1";
      }
      if (time.current) time.current.textContent = `${fmtTime(pos ?? 0)} / ${fmtTime(duration)}`;
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [session, duration]);

  const n = take.peaks.length || 1;
  const bars = (className: string) => (
    <svg viewBox={`0 0 ${n * 4} 60`} preserveAspectRatio="none" className={cn("absolute inset-0 size-full", className)} aria-hidden>
      {take.peaks.map((v, i) => {
        const h = Math.max(2, v * 56);
        return <rect key={i} x={i * 4 + 0.6} y={30 - h / 2} width={2.8} height={h} rx={1.2} />;
      })}
    </svg>
  );
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      <motion.div
        initial={{ clipPath: "inset(0 100% 0 0)" }}
        animate={{ clipPath: "inset(0 0% 0 0)", transition: { duration: 0.7, ease: EASE_OUT } }}
        className="relative h-16 w-full"
      >
        {bars("fill-fg/25")}
        <div ref={lit} className="absolute inset-0" style={{ clipPath: "inset(0 100% 0 0)" }}>
          {bars("fill-game")}
        </div>
        {/* A tick under the wave for every note, hit or strum. */}
        <div aria-hidden className="absolute inset-x-0 -bottom-2 h-1.5">
          {take.marks.map((m, i) => (
            <span key={i} className="absolute top-0 h-1.5 w-[3px] -translate-x-1/2 rounded-full bg-game/70" style={{ left: `${Math.min(100, (m.t / Math.max(0.01, duration)) * 100)}%` }} />
          ))}
        </div>
        <div ref={head} aria-hidden className="pointer-events-none absolute inset-y-[-6px] left-0 w-full opacity-0" style={{ transform: "translateX(0%)" }}>
          <span className="absolute inset-y-0 left-0 w-0.5 -translate-x-1/2 rounded-full bg-fg" />
        </div>
      </motion.div>
      <span ref={time} className="type-label pt-1.5 tabular-nums text-fg-subtle">
        {`0:00 / ${fmtTime(duration)}`}
      </span>
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
          <TakeWave session={session} take={take} />
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
