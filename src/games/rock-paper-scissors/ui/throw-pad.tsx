"use client";

import { motion } from "motion/react";
import { Kbd } from "@/components/ui/surface";
import { cn } from "@/lib/cn";
import { GESTURES } from "../engine/aiPredictor";
import type { Gesture } from "../engine/types";
import { GESTURE_KEY, GESTURE_LABEL, HandGlyph } from "./gesture-icon";

/**
 * Playing without a camera: three big hands (and R, P, S). They wake up once
 * the AI has locked its move; a pick made before Shoot is thrown at Shoot,
 * and can be changed until then.
 *
 * `row`: three tall buttons side by side (phones, thumbs at the bottom).
 * `column`: three wide buttons stacked, next to your card (the laptop).
 */
export function ThrowPad({
  enabled,
  shoot,
  selected,
  thrown,
  onThrow,
  touch,
  layout = "row",
  className,
}: {
  /** The AI has locked its move and a throw is expected. */
  enabled: boolean;
  /** It's Shoot right now. */
  shoot: boolean;
  /** A pick made before Shoot, waiting for it. */
  selected: Gesture | null;
  /** The move just thrown, shown until the next round. */
  thrown: Gesture | null;
  onThrow: (gesture: Gesture) => void;
  /** A touch screen: no key caps. */
  touch: boolean;
  layout?: "row" | "column";
  className?: string;
}) {
  // The nudge at Shoot is a transform: the arcade's MotionConfig (reducedMotion="user") already skips it.
  const column = layout === "column";
  return (
    <div role="group" aria-label="Your move" className={cn(column ? "flex flex-col gap-2" : "grid grid-cols-3 gap-2 sm:gap-3", className)}>
      {GESTURES.map((gesture, i) => {
        const picked = selected === gesture || (!enabled && thrown === gesture);
        const call = shoot && !selected;
        return (
          <motion.button
            key={gesture}
            type="button"
            disabled={!enabled}
            aria-pressed={selected === gesture}
            aria-keyshortcuts={touch ? undefined : GESTURE_KEY[gesture]}
            onClick={() => onThrow(gesture)}
            animate={call ? (column ? { x: [0, 6, 0] } : { y: [0, -6, 0] }) : { x: 0, y: 0 }}
            transition={call ? { duration: 0.36, ease: [0.22, 1, 0.36, 1], delay: i * 0.05 } : { duration: 0.15 }}
            className={cn(
              "group/throw relative flex select-none items-center rounded-lg",
              column ? "min-h-16 flex-1 gap-3 py-2 pl-3 pr-4" : "min-h-[7.5rem] flex-col justify-center gap-1.5 px-2 pb-3 pt-4 sm:min-h-[8.5rem]",
              "transition-[background-color,color,box-shadow,opacity,scale] duration-150 ease-out active:scale-[0.97]",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg",
              "disabled:pointer-events-none",
              picked ? "bg-fg text-canvas" : "bg-raised text-fg shadow-ring hover:bg-overlay",
              !enabled && !picked && "opacity-45",
              call && "shadow-[0_0_0_2px_var(--game)]",
            )}
          >
            <HandGlyph
              gesture={gesture}
              paper={picked ? "white" : "var(--color-fg)"}
              ink={picked ? "var(--color-canvas)" : "var(--color-raised)"}
              weight={5.5}
              className={cn(
                "w-auto transition-transform duration-200 ease-out [@media(hover:hover)_and_(pointer:fine)]:group-hover/throw:-translate-y-0.5",
                column ? "h-11" : "h-14 sm:h-16",
              )}
            />
            <span className={cn("type-body font-semibold", column && "flex-1 text-left")}>{GESTURE_LABEL[gesture]}</span>
            {touch ? null : (
              <Kbd className={cn(!column && "absolute right-2 top-2", picked && "bg-canvas/10 text-canvas shadow-none")}>
                {GESTURE_KEY[gesture]}
              </Kbd>
            )}
          </motion.button>
        );
      })}
    </div>
  );
}
