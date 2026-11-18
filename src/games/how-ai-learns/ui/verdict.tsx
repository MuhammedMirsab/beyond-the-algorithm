"use client";

import { Check, CircleHelp, X } from "lucide-react";
import { Chip } from "@/components/ui/chip";
import { cn } from "@/lib/cn";
import { NONE_LABEL, type Candidate, type Decision, type Outcome } from "../engine/rules";
import { explainDecision, OUTCOME_WORD } from "./copy";

const OUTCOME_TONE = { right: "success", wrong: "danger", unknown: "warning" } as const;
const OUTCOME_ICON = { right: <Check />, wrong: <X />, unknown: <CircleHelp /> } as const;

export function OutcomeChip({ outcome }: { outcome: Outcome }) {
  return (
    <Chip tone={OUTCOME_TONE[outcome]} icon={OUTCOME_ICON[outcome]}>
      {OUTCOME_WORD[outcome]}
    </Chip>
  );
}

/** A solid badge that stays readable on top of any photo. */
export function OutcomeBadge({ outcome, className }: { outcome: Outcome; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded-full px-2 text-[0.75rem] font-semibold text-canvas [&_svg]:size-3.5",
        outcome === "right" && "bg-success",
        outcome === "wrong" && "bg-danger",
        outcome === "unknown" && "bg-warning",
        className,
      )}
    >
      {OUTCOME_ICON[outcome]}
      {OUTCOME_WORD[outcome]}
    </span>
  );
}

/**
 * How sure it is about each group, with the line it must reach to answer
 * (the visitor's slider). "No object" never needs the line: when it wins,
 * nothing it learned is in view.
 */
export function SureBars({ candidates, decision, threshold }: { candidates: Candidate[]; decision: Decision; threshold: number }) {
  const line = Math.round(threshold * 100);
  const highlight = decision.reason === "nothing" ? NONE_LABEL : decision.answer;
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-3">
        {candidates.map((c) => {
          const p = Math.round(Math.min(1, Math.max(0, c.probability)) * 100);
          const on = c.label === highlight;
          return (
            <li key={c.label} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5">
              <span className={cn("type-body truncate font-semibold", on ? "text-fg" : "text-fg-muted")}>{c.label}</span>
              <span className={cn("type-body font-semibold tabular-nums", on ? "text-game" : "text-fg-subtle")}>{p}%</span>
              <span aria-hidden className="relative col-span-2 block h-2.5 rounded-full bg-fg/10">
                <span
                  className={cn(
                    "absolute inset-0 origin-left rounded-full transition-[transform,background-color] duration-300 ease-out",
                    on ? "bg-game" : "bg-fg/35",
                  )}
                  style={{ transform: `scaleX(${p / 100})` }}
                />
                {c.label === NONE_LABEL ? null : (
                  <span className="absolute -inset-y-1 w-0.5 rounded-full bg-fg" style={{ left: `${line}%` }} />
                )}
              </span>
            </li>
          );
        })}
      </ul>
      <span className="type-label text-fg-subtle">The line: it answers only above {line}% sure</span>
    </div>
  );
}

/**
 * What the model says about one photo: the answer (or "I don't know"), why,
 * and how sure it is about each group.
 */
export function Verdict({
  candidates,
  decision,
  threshold,
  truth,
  outcome,
}: {
  candidates: Candidate[];
  decision: Decision;
  threshold: number;
  /** The photo's real label, when known (library photos). */
  truth?: string;
  outcome?: Outcome;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <span className="type-label text-fg-subtle">It says</span>
        <p aria-live="polite" className={cn("type-title-1", decision.answer ? "text-fg" : "text-fg-muted")}>
          {decision.answer ?? "I don’t know"}
        </p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {outcome ? <OutcomeChip outcome={outcome} /> : null}
          <span className="type-small tabular-nums text-fg-muted">{explainDecision(decision, threshold, truth)}</span>
        </div>
      </div>
      <SureBars candidates={candidates} decision={decision} threshold={threshold} />
    </div>
  );
}
