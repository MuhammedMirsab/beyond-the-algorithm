"use client";

import { Lock } from "lucide-react";
import { motion } from "motion/react";
import { Hand } from "@/components/art/games/hand-shapes";
import { cn } from "@/lib/cn";
import type { Gesture } from "../engine/types";
import { GESTURE_LABEL } from "./gesture-icon";

/** Card size, shared by both cards so they line up. */
const CARD_SIZE = "w-24 sm:w-28 lg:w-32 2xl:w-36";

/** The illustration's hand (the same drawing as the intro art). The viewBox leaves room for paper's thumb. */
function HandArt({ gesture, ink, paper }: { gesture: Gesture; ink: string; paper: string }) {
  return (
    <svg viewBox="-20 0 116 110" className="w-[82%]" aria-hidden>
      <Hand shape={gesture} ink={ink} paper={paper} />
    </svg>
  );
}

const REVEAL_SPRING = { type: "spring", duration: 0.5, bounce: 0.25 } as const;
const COVER = { duration: 0.25, ease: [0.22, 1, 0.36, 1] } as const;

const NAME = "type-body font-semibold lg:type-title-3";

/**
 * Your card: an empty slot until the reveal, then your move on a white card,
 * like the "You" card in the intro art.
 */
export function PlayerCard({ move, revealKey }: { move: Gesture | null; revealKey: string | null }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className={cn("relative aspect-[3/4]", CARD_SIZE)}>
        {move ? (
          <motion.div
            key={revealKey ?? "move"}
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={REVEAL_SPRING}
            className="absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-lg bg-fg px-2 text-canvas"
          >
            <HandArt gesture={move} ink="var(--color-canvas)" paper="var(--color-fg)" />
            <span className={NAME}>{GESTURE_LABEL[move]}</span>
          </motion.div>
        ) : (
          <div className="absolute inset-0 grid place-items-center rounded-lg border-2 border-dashed border-line-strong">
            <span className="type-small px-2 text-center text-fg-subtle">Your move</span>
          </div>
        )}
      </div>
      <span className="type-label text-fg-subtle">You</span>
    </div>
  );
}

export type AiCardState = "waiting" | "locked" | "revealed";

/**
 * The AI's card. Face down with a lock from the moment it seals its move,
 * before the countdown; it flips over at the reveal. `move` is only ever the
 * last revealed move, never the sealed one, so nothing on the page gives the
 * locked move away early.
 */
export function AiCard({ state, move }: { state: AiCardState; move: Gesture | null }) {
  const faceUp = state === "revealed" && move !== null;
  return (
    <div className="flex flex-col items-center gap-2">
      <div className={cn("relative aspect-[3/4] [perspective:900px]", CARD_SIZE)}>
        <motion.div
          initial={false}
          animate={{ rotateY: faceUp ? 180 : 0 }}
          transition={faceUp ? REVEAL_SPRING : COVER}
          className="relative size-full [transform-style:preserve-3d]"
        >
          {/* Face down. */}
          <div
            aria-hidden={faceUp}
            className={cn(
              "absolute inset-0 flex flex-col items-center justify-center gap-2 overflow-hidden rounded-lg [backface-visibility:hidden]",
              state === "locked" ? "bg-game text-game-ink" : "dot-field bg-raised text-fg-subtle shadow-ring",
            )}
          >
            {state === "locked" ? (
              <>
                <Lock className="size-1/3" strokeWidth={2.25} aria-hidden />
                <span className="type-label">Locked</span>
                <span className="sr-only">The AI&apos;s move is locked in</span>
              </>
            ) : (
              <span className="type-small px-2 text-center">Not picked yet</span>
            )}
          </div>

          {/* Face up. */}
          <div
            aria-hidden={!faceUp}
            className="tile-surface grain absolute inset-0 overflow-hidden rounded-lg [backface-visibility:hidden] [transform:rotateY(180deg)]"
          >
            {move ? (
              <div className="relative z-[2] flex size-full flex-col items-center justify-center gap-1 px-2 text-game-ink">
                <HandArt gesture={move} ink="var(--game-ink)" paper="white" />
                <span className={NAME}>{GESTURE_LABEL[move]}</span>
              </div>
            ) : null}
          </div>
        </motion.div>
      </div>
      <span className="type-label text-game">AI</span>
    </div>
  );
}
