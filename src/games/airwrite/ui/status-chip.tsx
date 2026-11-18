"use client";

import { AnimatePresence, motion } from "motion/react";
import { Eraser, Hand, PenLine, PenOff, type LucideIcon } from "lucide-react";
import type { PenIndicator } from "../engine/useHandTracking";
import { cn } from "@/lib/cn";

type Tone = "idle" | "ready" | "down";

function describe(ind: PenIndicator): { label: string; tone: Tone; Icon: LucideIcon } {
  if (!ind.handVisible) return { label: "Show one hand", tone: "idle", Icon: Hand };
  if (ind.erasing) return { label: "Erasing", tone: "down", Icon: Eraser };
  if (ind.palm) return { label: "Wave to erase", tone: "ready", Icon: Eraser };
  if (ind.penDown) return { label: "Writing", tone: "down", Icon: PenLine };
  if (ind.settling) return { label: "Hold still", tone: "ready", Icon: Hand };
  return { label: "Pen lifted", tone: "ready", Icon: PenOff };
}

/**
 * What the pen is doing right now, in words, an icon and colour together
 * (never colour alone): filled in the game colour while it writes, an outline
 * while it is lifted. The same two looks as the cursor on the writing area.
 */
export function StatusChip({ indicator, className }: { indicator: PenIndicator; className?: string }) {
  const { label, tone, Icon } = describe(indicator);
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "inline-flex h-11 items-center gap-2.5 rounded-full pl-3.5 pr-4 transition-[background-color,color,box-shadow] duration-150 ease-out",
        tone === "down" ? "bg-game text-game-ink" : "bg-surface text-fg shadow-ring",
        tone === "idle" && "text-fg-muted",
        className,
      )}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={label}
          className="inline-flex items-center gap-2"
          initial={{ opacity: 0, y: 3 }}
          animate={{ opacity: 1, y: 0, transition: { duration: 0.15 } }}
          exit={{ opacity: 0, transition: { duration: 0.1 } }}
        >
          <Icon aria-hidden className="size-[18px] shrink-0" strokeWidth={2.25} />
          <span className="type-small whitespace-nowrap font-semibold">{label}</span>
        </motion.span>
      </AnimatePresence>
    </div>
  );
}
