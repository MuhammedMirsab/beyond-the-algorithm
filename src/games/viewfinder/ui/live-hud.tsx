"use client";

import {
  ChevronLeft,
  ChevronRight,
  Gauge,
  ScanEye,
  SwitchCamera,
  TrianglesCenterlineDashedVertical,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, type ReactNode } from "react";
import { IconButton } from "@/components/ui/button";
import { Kbd } from "@/components/ui/surface";
import { cn } from "@/lib/cn";
import { LENSES, LENS_COUNT, lensKey } from "../engine/lenses";
import type { EngineSnapshot } from "../engine/store";
import { pinchHint, pointsReadout, statsReadout, statusText } from "./copy";

/**
 * Everything drawn over the live camera. Solid surfaces only (bg-surface/90
 * pills with the hairline ring), never blur: the video is the show.
 * Top: what to do next. Bottom: which lens, the lens picker, view toggles.
 */
export function LiveHud({
  snap,
  showStats,
  canFlip,
  onLens,
  onStep,
  onMirror,
  onSkeleton,
  onStats,
  onFlip,
}: {
  snap: EngineSnapshot;
  showStats: boolean;
  canFlip: boolean;
  onLens: (index: number) => void;
  onStep: (delta: number) => void;
  onMirror: () => void;
  onSkeleton: () => void;
  onStats: () => void;
  onFlip: () => void;
}) {
  const hint = pinchHint(snap);
  const benchTitle = snap.bench
    ? `Startup test on this device: GPU ${fmtMs(snap.bench.GPU)}, CPU ${fmtMs(snap.bench.CPU)}. The faster one runs the model.`
    : undefined;

  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col items-center gap-2 px-4 pt-[calc(env(safe-area-inset-top)+4.5rem)] sm:px-6">
        <StatusChip locked={snap.locked} hands={snap.hands} />
        {hint ? <Pill className="type-small min-h-9 px-4 py-1.5 text-fg">{hint}</Pill> : null}
        {snap.skeleton ? (
          <Pill className="type-label min-h-8 px-3 py-1.5 text-fg-muted">{pointsReadout(snap.hands)}</Pill>
        ) : null}
        {showStats ? (
          <Pill className="type-label min-h-8 px-3 py-1.5 tabular-nums text-fg-muted" title={benchTitle}>
            {statsReadout(snap)}
          </Pill>
        ) : null}
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col items-center gap-3 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6 sm:pb-6 lg:px-8 lg:pb-8">
        <LensReadout index={snap.lens} />
        <LensPicker active={snap.lens} onLens={onLens} onStep={onStep} />
        <div className="flex max-w-full flex-wrap items-center justify-center gap-3">
          <div role="group" aria-label="View" className="pointer-events-auto flex items-center gap-2">
            <IconButton
              label="Mirror the picture"
              icon={<TrianglesCenterlineDashedVertical />}
              pressed={snap.mirror}
              onClick={onMirror}
              aria-keyshortcuts="M"
              className={TOGGLE}
            />
            <IconButton
              label="Show what the AI sees"
              icon={<ScanEye />}
              pressed={snap.skeleton}
              onClick={onSkeleton}
              aria-keyshortcuts="H"
              className={TOGGLE}
            />
            <IconButton label="Show stats" icon={<Gauge />} pressed={showStats} onClick={onStats} className={TOGGLE} />
            {canFlip ? <IconButton label="Switch camera" icon={<SwitchCamera />} onClick={onFlip} /> : null}
          </div>
          <KeyLegend />
        </div>
      </div>
    </>
  );
}

/** Pressed toggles turn solid white, like a pressed ToggleChip. */
const TOGGLE = "aria-pressed:bg-fg aria-pressed:text-canvas aria-pressed:shadow-none aria-pressed:hover:bg-white";

const fmtMs = (ms: number | null) => (ms == null ? "not available" : `${ms.toFixed(1)} ms`);

