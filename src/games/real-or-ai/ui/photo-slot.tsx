"use client";

import Image from "next/image";
import { motion } from "motion/react";
import { ZoomIn } from "lucide-react";
import { useEffect, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { IconButton } from "@/components/ui/button";
import { ROUND_SIZES } from "../engine/preload";
import type { PairPhoto, Side } from "../engine/types";
import { EASE_IN_OUT, EASE_OUT, PickLabel, SideBadge, TruthLabel } from "./labels";
import { Lens, type LoupeApi } from "./loupe";
import { cn } from "@/lib/cn";

export type LoadStatus = "loading" | "loaded" | "error";

/** Alt text names the scene, never the answer, until the round is over. */
export function photoAlt(side: Side, subject: string, photo: PairPhoto, revealed: boolean): string {
  if (!revealed) return `Photo ${side}: ${subject}`;
  return `Photo ${side}, ${photo.isReal ? "the real photo" : "made by AI"}: ${subject}`;
}

/**
 * The ring that circles the AI photo on the reveal, drawn on like a pen
 * marking the evidence. It sits 9px outside the photo.
 */
function EvidenceRing() {
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute -left-[9px] -top-[9px] z-[3] h-[calc(100%+18px)] w-[calc(100%+18px)] overflow-visible text-game"
    >
      <motion.rect
        x={0}
        y={0}
        width="100%"
        height="100%"
        rx={33}
        fill="none"
        stroke="currentColor"
        strokeWidth={4}
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ pathLength: { duration: 0.65, ease: EASE_IN_OUT }, opacity: { duration: 0.1 } }}
      />
    </svg>
  );
}

/**
 * One of the two big photos in a round. The whole photo is the button; the
 * magnifier button sits beside it (not inside: buttons can't nest). Both
 * photos of a pair share one aspect box and are cropped the same way, so
 * shape never gives the answer away.
 *
 * With a mouse, a lens follows the pointer over the photo (and its twin
 * follows on the other photo). On the reveal the AI photo is circled and
 * stamped, its clue pins land, and the real photo steps back.
 */
