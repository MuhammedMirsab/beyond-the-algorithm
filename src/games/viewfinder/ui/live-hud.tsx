"use client";

import { Hand, ScanEye, SwitchCamera } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { buttonStyles, IconButton } from "@/components/ui/button";
import { KeyHints } from "@/components/ui/key-hints";
import { POINTS_PER_HAND } from "../engine/gesture";
import type { LensPreview } from "../engine/preview";
import type { EngineSnapshot } from "../engine/store";
import { cn } from "@/lib/cn";
import { KEY_HINTS, coach, formatCount, type CoachKind } from "./copy";
import { FilterStrip } from "./filter-strip";

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

/** A "why no frame yet" nudge waits until it has held this long, so it never flickers. */
const HINT_SETTLE_MS = 900;
/** How long the pinch tip stays up over a frame nobody has pinched yet. */
const PINCH_TIP_MS = 10_000;

/**
 * Everything drawn over the live camera, and nothing more: the camera
 * picture is the show. Top: the one thing to do next, gone once the visitor
 * has made a frame and pinched. Bottom: the filters as live thumbnails, AI
 * view, and (laptops only) the keys. Solid surfaces, never blur.
 */
export function LiveHud({
  snap,
  canFlip,
  onLens,
  onSkeleton,
  onFlip,
  connectPreview,
}: {
  snap: EngineSnapshot;
  canFlip: boolean;
  onLens: (index: number) => void;
  onSkeleton: () => void;
  onFlip: () => void;
  connectPreview: (preview: LensPreview) => () => void;
}) {
  const hint = useSettled(snap.hint, HINT_SETTLE_MS);
  // The pinch tip steps aside after a while even if nobody pinches: the picture comes first.
  const pinchTipDone = useHeldFor(snap.locked && snap.pinches === 0, PINCH_TIP_MS);
  const instruction = coach({
    locked: snap.locked,
    everLocked: snap.everLocked,
    leftHand: snap.leftHand,
    rightHand: snap.rightHand,
    hint,
    pinches: pinchTipDone ? Math.max(1, snap.pinches) : snap.pinches,
    mirror: snap.mirror,
  });

  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center px-4 pt-[calc(env(safe-area-inset-top)+4.75rem)] sm:px-6">
        <AnimatePresence initial={false}>
          {instruction ? (
            <CoachPill
              key="coach"
              text={instruction.text}
              kind={instruction.kind}
              left={snap.leftHand}
              right={snap.rightHand}
            />
          ) : null}
        </AnimatePresence>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6 sm:pb-6 lg:px-8">
        <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
          {/* Laptops only (a fine pointer and room beside the strip): a small corner legend, away from faces. */}
          <div className="hidden justify-self-start xl:pointer-fine:block">
            <KeyHints items={KEY_HINTS} layout="list" className="gap-y-2 rounded-lg bg-surface/85 py-3 pl-3 pr-4 shadow-ring" />
          </div>

          <FilterStrip
            active={snap.lens}
            showName={!snap.locked}
            onLens={onLens}
            connectPreview={connectPreview}
            className="justify-self-center"
          />

          <div className="flex items-center gap-2 justify-self-end max-sm:order-first">
            {canFlip ? <IconButton label="Switch camera" icon={<SwitchCamera />} onClick={onFlip} className="pointer-events-auto" /> : null}
            <AiViewToggle on={snap.skeleton} hands={snap.hands} onToggle={onSkeleton} />
          </div>
        </div>
      </div>
    </>
  );
}

/** True once `on` has stayed true for `ms`; false again as soon as it turns false. */
function useHeldFor(on: boolean, ms: number) {
  const [held, setHeld] = useState(false);
  useEffect(() => {
    if (!on) return;
    const id = window.setTimeout(() => setHeld(true), ms);
    return () => {
      window.clearTimeout(id);
      setHeld(false);
    };
  }, [on, ms]);
  return on && held;
}