/** A solid readout over the video. Wraps (balanced) rather than clipping on narrow phones. */
function Pill({ className, children, title }: { className?: string; children: ReactNode; title?: string }) {
  return (
    <div
      title={title}
      className={cn(
        "inline-flex max-w-full items-center justify-center text-balance rounded-full bg-surface/90 text-center shadow-ring",
        title && "pointer-events-auto",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** What to do next. Announced politely; the new line fades in over 150ms. */
function StatusChip({ locked, hands }: { locked: boolean; hands: number }) {
  const text = statusText({ locked, hands });
  return (
    <div className="inline-flex h-11 max-w-full items-center gap-2.5 rounded-full bg-surface/90 pl-4 pr-5 shadow-ring sm:h-13 sm:gap-3 sm:pl-5 sm:pr-6">
      <span
        aria-hidden
        className={cn(
          "size-2.5 shrink-0 rounded-full transition-colors duration-150 ease-out",
          locked ? "bg-game" : hands > 0 ? "bg-fg-muted" : "bg-fg-subtle",
        )}
      />
      <span aria-live="polite" aria-atomic className="type-body sm:type-title-3 min-w-0 truncate font-semibold text-fg">
        <motion.span
          key={text}
          className="block truncate"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
        >
          {text}
        </motion.span>
      </span>
    </div>
  );
}

/**
 * "Halftone · 1 of 10" and, from tablet width up, what the lens does to the
 * pixels. On very short screens (landscape phones) it stays for screen
 * readers only, so the top and bottom of the HUD never meet; the active
 * lens is still visible in the picker.
 */
function LensReadout({ index }: { index: number }) {
  const lens = LENSES[index];
  return (
    <div className="flex max-w-full flex-col items-center gap-0.5 rounded-lg bg-surface/90 px-5 py-2.5 text-center shadow-ring [@media(max-height:31rem)]:sr-only">
      <p aria-live="polite" aria-atomic className="flex items-baseline gap-2">
        <motion.span
          key={lens.id}
          className="type-title-3 text-fg"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
        >
          {lens.name}
        </motion.span>
        <span aria-hidden className="type-label text-fg-subtle">
          ·
        </span>
        <span className="type-label tabular-nums text-fg-subtle">
          {index + 1} of {LENS_COUNT}
        </span>
      </p>
      <p className="type-small hidden max-w-[34rem] text-fg-muted sm:block">{lens.blurb}</p>
    </div>
  );
}

/**
 * Ten lenses as one segmented row (the Segmented look, sized for ten).
 * Scrolls sideways on narrow screens and keeps the active lens centred.
 */
function LensPicker({
  active,
  onLens,
  onStep,
}: {
  active: number;
  onLens: (index: number) => void;
  onStep: (delta: number) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const reduceMotion = useReducedMotion();
  const placed = useRef(false);

  useEffect(() => {
    const list = listRef.current;
    const item = itemRefs.current[active];
    if (!list || !item) return;
    const left = item.offsetLeft - (list.clientWidth - item.offsetWidth) / 2;
    // First placement is instant; later lens changes glide unless motion is reduced.
    list.scrollTo({ left, behavior: placed.current && !reduceMotion ? "smooth" : "auto" });
    placed.current = true;
  }, [active, reduceMotion]);

  return (
    <div className="pointer-events-auto flex max-w-full items-center gap-2">
      <IconButton label="Previous lens" icon={<ChevronLeft />} onClick={() => onStep(-1)} aria-keyshortcuts="ArrowLeft" />
      <div
        ref={listRef}
        role="group"
        aria-label="Lenses"
        className="no-scrollbar relative flex min-w-0 snap-x items-center gap-1 overflow-x-auto rounded-full bg-surface/90 p-1 shadow-ring"
      >
        {LENSES.map((lens, i) => {
          const on = i === active;
          return (
            <button
              key={lens.id}
              ref={(el) => {
                itemRefs.current[i] = el;
              }}
              type="button"
              aria-pressed={on}
              aria-keyshortcuts={lensKey(i)}
              onClick={() => onLens(i)}
              className={cn(
                "h-11 shrink-0 snap-center select-none whitespace-nowrap rounded-full px-4 text-[0.9375rem] font-semibold",
                "transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.97]",
                "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-fg",
                on ? "bg-fg text-canvas focus-visible:outline-canvas" : "text-fg-muted hover:bg-fg/[0.08] hover:text-fg",
              )}
            >
              {lens.name}
            </button>
          );
        })}
      </div>
      <IconButton label="Next lens" icon={<ChevronRight />} onClick={() => onStep(1)} aria-keyshortcuts="ArrowRight" />
    </div>
  );
}

/** Keyboard shortcuts, only where there is a keyboard and room: wide screens with a fine pointer. */
function KeyLegend() {
  return (
    <div className="type-small hidden h-11 items-center gap-5 rounded-full bg-surface/90 px-4 text-fg-muted shadow-ring lg:pointer-fine:flex">
      <span className="inline-flex items-center gap-1.5">
        <Kbd>1</Kbd>
        <span>to</span>
        <Kbd>0</Kbd>
        <Kbd aria-label="Left arrow">←</Kbd>
        <Kbd aria-label="Right arrow">→</Kbd>
        <span className="ml-0.5">Lens</span>
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Kbd>M</Kbd>
        <span>Mirror</span>
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Kbd>H</Kbd>
        <span>What the AI sees</span>
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Kbd>F</Kbd>
        <span>Full screen</span>
      </span>
    </div>
  );
}