export function PhotoSlot({
  side,
  photo,
  subject,
  status,
  revealed,
  picked,
  pickCorrect,
  canChoose,
  lens,
  loupe,
  pins,
  pickCorner = "left",
  slotRef,
  onChoose,
  onZoom,
  onSettle,
}: {
  side: Side;
  photo: PairPhoto;
  subject: string;
  status: LoadStatus;
  /** The answer is showing (after any closer look has closed). */
  revealed: boolean;
  picked: boolean;
  pickCorrect: boolean;
  canChoose: boolean;
  /** Show the hover lens (devices with a mouse). */
  lens: boolean;
  loupe: LoupeApi;
  /** Clue pins, drawn on the AI photo once revealed. */
  pins?: ReactNode;
  /** The bottom corner for "Your pick", clear of the pins. */
  pickCorner?: "left" | "right";
  /** Receives the photo's box: the closer look opens from it and returns to it. */
  slotRef?: (el: HTMLDivElement | null) => void;
  onChoose: (side: Side) => void;
  onZoom: (side: Side) => void;
  onSettle: (side: Side, status: Exclude<LoadStatus, "loading">) => void;
}) {
  const isAi = !photo.isReal;
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const lensRef = useRef<HTMLDivElement | null>(null);
  const glassRef = useRef<HTMLDivElement | null>(null);

  // Hand this photo's lens to the shared controller.
  useEffect(() => {
    const slot = wrapRef.current;
    const lensEl = lensRef.current;
    const glass = glassRef.current;
    if (!lens || !slot || !lensEl || !glass) return;
    loupe.register(side, {
      slot,
      lens: lensEl,
      glass,
      image: photo,
      src: photo.src,
      fallback: () => imgRef.current?.currentSrc || undefined,
    });
    return () => loupe.register(side, null);
  }, [lens, loupe, side, photo]);

  const setCursor = (hidden: boolean) => {
    const button = buttonRef.current;
    if (button) button.style.cursor = hidden ? "none" : "";
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!lens || e.pointerType !== "mouse") return;
    const off = e.target instanceof Element && e.target.closest("[data-loupe-off]");
    if (off || status !== "loaded") {
      loupe.hide();
      setCursor(false);
      return;
    }
    loupe.move(side, e.clientX, e.clientY);
    setCursor(true);
  };

  const onPointerLeave = () => {
    if (!lens) return;
    loupe.hide();
    setCursor(false);
  };

  return (
    <div
      ref={(el) => {
        wrapRef.current = el;
        slotRef?.(el);
      }}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      className={cn(
        "relative aspect-[var(--ratio)] w-full justify-self-center rounded-lg md:rounded-xl",
        // Landscape phones: keep each stacked photo inside the screen.
        "max-w-[calc(max(12rem,100dvh_-_9rem)*var(--ratio))] md:max-w-none",
      )}
    >
      <button
        ref={buttonRef}
        type="button"
        onClick={() => onChoose(side)}
        disabled={!canChoose}
        aria-label={revealed ? photoAlt(side, subject, photo, true) : `Choose photo ${side}`}
        className={cn(
          "absolute inset-0 overflow-hidden rounded-[inherit] bg-sunken",
          // Tailwind 4's scale-* sets the `scale` property, so that's what transitions.
          "transition-[box-shadow,scale] duration-150 ease-out",
          "enabled:cursor-pointer enabled:hover:shadow-[0_0_0_3px_var(--color-fg)] enabled:active:scale-[0.985]",
          "focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-fg",
          "disabled:cursor-default",
        )}
      >
        {status === "loading" ? (
          <span className="type-label absolute inset-0 grid place-items-center text-fg-subtle">Loading photo</span>
        ) : null}
        {status === "error" ? (
          <span className="type-small absolute inset-0 grid place-items-center px-6 text-center text-fg-muted">
            This photo didn&apos;t load. Pick the other one if you can spot it.
          </span>
        ) : null}
        <Image
          ref={imgRef}
          src={photo.src}
          alt={photoAlt(side, subject, photo, revealed)}
          fill
          sizes={ROUND_SIZES}
          loading="eager"
          fetchPriority="high"
          draggable={false}
          onLoad={() => onSettle(side, "loaded")}
          onError={() => onSettle(side, "error")}
          className={cn(
            "pointer-events-none select-none object-cover object-center [-webkit-touch-callout:none]",
            "transition-opacity duration-300 ease-out",
            status === "loaded" ? "opacity-100" : "opacity-0",
          )}
        />
        {/* The real photo steps back so the circled one leads; still clear enough to compare. */}
        {revealed && photo.isReal ? (
          <motion.span
            aria-hidden
            className="absolute inset-0 bg-canvas"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.42 }}
            transition={{ duration: 0.4, ease: EASE_OUT, delay: 0.15 }}
          />
        ) : null}
      </button>

      {revealed && isAi ? <EvidenceRing /> : null}
      {revealed && isAi ? pins : null}

      {lens ? (
        <Lens
          lensRef={(el) => {
            lensRef.current = el;
          }}
          glassRef={(el) => {
            glassRef.current = el;
          }}
        />
      ) : null}

      <div className="pointer-events-none absolute left-3 top-3 z-[6] flex items-center gap-2 lg:left-4 lg:top-4">
        <SideBadge side={side} />
        {revealed ? <TruthLabel isReal={photo.isReal} delay={isAi ? 0.2 : 0.3} /> : null}
      </div>

      <IconButton
        data-loupe-off
        label={`Look closer at photo ${side}`}
        icon={<ZoomIn />}
        onClick={() => onZoom(side)}
        className="absolute right-3 top-3 z-[8] lg:right-4 lg:top-4 lg:size-14 lg:[&_svg]:size-6"
      />

      {revealed && picked ? (
        <motion.div
          className={cn(
            "pointer-events-none absolute bottom-3 z-[6] lg:bottom-4",
            pickCorner === "left" ? "left-3 lg:left-4" : "right-3 lg:right-4",
          )}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: EASE_OUT, delay: 0.35 }}
        >
          <PickLabel correct={pickCorrect} />
        </motion.div>
      ) : null}
    </div>
  );
}
