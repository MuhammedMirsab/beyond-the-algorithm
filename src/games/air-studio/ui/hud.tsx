"use client";

import { AnimatePresence, motion } from "motion/react";
import { ArrowDown, Check, Hand, MousePointer2, MousePointerClick, SunDim, TriangleAlert, ZoomIn, ZoomOut } from "lucide-react";
import type { ReactNode } from "react";
import { KeyHints, type KeyHint } from "@/components/ui/key-hints";
import { cn } from "@/lib/cn";
import type { CoachIcon, CoachLine } from "../play/coach";
import type { InputMode } from "../play/session";
import { useCoarsePointer, type LiveHands } from "./hooks";

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

/** One hand: lit in the game colour while the camera sees it, with a small pop when it arrives. */
function HandBadge({ side, seen }: { side: "Left" | "Right"; seen: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <motion.span
        key={seen ? "seen" : "gone"}
        aria-hidden
        initial={seen ? { scale: 0.6 } : false}
        animate={{ scale: 1 }}
        transition={{ type: "spring", duration: 0.35, bounce: 0 }}
        className={cn("grid size-7 place-items-center rounded-full", seen ? "bg-game text-game-ink" : "bg-fg/10 text-fg-faint")}
      >
        <Hand className={cn("size-4", side === "Left" && "-scale-x-100")} strokeWidth={2.25} />
      </motion.span>
      <span className={cn("type-small font-semibold", seen ? "text-fg" : "text-fg-subtle")}>
        {side}
        <span className="sr-only">{seen ? " hand in view" : " hand not in view"}</span>
      </span>
    </span>
  );
}

/** Which hands the camera sees right now: the hand check, folded into play. */
export function HandsPill({ live }: { live: LiveHands }) {
  return (
    <div className="pointer-events-auto inline-flex h-11 items-center gap-4 rounded-full bg-canvas/85 pl-2 pr-4 shadow-ring">
      <HandBadge side="Left" seen={live.left} />
      <HandBadge side="Right" seen={live.right} />
    </div>
  );
}

/** Mouse mode: what stands in for the hands, and the keys for the rest. */
export function MouseHints({ recordKey }: { recordKey: boolean }) {
  const touch = useCoarsePointer();
  const items: KeyHint[] = [
    { keys: ["Space"], label: "Fist" },
    { keys: ["1", "6"], join: "to", label: "Left hand" },
  ];
  if (recordKey) items.push({ keys: ["R"], label: "Record" });
  return (
    <div className="pointer-events-auto inline-flex h-11 max-w-full items-center gap-4 whitespace-nowrap rounded-full bg-canvas/85 pl-3.5 pr-4 shadow-ring">
      <span className="inline-flex min-w-0 items-center gap-2">
        <MousePointer2 aria-hidden className="size-4 shrink-0 text-game" />
        <span className="type-small truncate font-semibold text-fg">{touch ? "Your finger is the right hand" : "Your mouse is the right hand"}</span>
      </span>
      {touch ? null : (
        <>
          <span aria-hidden className="hidden h-4 w-px shrink-0 bg-line-strong xl:block" />
          <KeyHints items={items} className="hidden flex-nowrap xl:flex" />
        </>
      )}
    </div>
  );
}

/** The machine's own numbers: hands found, frames a second, where it runs. */
export function MachineReadout({ mode, live }: { mode: InputMode | null; live: LiveHands }) {
  const hands = (live.left ? 1 : 0) + (live.right ? 1 : 0);
  const text =
    mode === "mouse"
      ? `Pretend hand · ${live.fps || 60} fps`
      : live.fps
        ? `${hands} ${hands === 1 ? "hand" : "hands"} · 21 points each · ${live.fps} fps · ${live.delegate ?? "GPU"}`
        : "Starting";
  return <span className="type-label hidden h-8 items-center rounded-full bg-canvas/85 px-3 tabular-nums text-fg-subtle shadow-ring lg:inline-flex">{text}</span>;
}

