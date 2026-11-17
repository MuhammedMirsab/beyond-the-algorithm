"use client";

import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import Image from "next/image";
import { X, ZoomIn, ZoomOut } from "lucide-react";
import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { IconButton } from "@/components/ui/button";
import { ToggleChip } from "@/components/ui/chip";
import { Kbd } from "@/components/ui/surface";
import type { TimerState } from "../engine/timer";
import type { ActiveQuestion, Side } from "../engine/types";
import { photoOn } from "../engine/pairs";
import { SideBadge, TruthLabel } from "./labels";
import { photoAlt } from "./photo-slot";
import { TimerBar, TimerReadout } from "./round-hud";
import { cn } from "@/lib/cn";

const ZOOM = 2.5;
const TAP_SLOP_PX = 6;

/**
 * The closer look: one photo as large as the screen allows, the same crop as
 * in the round so its shape gives nothing away. Flip between A and B at the
 * same zoom spot to see what changed. The round's timer keeps running here,
 * and answering is off until it closes (Esc, the close button, or time up).
 *
 * The originals are served unresized here: re-encoding to a small web size
 * would smooth away exactly the fine grain the hard rounds are about.
 */
export function PhotoViewer({
  open,
  side,
  question,
  aspect,
  revealed,
  timer,
  onSideChange,
  onClose,
  finalFocus,
}: {
  open: boolean;
  side: Side;
  question: ActiveQuestion;
  aspect: number;
  revealed: boolean;
  timer: TimerState;
  onSideChange: (side: Side) => void;
  onClose: () => void;
  /** Where focus goes on close. Return true for the default (back to the magnifier). */
  finalFocus: () => HTMLElement | true;
}) {
  return (
    <BaseDialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <BaseDialog.Portal>
        <BaseDialog.Backdrop
          className={cn(
            "fixed inset-0 z-50 bg-black/70",
            "transition-opacity duration-250 ease-out data-[ending-style]:duration-150 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0",
          )}
        />
        <BaseDialog.Popup
          // The portal renders outside GameShell, so the game tokens need their own scope.
          data-game="real-or-ai"
          finalFocus={() => finalFocus()}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") {
              e.preventDefault();
              onSideChange("A");
            } else if (e.key === "ArrowRight") {
              e.preventDefault();
              onSideChange("B");
            }
          }}
          className={cn(
            "fixed inset-0 z-50 flex flex-col bg-sunken text-fg outline-none",
            "pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]",
            "transition-[opacity,scale] duration-250 ease-out data-[ending-style]:duration-150",
            "data-[ending-style]:scale-[0.96] data-[ending-style]:opacity-0 data-[starting-style]:scale-[0.96] data-[starting-style]:opacity-0",
          )}
        >
          <ViewerBody
            side={side}
            question={question}
            aspect={aspect}
            revealed={revealed}
            timer={timer}
            onSideChange={onSideChange}
          />
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}

interface Zoom {
  on: boolean;
  /** transform-origin, in % of the photo box. */
  x: number;
  y: number;
}

const clampPct = (v: number) => Math.min(100, Math.max(0, v));

