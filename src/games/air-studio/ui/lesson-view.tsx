"use client";

import { AnimatePresence, motion } from "motion/react";
import { Check, Clock3, Square, X } from "lucide-react";
import type { Ref } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type { Feedback } from "../engine/practice/judge";
import type { StudioSession, StudioView } from "../play/session";
import { LessonLane } from "./lesson-lane";

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

function feedbackCopy(f: Feedback): { text: string; detail: string | null; tone: "success" | "warning" | "danger" | "muted"; icon: React.ReactNode } {
  switch (f.verdict) {
    case "perfect":
      return { text: `On time · ${f.label}`, detail: f.offsetMs !== undefined ? `${f.offsetMs > 0 ? "+" : ""}${f.offsetMs} ms` : null, tone: "success", icon: <Check strokeWidth={3} /> };
    case "early":
      return { text: `Early · ${f.label}`, detail: f.offsetMs !== undefined ? `${Math.abs(f.offsetMs)} ms early` : null, tone: "warning", icon: <Clock3 /> };
    case "late":
      return { text: `Late · ${f.label}`, detail: f.offsetMs !== undefined ? `${Math.abs(f.offsetMs)} ms late` : null, tone: "warning", icon: <Clock3 /> };
    case "miss":
      return { text: `Missed · ${f.label}`, detail: null, tone: "danger", icon: <X strokeWidth={3} /> };
    case "wrong":
      return { text: f.expected ? `${f.label} instead of ${f.expected}` : `Wrong one · ${f.label}`, detail: null, tone: "danger", icon: <X strokeWidth={3} /> };
    case "extra":
      return { text: `Extra · ${f.label}`, detail: null, tone: "muted", icon: null };
  }
}

const TONE = {
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  muted: "text-fg-muted",
};

/** The lesson panel under the header: title, progress, the timeline and what the judge just said. */
export function LessonPanel({ session, view, headingRef }: { session: StudioSession; view: StudioView; headingRef: Ref<HTMLHeadingElement> }) {
  const run = view.lesson;
  if (!run) return null;
  const p = view.progress;
  const fb = view.feedback ? feedbackCopy(view.feedback) : null;
  return (
    <section aria-labelledby="air-studio-lesson-title" className="pointer-events-auto mx-auto flex w-full max-w-[69rem] flex-col gap-3 rounded-xl bg-canvas/90 p-4 shadow-float sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 items-baseline gap-3">
          <h1 id="air-studio-lesson-title" ref={headingRef} tabIndex={-1} className="type-title-3 truncate text-fg outline-none">
            {run.lesson.title}
          </h1>
          <span className="type-label shrink-0 tabular-nums text-fg-subtle">
            {run.bpm} beats/min · {run.level === "advanced" ? "strict" : "relaxed"}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {p ? (
            <span className="type-small tabular-nums text-fg-muted">
              <span className="font-semibold text-fg">{p.hits}</span> of {p.total} hit
            </span>
          ) : null}
          <Button variant="secondary" icon={<Square className="fill-current" />} onClick={session.stopLesson}>
            Stop lesson
          </Button>
        </div>
      </div>
      <div className="overflow-hidden rounded-md bg-sunken">
        <LessonLane session={session} />
      </div>
      <p aria-live="polite" className="flex min-h-7 items-center gap-2">
        <AnimatePresence mode="popLayout" initial={false}>
          {fb ? (
            <motion.span
              key={view.feedback?.at}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: { duration: 0.12, ease: EASE_OUT } }}
              exit={{ opacity: 0, transition: { duration: 0.1 } }}
              className={cn("type-body inline-flex items-center gap-2 font-semibold [&_svg]:size-4", TONE[fb.tone])}
            >
              {fb.icon}
              {fb.text}
              {fb.detail ? <span className="type-label tabular-nums text-fg-subtle">{fb.detail}</span> : null}
            </motion.span>
          ) : (
            <span className="type-body text-fg-muted">{view.countIn !== null ? "Get ready. The count-in plays first." : "Play the highlighted notes when they reach the line."}</span>
          )}
        </AnimatePresence>
      </p>
    </section>
  );
}

/** 4, 3, 2, 1 before the lesson (or a recording) starts, in big dot-matrix numerals. */
export function CountIn({ value }: { value: number | null }) {
  return (
    <div aria-live="polite" className="pointer-events-none absolute inset-0 z-20 grid place-items-center">
      <AnimatePresence mode="popLayout">
        {value !== null ? (
          <motion.div
            key={value}
            className="grid size-36 place-items-center rounded-full bg-canvas/90 shadow-ring sm:size-44"
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1, transition: { duration: 0.15, ease: EASE_OUT } }}
            exit={{ opacity: 0, transition: { duration: 0.12, ease: EASE_OUT } }}
          >
            <span className="type-score text-game">{value}</span>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/** The lesson's tip, where the dock usually is. */
export function LessonTip({ text }: { text: string }) {
  return (
    <p className="type-small pointer-events-auto mx-auto max-w-[44rem] rounded-full bg-canvas/90 px-5 py-2.5 text-center text-fg-muted shadow-ring">
      <span className="font-semibold text-fg">Tip: </span>
      {text}
    </p>
  );
}