/** Returns `value` once it has stayed the same for `ms`; null meanwhile and whenever it is null. */
function useSettled<T>(value: T | null, ms: number): T | null {
  const [settled, setSettled] = useState<T | null>(null);
  useEffect(() => {
    if (value === null) return;
    const id = window.setTimeout(() => setSettled(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return value === null ? null : settled === value ? settled : null;
}

/**
 * The instruction. Two hand marks show what the camera has found so far
 * (screen-left and screen-right hand), so a visitor sees each hand register
 * the moment it comes up. The pinch step shows a pinching glyph instead.
 */
function CoachPill({ text, kind, left, right }: { text: string; kind: CoachKind; left: boolean; right: boolean }) {
  return (
    <motion.div
      className="inline-flex min-h-12 max-w-full items-center gap-3 rounded-[24px] bg-surface/90 py-2 pl-3 pr-5 shadow-ring sm:min-h-14 sm:rounded-full sm:pl-3.5 sm:pr-6"
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8, transition: { duration: 0.2, ease: EASE_OUT } }}
      transition={{ duration: 0.3, ease: EASE_OUT }}
    >
      <span className="grid h-8 shrink-0 place-items-center rounded-full bg-sunken px-2 sm:h-9">
        {kind === "pinch" ? <PinchGlyph /> : <HandMarks left={left} right={right} />}
      </span>
      <span aria-live="polite" aria-atomic className="type-body sm:type-title-3 min-w-0 text-balance font-semibold text-fg sm:truncate">
        <motion.span
          key={text}
          className="block sm:truncate"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.15, ease: EASE_OUT }}
        >
          {text}
        </motion.span>
      </span>
    </motion.div>
  );
}

/** One mark per side of the screen; it fills (with a small pop) when a hand is found there. */
function HandMarks({ left, right }: { left: boolean; right: boolean }) {
  return (
    <span className="flex items-center gap-1.5" role="img" aria-label={handsLabel(left, right)}>
      <HandMark on={left} flip={false} />
      <HandMark on={right} flip />
    </span>
  );
}

const handsLabel = (left: boolean, right: boolean) =>
  left && right ? "Both hands found" : left || right ? "One hand found" : "No hands found yet";

function HandMark({ on, flip }: { on: boolean; flip: boolean }) {
  return (
    <motion.span
      aria-hidden
      className={cn("grid place-items-center transition-colors duration-150 ease-out", on ? "text-game" : "text-fg-faint")}
      animate={{ scale: on ? 1 : 0.84 }}
      transition={on ? { type: "spring", duration: 0.35, bounce: 0.3 } : { duration: 0.15, ease: EASE_OUT }}
    >
      {/* Lucide's hand has its thumb on the left: as drawn it is the screen-right hand, thumb toward the middle. */}
      <Hand className={cn("size-5", flip ? null : "-scale-x-100")} strokeWidth={on ? 2.4 : 2} />
    </motion.span>
  );
}

/** Index finger and thumb meeting, on a loop: the two corner points a pinch brings together. */
function PinchGlyph() {
  return (
    <svg viewBox="0 0 30 20" aria-hidden className="h-5 w-[30px] text-game">
      <path d="M5 10 L23 4" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" />
      <circle cx={23} cy={4} r={2.4} fill="currentColor" />
      <motion.g
        animate={{ rotate: [0, -36, -36, 0] }}
        transition={{ duration: 1.4, times: [0, 0.3, 0.45, 1], ease: EASE_OUT, repeat: Infinity, repeatDelay: 0.6 }}
        style={{ originX: "5px", originY: "10px" }}
      >
        <path d="M5 10 L23 16" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" />
        <circle cx={23} cy={16} r={2.4} fill="currentColor" />
      </motion.g>
    </svg>
  );
}

/**
 * "AI view": every landmark the model places, live. While it is on, the
 * button also says how many points it is tracking right now.
 */
function AiViewToggle({ on, hands, onToggle }: { on: boolean; hands: number; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-keyshortcuts="H"
      onClick={onToggle}
      className={cn(
        buttonStyles({ variant: "secondary", size: "md" }),
        "pointer-events-auto",
        on && "bg-fg text-canvas shadow-none hover:bg-white",
      )}
    >
      <ScanEye />
      <span>AI view</span>
      {on ? (
        <span className="type-label -mr-1 rounded-full bg-canvas/10 px-2 py-0.5 tabular-nums text-canvas/80">
          {formatCount(hands * POINTS_PER_HAND)} points
        </span>
      ) : null}
    </button>
  );
}

