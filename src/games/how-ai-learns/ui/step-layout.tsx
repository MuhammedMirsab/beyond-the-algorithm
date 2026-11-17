"use client";

import type { ReactNode } from "react";
import { StepDots } from "@/components/ui/progress";
import { cn } from "@/lib/cn";
import { PLAY_STEPS, type StepId } from "./state";

const STEP_NAMES: Partial<Record<StepId, string>> = {
  pick: "Pick",
  examples: "Examples",
  train: "Train",
  test: "Test",
};

/**
 * Frame for the four play steps: where you are, a title, one line of
 * explanation, the content, and the actions.
 *
 * Desktop: actions sit top right, level with the title.
 * Phone: secondary actions sit under the lead; the primary action stays
 * pinned to the bottom of the screen so it is always one tap away.
 */
export function StepLayout({
  step,
  title,
  lead,
  primary,
  secondary,
  note,
  children,
  className,
}: {
  step: StepId;
  title: string;
  lead?: ReactNode;
  /** The one filled action. */
  primary?: ReactNode;
  /** Quiet actions (ghost buttons). */
  secondary?: ReactNode;
  /** One short line under the primary action, e.g. why it is disabled. */
  note?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const index = PLAY_STEPS.indexOf(step);
  return (
    <section
      className={cn(
        "mx-auto grid w-full max-w-[69rem] flex-1 content-start gap-x-10 gap-y-6 px-4 pt-2 sm:px-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-y-8 lg:px-8 lg:pb-12",
        primary ? "pb-0" : "pb-10",
        className,
      )}
    >
      <header className="flex min-w-0 flex-col gap-3 lg:col-start-1 lg:row-start-1">
        {index >= 0 ? (
          <div className="flex items-center gap-3">
            <StepDots total={PLAY_STEPS.length} current={index} label="Step" />
            <span className="type-label text-fg-subtle">
              Step {index + 1} of {PLAY_STEPS.length} · {STEP_NAMES[step]}
            </span>
          </div>
        ) : null}
        <h1 className="type-title-1 text-fg">{title}</h1>
        {lead ? <div className="type-body-lg max-w-[40rem] text-fg-muted">{lead}</div> : null}
        {secondary ? <div className="flex flex-wrap gap-2 lg:hidden">{secondary}</div> : null}
      </header>

      <div className="min-w-0 lg:col-span-2 lg:row-start-2">{children}</div>

      {primary || secondary ? (
        <div
          className={cn(
            "lg:static lg:col-start-2 lg:row-start-1 lg:mx-0 lg:flex lg:flex-col lg:items-end lg:gap-2 lg:self-end lg:border-0 lg:bg-transparent lg:p-0",
            primary
              ? "sticky bottom-0 z-20 -mx-4 flex flex-col gap-2 border-t border-line bg-canvas px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3 sm:-mx-6 sm:px-6"
              : "hidden",
          )}
        >
          <div className="flex items-center gap-3 lg:justify-end">
            {secondary ? <div className="hidden items-center gap-2 lg:flex">{secondary}</div> : null}
            {primary ? <div className="flex flex-1 [&>*]:w-full lg:flex-none lg:[&>*]:w-auto">{primary}</div> : null}
          </div>
          {note ? <div className="type-small text-center text-fg-subtle lg:text-right">{note}</div> : null}
        </div>
      ) : null}
    </section>
  );
}
