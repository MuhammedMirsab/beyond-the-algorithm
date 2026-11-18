"use client";

import { motion } from "motion/react";
import { notesFor, numberSide, spotInBox, type ClueSpot } from "../engine/clues";
import type { ComparisonPair } from "../engine/types";
import { SPRING_POP } from "./labels";
import { cn } from "@/lib/cn";

/** Where the pair's clues sit on the AI photo as the round shows it (fractions of the photo box), or null if the pair has no notes. */
export function pinSpots(pair: ComparisonPair, aspect: number): ClueSpot[] | null {
  const notes = notesFor(pair);
  return notes ? notes.map((note) => spotInBox(note.spot, pair.aiItem, aspect)) : null;
}

/**
 * Numbered rings on the AI photo, one per clue, so "what gives it away" points
 * at the photo itself. A ring circles the spot without covering it; its
 * number sits on the side with room. Hover or focus links a pin with its line
 * in the clue list; clicking opens the closer look, zoomed in on that spot.
 */
export function CluePins({
  spots,
  clues,
  active,
  onActive,
  onOpen,
  delay = 0,
  compact = false,
}: {
  spots: readonly ClueSpot[];
  clues: readonly string[];
  active: number | null;
  onActive: (index: number | null) => void;
  onOpen?: (index: number) => void;
  /** Seconds before the first pin lands. */
  delay?: number;
  /** Smaller rings, for small photos. */
  compact?: boolean;
}) {
  return (
    <div className="pointer-events-none absolute inset-0 z-[7] overflow-hidden rounded-[inherit]">
      {spots.map((spot, i) => {
        const { dx, dy } = numberSide(spot);
        const on = active === i;
        return (
          <button
            key={i}
            type="button"
            data-loupe-off={onOpen ? undefined : true}
            aria-label={`Clue ${i + 1}: ${clues[i] ?? ""}${onOpen ? " Look closer." : ""}`}
            tabIndex={onOpen ? 0 : -1}
            onPointerEnter={() => onActive(i)}
            onPointerLeave={() => onActive(null)}
            onFocus={() => onActive(i)}
            onBlur={() => onActive(null)}
            onClick={() => onOpen?.(i)}
            className={cn(
              "absolute -translate-x-1/2 -translate-y-1/2 rounded-full outline-none",
              onOpen ? "pointer-events-auto cursor-zoom-in focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-fg" : "pointer-events-none",
            )}
            style={{ left: `${spot.x * 100}%`, top: `${spot.y * 100}%` }}
          >
            <motion.span
              aria-hidden
              className="block"
              initial={{ scale: 2.2, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", duration: 0.5, bounce: 0.2, delay: delay + i * 0.14, opacity: { duration: 0.15, delay: delay + i * 0.14 } }}
            >
              <span
                className={cn(
                  "block rounded-full ring-white transition-[scale,background-color] duration-150 ease-out",
                  "shadow-[0_0_0_4.5px_oklch(0_0_0/0.4),inset_0_0_0_1.5px_oklch(0_0_0/0.3)]",
                  compact ? "size-8 ring-2" : "size-11 ring-[2.5px] lg:size-12",
                  on ? "scale-[1.18] bg-white/15" : "scale-100 bg-transparent",
                )}
              />
            </motion.span>
            <motion.span
              aria-hidden
              className="absolute"
              style={{
                left: `calc(50% + ${dx} * ${compact ? 14 : 22}px)`,
                top: `calc(50% + ${dy} * ${compact ? 14 : 22}px)`,
                translate: "-50% -50%",
              }}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ ...SPRING_POP, delay: delay + i * 0.14 + 0.12 }}
            >
              <span
                className={cn(
                  "grid place-items-center rounded-full bg-game font-mono font-semibold tabular-nums text-game-ink shadow-[0_2px_8px_oklch(0_0_0/0.45)]",
                  "transition-[scale] duration-150 ease-out",
                  compact ? "size-5 text-[0.6875rem]" : "size-6 text-[0.75rem] lg:size-7 lg:text-[0.8125rem]",
                  on ? "scale-[1.15]" : "scale-100",
                )}
              >
                {i + 1}
              </span>
            </motion.span>
          </button>
        );
      })}
    </div>
  );
}
