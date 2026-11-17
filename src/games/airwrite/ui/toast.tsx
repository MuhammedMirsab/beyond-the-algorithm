"use client";

import { AnimatePresence, motion } from "motion/react";
import { Check, Info } from "lucide-react";
import { cn } from "@/lib/cn";

export interface ToastMessage {
  id: number;
  text: string;
  tone: "info" | "success";
}

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

/** A short confirmation above the toolbar. The live region is always mounted so it is announced. */
export function Toast({ toast, className }: { toast: ToastMessage | null; className?: string }) {
  return (
    <div role="status" aria-live="polite" className={cn("pointer-events-none flex justify-center px-4", className)}>
      <AnimatePresence>
        {toast ? (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
            transition={{ duration: 0.2, ease: EASE_OUT }}
            className="type-small inline-flex h-11 items-center gap-2 rounded-full bg-raised px-4 font-semibold text-fg shadow-float"
          >
            {toast.tone === "success" ? (
              <Check aria-hidden className="size-4 shrink-0 text-success" strokeWidth={2.5} />
            ) : (
              <Info aria-hidden className="size-4 shrink-0 text-fg-muted" />
            )}
            {toast.text}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
