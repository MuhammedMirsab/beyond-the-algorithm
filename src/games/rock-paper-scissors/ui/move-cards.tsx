"use client";

import { Lock } from "lucide-react";
import { AnimatePresence, motion, useAnimate, useReducedMotion } from "motion/react";
import { useEffect, type ReactNode } from "react";
import { Hand, HAND_VIEWBOX } from "@/components/art/games/hand-shapes";
import { cn } from "@/lib/cn";
import type { Gesture } from "../engine/types";
import type { Beat } from "../match-controller";
import { GESTURE_LABEL } from "./gesture-icon";

const EASE_OUT = [0.22, 1, 0.36, 1] as const;
/** The reveal: a flip with a little overshoot. One of the rare moments that gets bounce. */
const FLIP = { type: "spring", duration: 0.6, bounce: 0.28 } as const;
const COVER = { duration: 0.25, ease: EASE_OUT } as const;

/** The big hand on a card face. */
function CardHand({ gesture, ink, paper, flip }: { gesture: Gesture; ink: string; paper: string; flip?: boolean }) {
  return (
    <svg viewBox={HAND_VIEWBOX} className="w-[74%] overflow-visible" aria-hidden>
      <Hand shape={gesture} ink={ink} paper={paper} weight={4.5} flip={flip} />
    </svg>
  );
}

/** One quick dip of a card on every beat of the chant, like a fist pumping. */
function usePump(beat: Beat | null, active: boolean) {
  const [scope, animate] = useAnimate<HTMLDivElement>();
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!active || reduced || !scope.current) return;
    if (beat === "rock" || beat === "paper" || beat === "scissors") {
      animate(scope.current, { y: [0, 9, 0] }, { duration: 0.32, ease: EASE_OUT, times: [0, 0.35, 1] });
    } else if (beat === "shoot") {
      animate(scope.current, { y: [0, 12, -3, 0], scale: [1, 0.98, 1.02, 1] }, { duration: 0.42, ease: EASE_OUT });
    }
  }, [beat, active, reduced, animate, scope]);
  return scope;
}

export type AiCardState = "waiting" | "locked" | "revealed";

/**
 * The AI's card. An empty slot until a round starts; dealt face down with a
 * lock the moment it seals its move (before the chant); it dips on every
 * beat; it flips over at the reveal. `move` is only ever the last revealed
 * move, never the sealed one, so nothing on the page gives the locked move
 * away early.
 */
