"use client";

import type { ComponentType } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { cn } from "@/lib/cn";
import { howIntro, howSteps, type HowStep, type HowStepId, type SessionNumbers } from "./copy";
import { FaceArt, FramePointsArt, HandPointsArt, RecipeArt, SmoothingArt } from "./explainer-art";

const VISUALS: Record<HowStepId, ComponentType<{ className?: string }>> = {
  points: HandPointsArt,
  corners: FramePointsArt,
  smoothing: SmoothingArt,
  recipe: RecipeArt,
  face: FaceArt,
};

/** The visitor's own numbers for a step, set apart from the explanation. */
function Yours({ text }: { text: string }) {
  return <p className="type-body rounded-md bg-game-soft px-4 py-3 font-semibold text-fg">{text}</p>;
}

function Step({ step, index, variant }: { step: HowStep; index: number; variant: "page" | "modal" }) {
  const Visual = VISUALS[step.id];
  const page = variant === "page";
  return (
    <li
      className={cn(
        // Nested corners (DESIGN.md §5): 14 px picture + 16 px padding ≈ 28 px card; 14 + 20 ≈ 36.
        "grid items-center gap-5 rounded-xl bg-surface p-4 shadow-ring",
        page
          ? "sm:rounded-2xl sm:p-5 md:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] md:gap-10"
          : "sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] sm:items-start",
      )}
    >
      <div className={cn("dot-field overflow-hidden rounded-md bg-sunken", page && index % 2 === 1 && "md:order-2")}>
        <Visual />
      </div>
      <div className="flex min-w-0 flex-col gap-3">
        <span className="type-label text-game">Step {index + 1}</span>
        <h3 className={cn("text-fg", page ? "type-title-2" : "type-title-3")}>{step.title}</h3>
        <p className="type-body max-w-[34rem] text-fg-muted">{step.text}</p>
        {step.yours ? <Yours text={step.yours} /> : null}
      </div>
    </li>
  );
}

/**
 * How it works, five steps from camera pixels to a filtered frame, each with
 * its own motion graphic and, where there are any, the visitor's own numbers.
 * The results page shows big alternating rows; the in-play dialog a column.
 */
export function HowItWorksStory({ numbers, variant }: { numbers: SessionNumbers | null; variant: "page" | "modal" }) {
  return (
    <ol className="flex flex-col gap-3">
      {howSteps(numbers).map((step, i) => (
        <Step key={step.id} step={step} index={i} variant={variant} />
      ))}
    </ol>
  );
}

/** The reveal at the end of a session. */
export function ViewfinderHowItWorks({ numbers }: { numbers: SessionNumbers | null }) {
  return (
    <section aria-labelledby="vf-how" className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 id="vf-how" className="type-title-1 text-fg">
          How the AI did it
        </h2>
        <p className="type-body-lg max-w-[40rem] text-fg-muted">{howIntro(numbers)}</p>
      </div>
      <HowItWorksStory numbers={numbers} variant="page" />
    </section>
  );
}

/** The same story during play (header action). */
export function HowItWorksModal({
  open,
  onOpenChange,
  numbers,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  numbers: SessionNumbers | null;
}) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="How it works"
      description={howIntro(numbers)}
      size="lg"
      footer={
        <Button variant="game" size="lg" onClick={() => onOpenChange(false)}>
          Keep playing
        </Button>
      }
    >
      <HowItWorksStory numbers={numbers} variant="modal" />
    </Modal>
  );
}
