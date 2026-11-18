"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useLayoutEffect, useRef } from "react";
import { cn } from "@/lib/cn";
import { LENSES } from "../engine/lenses";
import { LensPreview, type PreviewCell } from "../engine/preview";

/** Thumbnail corner radius (rounded-sm). The strip's own radius is this plus its padding. */
const THUMB_RADIUS = 10;
/** Gap between a thumbnail and the ring around the chosen one. */
const RING_GAP = 3;

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

/** Puts the ring around a thumbnail. It slides there once it has been placed the first time. */
function placeRing(ring: HTMLElement | null, item: HTMLElement | null | undefined) {
  if (!ring || !item) return;
  ring.style.width = `${item.offsetWidth + RING_GAP * 2}px`;
  ring.style.height = `${item.offsetHeight + RING_GAP * 2}px`;
  ring.style.transform = `translate(${item.offsetLeft - RING_GAP}px, ${item.offsetTop - RING_GAP}px)`;
  ring.style.opacity = "1";
  // Only slide after the first placement, so the ring never flies in from the corner.
  requestAnimationFrame(() => ring.setAttribute("data-placed", "true"));
}

/**
 * The filter picker, camera-app style: every filter as a live thumbnail of
 * the visitor's own picture, the chosen one ringed. No descriptions: the
 * thumbnails show what each filter does. The chosen filter's name sits above
 * the strip only while there is no frame (with a frame up, the name rides
 * the frame itself).
 *
 * The thumbnails are one WebGL canvas behind the buttons, drawn by the
 * engine from the same camera frames as the main view (see LensPreview).
 * The canvas is created here, fresh for every mount, because a released
 * WebGL context can't be used again (and StrictMode mounts twice).
 * One ring slides to the chosen thumbnail. Scrolls sideways on narrow
 * screens, keeping the chosen filter in view.
 */
export function FilterStrip({
  active,
  showName,
  onLens,
  connectPreview,
  className,
}: {
  active: number;
  showName: boolean;
  onLens: (index: number) => void;
  /** Hands the thumbnail renderer to the engine; returns the disconnect. */
  connectPreview: (preview: LensPreview) => () => void;
  className?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLSpanElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const activeRef = useRef(active);
  const reduceMotion = useReducedMotion();
  const placed = useRef(false);

  useLayoutEffect(() => {
    activeRef.current = active;
    placeRing(ringRef.current, itemRefs.current[active]);
  }, [active]);

  // The live thumbnails (and the ring, whenever the layout changes).
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    canvas.className = "pointer-events-none absolute inset-0 z-[1] size-full";
    track.appendChild(canvas);

    let preview: LensPreview | null = null;
    try {
      preview = new LensPreview(canvas);
    } catch (err) {
      console.warn("[viewfinder] filter previews unavailable", err);
    }

    const layout = () => {
      placeRing(ringRef.current, itemRefs.current[activeRef.current]);
      if (!preview) return;
      const cells: PreviewCell[] = itemRefs.current.map((el) =>
        el ? { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight } : { x: 0, y: 0, w: 0, h: 0 },
      );
      preview.setLayout({ cells, width: track.offsetWidth, height: track.offsetHeight, radius: THUMB_RADIUS }, window.devicePixelRatio || 1);
    };
    layout();
    const observer = new ResizeObserver(layout);
    observer.observe(track);
    const disconnect = preview ? connectPreview(preview) : () => {};

    return () => {
      observer.disconnect();
      disconnect();
      preview?.dispose();
      canvas.remove();
    };
  }, [connectPreview]);

  // Keep the chosen filter in view where the strip scrolls (phones).
  useEffect(() => {
    const list = scrollRef.current;
    const item = itemRefs.current[active];
    if (!list || !item || list.scrollWidth <= list.clientWidth) return;
    const left = item.offsetLeft - (list.clientWidth - item.offsetWidth) / 2;
    // First placement is instant; later changes glide unless motion is reduced.
    list.scrollTo({ left, behavior: placed.current && !reduceMotion ? "smooth" : "auto" });
    placed.current = true;
  }, [active, reduceMotion]);

  const current = LENSES[active];

  return (
    <div className={cn("flex min-w-0 max-w-full flex-col items-center gap-2", className)}>
      <p aria-live="polite" aria-atomic className="flex h-6 items-center">
        <span className="sr-only">Filter: {current.name}</span>
        <AnimatePresence initial={false} mode="popLayout">
          {showName ? (
            <motion.span
              key={current.id}
              aria-hidden
              className="rounded-full bg-surface/85 px-3 py-0.5 text-[0.9375rem] font-semibold text-fg shadow-ring"
              initial={{ opacity: 0, y: 3 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: { duration: 0.12 } }}
              transition={{ duration: 0.15, ease: EASE_OUT }}
            >
              {current.name}
            </motion.span>
          ) : null}
        </AnimatePresence>
      </p>

      <div
        ref={scrollRef}
        className="pointer-events-auto no-scrollbar max-w-full overflow-x-auto overscroll-x-contain rounded-[16px] bg-surface/85 shadow-ring"
      >
        <div ref={trackRef} role="group" aria-label="Filters" className="relative flex w-max gap-1.5 p-1.5">
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
                aria-label={lens.name}
                title={lens.name}
                onClick={() => onLens(i)}
                // No press scale here: a transform would lift the button above the thumbnail canvas.
                className="group/thumb relative size-11 shrink-0 select-none rounded-sm bg-sunken focus-visible:outline-none sm:size-12"
              >
                {/* Shown only until the live thumbnail arrives (or if WebGL can't draw it). */}
                <span aria-hidden className="absolute inset-0 grid place-items-center">
                  <span className="size-2 rounded-full opacity-70" style={{ backgroundColor: lens.accent }} />
                </span>
                {/* Above the canvas: unchosen thumbnails sit back a little; hover and focus bring them forward. */}
                <span
                  aria-hidden
                  className={cn(
                    "absolute inset-0 z-[2] rounded-sm transition-colors duration-150 ease-out",
                    on ? "bg-black/0" : "bg-black/35 group-hover/thumb:bg-black/0 group-focus-visible/thumb:bg-black/0",
                  )}
                />
                <span
                  aria-hidden
                  className="absolute -inset-[3px] z-[2] rounded-[13px] opacity-0 ring-2 ring-fg/45 transition-opacity duration-150 ease-out group-focus-visible/thumb:opacity-100"
                />
              </button>
            );
          })}
          <span
            ref={ringRef}
            aria-hidden
            className={cn(
              "pointer-events-none absolute left-0 top-0 z-[3] rounded-[13px] opacity-0 ring-2 ring-fg",
              "data-[placed=true]:transition-transform data-[placed=true]:duration-300 data-[placed=true]:ease-[var(--ease-out)] motion-reduce:transition-none",
            )}
          />
        </div>
      </div>
    </div>
  );
}