export function AiCard({
  state,
  move,
  beat,
  dealKey,
  className,
}: {
  state: AiCardState;
  move: Gesture | null;
  beat: Beat | null;
  /** Changes for every sealed round, so the deal plays again. */
  dealKey: string | null;
  className?: string;
}) {
  const faceUp = state === "revealed" && move !== null;
  const pump = usePump(beat, state === "locked");

  return (
    <div className={cn("relative aspect-[3/4]", className)}>
      {/* The empty slot stays underneath, so the card has somewhere to land. */}
      <div aria-hidden className="absolute inset-0 rounded-lg border-2 border-dashed border-line-strong" />
      {state === "waiting" ? (
        <div className="absolute inset-0 grid place-items-center px-3 text-center">
          <span className="type-small text-fg-subtle">Picks when the round starts</span>
        </div>
      ) : null}
      <div ref={pump} className="absolute inset-0">
        <AnimatePresence initial={false}>
          {state === "waiting" ? null : (
            // Keyed by round: a new round deals a new card, the reveal flips the same one.
            <motion.div
              key={dealKey ?? "card"}
              initial={state === "locked" ? { y: -28, scale: 1.06, opacity: 0 } : false}
              animate={{ y: 0, scale: 1, opacity: 1 }}
              exit={{ y: 16, opacity: 0, transition: { duration: 0.16, ease: EASE_OUT } }}
              transition={{ duration: 0.34, ease: EASE_OUT }}
              className="absolute inset-0 [perspective:1000px]"
            >
              <motion.div
                initial={false}
                animate={{ rotateY: faceUp ? 180 : 0 }}
                transition={faceUp ? FLIP : COVER}
                className="relative size-full [transform-style:preserve-3d]"
              >
                <CardBack locked={state === "locked"} dealKey={dealKey} hidden={faceUp} />
                <div
                  aria-hidden={!faceUp}
                  className="tile-surface grain absolute inset-0 overflow-hidden rounded-lg shadow-float [backface-visibility:hidden] [transform:rotateY(180deg)]"
                >
                  {move ? (
                    <div className="relative z-[2] flex size-full flex-col items-center justify-center gap-1 px-2 pb-1 text-game-ink">
                      <CardHand gesture={move} ink="var(--game-ink)" paper="white" flip />
                      <span className="type-title-3">{GESTURE_LABEL[move]}</span>
                    </div>
                  ) : null}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/** The back of the AI's card: the game colour, a field of dots, and the lock. */
function CardBack({ locked, dealKey, hidden }: { locked: boolean; dealKey: string | null; hidden: boolean }) {
  return (
    <div
      aria-hidden={hidden}
      className="absolute inset-0 overflow-hidden rounded-lg bg-game shadow-float [backface-visibility:hidden]"
    >
      <div
        aria-hidden
        className="absolute inset-2.5 rounded-[12px] opacity-[0.22] [background-image:radial-gradient(circle,var(--game-ink)_1.2px,transparent_1.7px)] [background-size:12px_12px] [box-shadow:inset_0_0_0_2px_var(--game-ink)]"
      />
      <div className="relative grid size-full place-items-center">
        {locked ? (
          <motion.span
            key={dealKey ?? "lock"}
            initial={{ scale: 0.4, opacity: 0, rotate: -12 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            transition={{ type: "spring", duration: 0.45, bounce: 0.35, delay: 0.16 }}
            className="grid aspect-square w-[42%] place-items-center rounded-full bg-game-ink text-game"
          >
            <Lock className="size-[46%]" strokeWidth={2.5} aria-hidden />
          </motion.span>
        ) : null}
        <span className="sr-only">The AI&apos;s move is locked in</span>
      </div>
    </div>
  );
}

export type PlayerCardState = "empty" | "picked" | "thrown";

/**
 * Your card, for playing with keys or buttons: an empty slot, then your pick
 * (it can still change until Shoot), then your throw. The camera mode has no
 * card: your hand in the picture is the card.
 */
export function PlayerCard({
  state,
  move,
  throwKey,
  prompt,
  className,
}: {
  state: PlayerCardState;
  move: Gesture | null;
  /** Changes for every throw, so the landing plays again. */
  throwKey: string | null;
  /** What the empty slot says. */
  prompt: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("relative aspect-[3/4]", className)}>
      <div aria-hidden className="absolute inset-0 rounded-lg border-2 border-dashed border-line-strong" />
      {state === "empty" || !move ? (
        <div className="absolute inset-0 grid place-items-center px-3 text-center">
          <span className="type-small text-fg-subtle">{prompt}</span>
        </div>
      ) : (
        <motion.div
          key={state === "thrown" ? `thrown-${throwKey ?? move}` : `picked-${move}`}
          initial={state === "thrown" ? { scale: 1.08, y: -6 } : { scale: 0.94, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          transition={state === "thrown" ? { type: "spring", duration: 0.45, bounce: 0.3 } : { duration: 0.18, ease: EASE_OUT }}
          className={cn(
            "absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-lg px-2 pb-1 shadow-float",
            state === "thrown" ? "bg-fg text-canvas" : "bg-fg/90 text-canvas",
          )}
        >
          <CardHand gesture={move} ink="var(--color-canvas)" paper="white" />
          <span className="type-title-3">{GESTURE_LABEL[move]}</span>
          {state === "picked" ? <span className="type-label text-canvas/70">Thrown on Shoot</span> : null}
        </motion.div>
      )}
    </div>
  );
}
