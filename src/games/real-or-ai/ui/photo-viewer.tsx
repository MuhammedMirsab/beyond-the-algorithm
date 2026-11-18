"use client";

import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import Image from "next/image";
import { animate, useReducedMotion, type AnimationPlaybackControls } from "motion/react";
import { X, ZoomIn, ZoomOut } from "lucide-react";
import {
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import { Button, IconButton } from "@/components/ui/button";
import { ToggleChip } from "@/components/ui/chip";
import { KeyHints } from "@/components/ui/key-hints";
import type { ClueSpot } from "../engine/clues";
import { flipFrom } from "../engine/geometry";
import { photoOn } from "../engine/pairs";
import type { ActiveQuestion, Side } from "../engine/types";
import { CluePins } from "./clue-pins";
import type { Clock } from "./countdown";
import { EASE_OUT, SideBadge, TruthLabel } from "./labels";
import { photoAlt } from "./photo-slot";
import { TimerBar, TimerReadout } from "./round-hud";
import { cn } from "@/lib/cn";

const ZOOM = 2.5;
const TAP_SLOP_PX = 6;
/** Seconds for the photo to fly between the round and the closer look. */
const FLY_IN = 0.42;
const FLY_OUT = 0.34;

/**
 * The closer look: one photo as large as the screen allows, the same crop as
 * in the round so its shape gives nothing away. It flies out of the photo you
 * opened and back into the one you're looking at when it closes. Flip between
 * A and B at the same zoom spot to see what changed (a blink comparator). The
 * round's timer keeps running here; before the answer you can pick from here.
 *
 * The originals are served unresized: re-encoding to a small web size would
 * smooth away exactly the fine grain the hard rounds are about.
 */
export function PhotoViewer({
  open,
  side,
  focus,
  question,
  aspect,
  revealed,
  clock,
  pins,
  originOf,
  onSideChange,
  onPick,
  onClose,
  onClosed,
  finalFocus,
}: {
  open: boolean;
  side: Side;
  /** Zoom into this spot (fractions of the photo) once open: the closer look at a clue. */
  focus: ClueSpot | null;
  question: ActiveQuestion;
  aspect: number;
  revealed: boolean;
  clock: Clock;
  /** Clue spots on the AI photo, shown after the answer. */
  pins: readonly ClueSpot[] | null;
  /** The photo in the round the closer look flies from and back to. */
  originOf: (side: Side) => HTMLElement | null;
  onSideChange: (side: Side) => void;
  /** Present before the answer: pick the photo on show. */
  onPick?: (side: Side) => void;
  onClose: () => void;
  /** After the closing flight, once the round is visible again. */
  onClosed: () => void;
  /** Where focus goes on close. Return true for the default (back to the magnifier). */
  finalFocus: () => HTMLElement | true;
}) {
  // Stays open through the closing flight; Base UI hears about it after.
  const [shown, setShown] = useState(open);
  if (open && !shown) setShown(true);
  const backdropRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);

  return (
    <BaseDialog.Root
      open={shown}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <BaseDialog.Portal>
        <BaseDialog.Backdrop ref={backdropRef} className="fixed inset-0 z-50 bg-sunken opacity-0" />
        <BaseDialog.Popup
          // The portal renders outside GameShell, so the game tokens need their own scope.
          data-game="real-or-ai"
          // Focus starts on the photo, so Space zooms and the arrows flip straight away.
          initialFocus={frameRef}
          finalFocus={() => finalFocus()}
          className="fixed inset-0 z-50 flex flex-col text-fg outline-none pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]"
        >
          <ViewerBody
            side={side}
            focus={focus}
            question={question}
            aspect={aspect}
            revealed={revealed}
            clock={clock}
            pins={pins}
            closing={!open}
            backdropRef={backdropRef}
            onFrame={(el) => {
              frameRef.current = el;
            }}
            originOf={originOf}
            onSideChange={onSideChange}
            onPick={onPick}
            onClosed={() => {
              setShown(false);
              onClosed();
            }}
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
  focus,
  question,
  aspect,
  revealed,
  clock,
  pins,
  closing,
  backdropRef,
  onFrame,
  originOf,
  onSideChange,
  onPick,
  onClosed,
}: {
  side: Side;
  focus: ClueSpot | null;
  question: ActiveQuestion;
  aspect: number;
  revealed: boolean;
  clock: Clock;
  pins: readonly ClueSpot[] | null;
  closing: boolean;
  backdropRef: RefObject<HTMLDivElement | null>;
  /** The photo frame, for the dialog's first focus. */
  onFrame: (el: HTMLDivElement | null) => void;
  originOf: (side: Side) => HTMLElement | null;
  onSideChange: (side: Side) => void;
  onPick?: (side: Side) => void;
  onClosed: () => void;
}) {
  const reduce = useReducedMotion();
  const subject = question.pair.subject;
  const aiSide = question.correctOptionKey;

  const frameRef = useRef<HTMLDivElement | null>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState<Zoom>({ on: false, x: 50, y: 50 });
  const [activePin, setActivePin] = useState<number | null>(null);
  const drag = useRef<{ id: number; startX: number; startY: number; originX: number; originY: number; moved: boolean } | null>(null);

  const chrome = () => [backdropRef.current, topRef.current, bottomRef.current].filter((el): el is HTMLDivElement => el !== null);

  // Fly in from the photo in the round; then, if opened from a clue, zoom into it.
  const flyIn = useEffectEvent((): (() => void) => {
    const frame = frameRef.current;
    const origin = originOf(side);
    const running: AnimationPlaybackControls[] = [animate(chrome(), { opacity: [0, 1] }, { duration: 0.28, ease: EASE_OUT })];
    if (frame && origin && !reduce) {
      // Measure where the frame sits at rest (a flight cut short leaves it moved).
      frame.style.transform = "none";
      const from = flipFrom(origin.getBoundingClientRect(), frame.getBoundingClientRect());
      const radius = parseFloat(getComputedStyle(origin).borderTopLeftRadius) || 20;
      running.push(
        animate(
          frame,
          { x: [from.x, 0], y: [from.y, 0], scale: [from.scale, 1], borderRadius: [`${radius / from.scale}px`, "20px"] },
          { duration: FLY_IN, ease: EASE_OUT },
        ),
      );
    } else if (frame) {
      running.push(animate(frame, { opacity: [0, 1] }, { duration: 0.2 }));
    }
    const zoomIn = focus ? window.setTimeout(() => setZoom({ on: true, x: focus.x * 100, y: focus.y * 100 }), reduce ? 0 : FLY_IN * 1000 - 80) : undefined;
    return () => {
      running.forEach((a) => a.stop());
      window.clearTimeout(zoomIn);
    };
  });

  // Fly back into the photo on show, then let the dialog go.
  const flyOut = useEffectEvent((): (() => void) => {
    const frame = frameRef.current;
    const origin = originOf(side);
    const fade = animate(chrome(), { opacity: 0 }, { duration: reduce ? 0.15 : 0.26, ease: EASE_OUT });
    let flight: AnimationPlaybackControls;
    if (frame && origin && !reduce) {
      const to = flipFrom(origin.getBoundingClientRect(), frame.getBoundingClientRect());
      const radius = parseFloat(getComputedStyle(origin).borderTopLeftRadius) || 20;
      flight = animate(frame, { x: to.x, y: to.y, scale: to.scale, borderRadius: `${radius / to.scale}px` }, { duration: FLY_OUT, ease: EASE_OUT });
    } else {
      flight = frame ? animate(frame, { opacity: 0 }, { duration: 0.15 }) : fade;
    }
    let done = false;
    void flight.finished.then(() => {
      if (!done) onClosed();
    });
    return () => {
      done = true;
      fade.stop();
      flight.stop();
    };
  });

  // Opening flies in; closing flies back. Reopened mid-flight, it flies in again.
  useLayoutEffect(() => (closing ? flyOut() : flyIn()), [closing]);

  // Keys: arrows and A/B flip the photos, Space or Z zooms. Esc is the dialog's own.
  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (k === "ArrowLeft" || k === "a") {
      e.preventDefault();
      onSideChange("A");
    } else if (k === "ArrowRight" || k === "b") {
      e.preventDefault();
      onSideChange("B");
    } else if ((k === " " || k === "z") && !(e.target instanceof HTMLButtonElement)) {
      e.preventDefault();
      setZoom((z) => ({ on: !z.on, x: z.on ? z.x : 50, y: z.on ? z.y : 50 }));
    }
  };

  const pointIn = (e: ReactPointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    return {
      x: clampPct(((e.clientX - box.left) / box.width) * 100),
      y: clampPct(((e.clientY - box.top) / box.height) * 100),
      box,
    };
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || closing) return;
    if (e.target instanceof Element && e.target.closest("button")) return;
    drag.current = { id: e.pointerId, startX: e.clientX, startY: e.clientY, originX: zoom.x, originY: zoom.y, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (d && d.id === e.pointerId && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > TAP_SLOP_PX) d.moved = true;
    if (!zoom.on || closing) return;
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

  // Closing zooms back out while the photo flies home, so it lands as the round shows it.
  const zoomed = zoom.on && !closing;
  const showPins = revealed && side === aiSide && pins !== null && !zoomed;

  return (
    <div className="flex min-h-0 flex-1 flex-col" onKeyDown={onKeyDown}>
      <BaseDialog.Title className="sr-only">Closer look at photo {side}</BaseDialog.Title>

      <div ref={topRef} className="flex shrink-0 flex-col opacity-0">
        {!revealed ? <TimerBar clock={clock} className="rounded-none" /> : <div className="h-1.5" />}
        <div className="flex items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
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
            {!revealed ? <TimerReadout clock={clock} className="mr-1" /> : null}
            <IconButton
              label={zoom.on ? "Zoom out" : "Zoom in"}
              icon={zoom.on ? <ZoomOut /> : <ZoomIn />}
              onClick={() => setZoom((z) => ({ on: !z.on, x: z.on ? z.x : 50, y: z.on ? z.y : 50 }))}
            />
            <BaseDialog.Close render={<IconButton label="Close the closer look" icon={<X />} />} />
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center px-4 pb-3 sm:px-6 lg:px-8">
        <div
          ref={(el) => {
            frameRef.current = el;
            onFrame(el);
          }}
          tabIndex={-1}
          className={cn(
            "relative w-full touch-none select-none overflow-hidden rounded-lg bg-black outline-none will-change-transform",
            zoomed ? "cursor-zoom-out" : "cursor-zoom-in",
          )}
          style={{ aspectRatio: aspect, maxWidth: `calc((100dvh - 11rem) * ${aspect})` }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => {
            drag.current = null;
          }}
        >
          <span className="type-label absolute inset-0 grid place-items-center text-fg-subtle">Loading photo</span>
          <div
            className="absolute inset-0 transition-transform duration-300 ease-out motion-reduce:transition-none"
            style={{ transform: zoomed ? `scale(${ZOOM})` : "none", transformOrigin: `${zoom.x}% ${zoom.y}%` }}
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

          {showPins ? (
            <CluePins
              spots={pins}
              clues={question.pair.aiItem.clues}
              active={activePin}
              onActive={setActivePin}
              onOpen={(i) => setZoom({ on: true, x: pins[i].x * 100, y: pins[i].y * 100 })}
            />
          ) : null}

          <div className="pointer-events-none absolute left-3 top-3 z-[6] flex items-center gap-2 lg:left-4 lg:top-4">
            <SideBadge side={side} />
            {revealed ? <TruthLabel key={side} isReal={photoOn(question, side).isReal} animate={false} /> : null}
          </div>
        </div>
      </div>

      <div ref={bottomRef} className="flex shrink-0 flex-col gap-3 px-4 pb-4 opacity-0 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <KeyHints
          className="hidden pointer-fine:flex"
          items={[
            { keys: ["←", "→"], label: "Switch photo" },
            { keys: ["Space"], label: zoom.on ? "Zoom out" : "Zoom in" },
            { keys: ["Esc"], label: "Close" },
          ]}
        />
        <p className="type-small text-center text-fg-subtle pointer-fine:hidden">Tap the photo to zoom in, then drag to look around.</p>
        {onPick ? (
          <Button variant="game" size="lg" arrow onClick={() => onPick(side)} className="max-lg:w-full">
            Pick photo {side}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