function coachIcon(icon: CoachIcon, simulated: boolean): ReactNode {
  switch (icon) {
    case "hands":
      return <Hand />;
    case "light":
      return <SunDim />;
    case "closer":
      return <ZoomIn />;
    case "back":
      return <ZoomOut />;
    case "steady":
      return <TriangleAlert />;
    case "check":
      return <Check strokeWidth={3} />;
    case "next":
      return <ArrowDown />;
    case "play":
      return simulated ? <MousePointerClick /> : <Hand />;
  }
}

/**
 * The coach's line, under the header: what to do next, or what the camera
 * needs. A first hit is confirmed in the game colour.
 */
export function CoachPill({ line, simulated }: { line: CoachLine | null; simulated: boolean }) {
  const show = line && !line.big ? line : null;
  return (
    <div aria-live="polite" className="flex h-12 items-center justify-center">
      <AnimatePresence mode="wait" initial={false}>
        {show ? (
          <motion.p
            key={show.id}
            initial={{ opacity: 0, y: 8, scale: show.tone === "good" ? 0.92 : 1 }}
            animate={{
              opacity: 1,
              y: 0,
              scale: 1,
              transition: show.tone === "good" ? { type: "spring", duration: 0.45, bounce: 0.3 } : { duration: 0.22, ease: EASE_OUT },
            }}
            exit={{ opacity: 0, y: -4, transition: { duration: 0.14, ease: EASE_OUT } }}
            className={cn(
              "inline-flex min-h-11 max-w-full items-center gap-3 rounded-full py-1.5 pl-1.5 pr-5 shadow-ring",
              show.tone === "good" ? "bg-game text-game-ink" : "bg-canvas/90 text-fg",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "grid size-8 shrink-0 place-items-center rounded-full [&_svg]:size-[18px]",
                show.tone === "good" ? "bg-game-ink/15 text-game-ink" : show.tone === "warn" ? "bg-warning/15 text-warning" : "bg-game-soft text-game",
              )}
            >
              {coachIcon(show.icon, simulated)}
            </span>
            <span className="type-small min-w-0 font-semibold sm:type-body">{show.text}</span>
          </motion.p>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/** Two hands rising, over and over: the move the message asks for. Still under reduced motion. */
function RaiseHands() {
  return (
    <span aria-hidden className="flex items-end gap-3 text-game">
      {[0, 1].map((i) => (
        <motion.span
          key={i}
          animate={{ y: [10, -6, 10] }}
          transition={{ duration: 1.8, ease: [0.77, 0, 0.175, 1], repeat: Infinity, delay: i * 0.18 }}
          className="grid size-14 place-items-center rounded-full bg-game-soft"
        >
          <Hand className={cn("size-7", i === 0 && "-scale-x-100")} strokeWidth={2.25} />
        </motion.span>
      ))}
    </span>
  );
}

/** When nothing else matters (no hands in view): the coach, large, in the middle of the stage. */
export function CoachCallout({ line }: { line: CoachLine | null }) {
  const show = line?.big ? line : null;
  return (
    <AnimatePresence>
      {show ? (
        <motion.div
          key={show.id}
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1, transition: { duration: 0.3, ease: EASE_OUT } }}
          exit={{ opacity: 0, transition: { duration: 0.18, ease: EASE_OUT } }}
          className="pointer-events-none absolute inset-0 z-10 grid place-items-center px-4"
        >
          <div role="status" className="flex max-w-[24rem] flex-col items-center gap-5 rounded-xl bg-canvas/85 px-8 py-7 text-center shadow-float">
            {show.icon === "light" ? (
              <span aria-hidden className="grid size-14 place-items-center rounded-full bg-warning/15 text-warning">
                <SunDim className="size-7" />
              </span>
            ) : (
              <RaiseHands />
            )}
            <p className="type-title-2 text-fg">{show.text}</p>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