function ViewerBody({
  side,
  question,
  aspect,
  revealed,
  timer,
  onSideChange,
}: {
  side: Side;
  question: ActiveQuestion;
  aspect: number;
  revealed: boolean;
  timer: TimerState;
  onSideChange: (side: Side) => void;
}) {
  const [zoom, setZoom] = useState<Zoom>({ on: false, x: 50, y: 50 });
  const drag = useRef<{ id: number; startX: number; startY: number; originX: number; originY: number; moved: boolean } | null>(null);
  const subject = question.pair.subject;

  const pointIn = (e: ReactPointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    return {
      x: clampPct(((e.clientX - box.left) / box.width) * 100),
      y: clampPct(((e.clientY - box.top) / box.height) * 100),
      box,
    };
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    drag.current = { id: e.pointerId, startX: e.clientX, startY: e.clientY, originX: zoom.x, originY: zoom.y, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (d && d.id === e.pointerId && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > TAP_SLOP_PX) d.moved = true;
    if (!zoom.on) return;
    const { x, y, box } = pointIn(e);
    if (e.pointerType === "mouse") {
      // A lens: the spot under the cursor stays under the cursor.
      setZoom({ on: true, x, y });
    } else if (d && d.id === e.pointerId) {
      // Touch and pen drag the photo along with the finger.
      const dx = ((e.clientX - d.startX) / box.width) * 100;
      const dy = ((e.clientY - d.startY) / box.height) * 100;
      setZoom({ on: true, x: clampPct(d.originX - dx / (ZOOM - 1)), y: clampPct(d.originY - dy / (ZOOM - 1)) });
    }
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.id !== e.pointerId || d.moved) return;
    const { x, y } = pointIn(e);
    setZoom((z) => (z.on ? { ...z, on: false } : { on: true, x, y }));
  };

  return (
    <>
      <BaseDialog.Title className="sr-only">Closer look at photo {side}</BaseDialog.Title>
      {!revealed ? <TimerBar timer={timer} mode="running" className="rounded-none" /> : null}

      <div className="flex shrink-0 items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
        {/* Toggle buttons rather than tabs: tabs would take the arrow keys that flip the photos. */}
        <div role="group" aria-label="Photo to show" className="flex items-center gap-2">
          {(["A", "B"] as const).map((s) => (
            <ToggleChip key={s} pressed={side === s} onClick={() => onSideChange(s)}>
              {/* "Photo A" from 640px; just "A" on phones so the bar fits at 375px. */}
              <span className="max-sm:sr-only">Photo</span>
              {s}
            </ToggleChip>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {!revealed ? <TimerReadout timer={timer} mode="running" className="mr-1" /> : null}
          <IconButton
            label={zoom.on ? "Zoom out" : "Zoom in"}
            icon={zoom.on ? <ZoomOut /> : <ZoomIn />}
            onClick={() => setZoom((z) => ({ on: !z.on, x: z.on ? z.x : 50, y: z.on ? z.y : 50 }))}
          />
          <BaseDialog.Close render={<IconButton label="Close the closer look" icon={<X />} />} />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center px-4 pb-3 sm:px-6 lg:px-8">
        <div
          className={cn(
            "relative w-full touch-none select-none overflow-hidden rounded-lg bg-black",
            zoom.on ? "cursor-zoom-out" : "cursor-zoom-in",
          )}
          style={{ aspectRatio: aspect, maxWidth: `calc((100dvh - 9.5rem) * ${aspect})` }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => {
            drag.current = null;
          }}
        >
          <span className="type-label absolute inset-0 grid place-items-center text-fg-subtle">Loading photo</span>
          <div
            className="absolute inset-0 transition-transform duration-200 ease-out motion-reduce:transition-none"
            style={{ transform: zoom.on ? `scale(${ZOOM})` : "none", transformOrigin: `${zoom.x}% ${zoom.y}%` }}
          >
            {(["A", "B"] as const).map((s) => {
              const photo = photoOn(question, s);
              return (
                <Image
                  key={s}
                  src={photo.src}
                  alt={photoAlt(s, subject, photo, revealed)}
                  fill
                  unoptimized
                  loading="eager"
                  draggable={false}
                  // Both stay decoded so flipping A and B is instant, like a blink comparator.
                  className={cn(
                    "pointer-events-none select-none object-cover object-center [-webkit-touch-callout:none]",
                    s === side ? "visible" : "invisible",
                  )}
                />
              );
            })}
          </div>

          <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2 lg:left-4 lg:top-4">
            <SideBadge side={side} />
            {revealed ? <TruthLabel key={side} isReal={photoOn(question, side).isReal} animate={false} /> : null}
          </div>
        </div>
      </div>

      <p className="type-small hidden shrink-0 items-center justify-center gap-2 px-4 pb-4 text-fg-subtle lg:flex">
        Click the photo to zoom in.
        <span className="inline-flex items-center gap-1">
          <Kbd>←</Kbd>
          <Kbd>→</Kbd>
        </span>
        switch photos,
        <Kbd>Esc</Kbd>
        closes.
      </p>
      <p className="type-small shrink-0 px-4 pb-4 text-center text-fg-subtle lg:hidden">
        Tap the photo to zoom in, then drag to look around.
      </p>
    </>
  );
}
