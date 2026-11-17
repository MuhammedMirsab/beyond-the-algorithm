"use client";

import { motion } from "motion/react";
import type { InkImage } from "../engine/exportImage";
import type { LetterBox } from "../engine/letters";
import { cn } from "@/lib/cn";

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

function describe(boxes: LetterBox[]): string {
  if (!boxes.length) return "Your writing";
  const letters = boxes.length === 1 ? "1 letter" : `${boxes.length} letters`;
  const chars = boxes.every((b) => b.char) ? `: ${boxes.map((b) => b.char).join(", ")}` : "";
  return `Your writing, split into ${letters}${chars}`;
}

/**
 * The ink as the recogniser saw it: one dashed box per letter it found, each
 * tagged with what it was read as. Boxes appear only once there is a result.
 */
export function InkFigure({ ink, boxes = [], compact = false, className }: { ink: InkImage; boxes?: LetterBox[]; compact?: boolean; className?: string }) {
  return (
    <div className={cn("dot-field grid place-items-center bg-sunken", compact ? "h-36 p-3" : "min-h-40 rounded-lg p-6 sm:min-h-56", className)}>
      <div className="relative inline-block max-w-full">
        {/* eslint-disable-next-line @next/next/no-img-element -- a local data URL, nothing to optimise */}
        <img
          src={ink.dataUrl}
          width={ink.width}
          height={ink.height}
          alt={describe(boxes)}
          className={cn("block h-auto w-auto max-w-full", compact ? "max-h-28" : "max-h-[min(34vh,19rem)]")}
        />
        {boxes.map((box, i) => (
          <motion.div
            key={i}
            aria-hidden
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2, ease: EASE_OUT, delay: Math.min(i, 4) * 0.04 }}
            className="absolute rounded-xs border-2 border-dashed border-game"
            style={{ left: `${box.left}%`, top: `${box.top}%`, width: `${box.width}%`, height: `${box.height}%` }}
          >
            {box.char ? (
              <span
                className={cn(
                  // The machine's voice, but keeping the case it read (a lowercase "a" stays lowercase).
                  "type-label absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 rounded-xs bg-game font-semibold normal-case text-game-ink",
                  compact ? "px-1" : "px-1.5 py-0.5",
                )}
              >
                {box.char}
              </span>
            ) : null}
          </motion.div>
        ))}
      </div>
    </div>
  );
}
