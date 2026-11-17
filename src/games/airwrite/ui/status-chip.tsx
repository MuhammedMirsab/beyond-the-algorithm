"use client";

import { motion } from "motion/react";
import type { PenIndicator } from "../engine/useHandTracking";
import { cn } from "@/lib/cn";

type Dot = "idle" | "ready" | "active";

function describe(ind: PenIndicator): { label: string; dot: Dot } {
  if (!ind.handVisible) return { label: "Show one hand", dot: "idle" };
  if (ind.erasing) return { label: "Erasing", dot: "active" };
  if (ind.palm) return { label: "Wave to erase", dot: "ready" };
  if (ind.penDown) return { label: "Writing", dot: "active" };
  if (ind.settling) return { label: "Ready to write", dot: "ready" };
  return { label: "Pen lifted", dot: "ready" };
}

/** What the pen is doing right now, in words. The dot repeats it in colour, never alone. */
export function StatusChip({ indicator, className }: { indicator: PenIndicator; className?: string }) {
  const { label, dot } = describe(indicator);
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn("inline-flex h-10 items-center gap-2.5 rounded-full bg-surface pl-3.5 pr-4 shadow-ring", className)}
    >
      <span
        aria-hidden
        className={cn(
          "size-2.5 shrink-0 rounded-full transition-colors duration-150",
          dot === "idle" && "bg-fg-faint",
          dot === "ready" && "bg-fg-muted",
          dot === "active" && "bg-game",
        )}
      />
      <motion.span
        key={label}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.15 }}
        className="type-small whitespace-nowrap font-semibold text-fg"
      >
        {label}
      </motion.span>
    </div>
  );
}
