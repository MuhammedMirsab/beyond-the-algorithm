"use client";

import { Check, CircleHelp, X } from "lucide-react";
import { Chip } from "@/components/ui/chip";
import { ConfidenceBars } from "@/components/ui/meter";
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
 * What the model says about one photo: the answer (or "I don't know"), why,
 * and the confidence bars every game uses.
 */
export function Verdict({
  candidates,
  decision,
  threshold,
  truth,
  outcome,
  live = false,
}: {
  candidates: Candidate[];
  decision: Decision;
  threshold: number;
  /** The photo's real label, when known (library photos). */
  truth?: string;
  outcome?: Outcome;
  /** Camera mode: announce only the answer, not every percentage. */
  live?: boolean;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <span className="type-label text-fg-subtle">It says</span>
        <p aria-live="polite" className="type-title-1 text-fg">
          {decision.answer ?? "I don’t know"}
        </p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {outcome ? <OutcomeChip outcome={outcome} /> : null}
          <span className={cn("type-small text-fg-muted", live && "tabular-nums")}>{explainDecision(decision, threshold, truth)}</span>
        </div>
      </div>
      <ConfidenceBars
        rows={candidates.map((c) => ({ id: c.label, label: c.label, value: c.probability }))}
        highlight={decision.reason === "nothing" ? NONE_LABEL : (decision.answer ?? "none")}
      />
    </div>
  );
}
