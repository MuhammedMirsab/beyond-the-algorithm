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
 * tagged with what it was read as. While it reads, the boxes drop in one by
 * one with no tags; with the answer, each box gets its letter. `flyIds` give
 * the tags shared layout ids, so the letters can fly from here into the word.
 */
export function InkFigure({
  ink,
  boxes = [],
  flyIds = null,
  reading = false,
  className,
}: {
  ink: InkImage;
  boxes?: LetterBox[];
  flyIds?: string[] | null;
  reading?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("dot-field relative grid min-h-40 place-items-center overflow-hidden rounded-lg bg-sunken p-6 sm:min-h-56", className)}>
      {reading ? (
        // A reading sweep: the machine passing over the ink once.
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 w-24 bg-linear-to-r from-transparent via-game/15 to-transparent"
          initial={{ left: "-6rem" }}
          animate={{ left: "100%" }}
          transition={{ duration: 0.8, ease: "easeInOut" }}
        />
      ) : null}
      <div className="relative inline-block max-w-full">
        {/* eslint-disable-next-line @next/next/no-img-element -- a local data URL, nothing to optimise */}
        <img
          src={ink.dataUrl}
          width={ink.width}
          height={ink.height}
          alt={describe(boxes)}
          className="block h-auto max-h-[min(34vh,19rem)] w-auto max-w-full"
        />
        {boxes.map((box, i) => (
          <motion.div
            key={i}
            aria-hidden
            initial={{ opacity: 0, scale: 1.08 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.25, ease: EASE_OUT, delay: 0.12 + Math.min(i, 4) * 0.12 }}
            className="absolute rounded-xs border-2 border-dashed border-game"
            style={{ left: `${box.left}%`, top: `${box.top}%`, width: `${box.width}%`, height: `${box.height}%` }}
          >
            {box.char ? (
              // The machine's voice, but keeping the case it read (a lowercase "a" stays lowercase).
              <span className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2">
                {flyIds?.[i] ? (
                  <motion.span
                    key="fly"
                    layoutId={flyIds[i]}
                    initial={{ opacity: 0, scale: 0.6 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ type: "spring", duration: 0.35, bounce: 0.3, delay: Math.min(i, 4) * 0.06 }}
                    className="type-label inline-block rounded-xs bg-game px-1.5 py-0.5 font-semibold text-game-ink"
                  >
                    {box.char}
                  </motion.span>
                ) : (
                  <span key="tag" className="type-label inline-block rounded-xs bg-game px-1.5 py-0.5 font-semibold text-game-ink">
                    {box.char}
                  </span>
                )}
              </span>
            ) : null}
          </motion.div>
        ))}
      </div>
    </div>
  );
}
