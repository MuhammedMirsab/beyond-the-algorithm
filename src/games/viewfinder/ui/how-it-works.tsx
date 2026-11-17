"use client";

import type { ComponentType } from "react";
import { HowItWorks } from "@/components/game/panels";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { HOW_INTRO, howSteps, type HowStep, type SessionNumbers } from "./copy";
import { FramePointsArt, HandPointsArt, LensInsideArt } from "./explainer-art";

const VISUALS: ComponentType<{ className?: string }>[] = [HandPointsArt, FramePointsArt, LensInsideArt];

function StepText({ step }: { step: HowStep }) {
  return (
    <>
      <p>{step.text}</p>
      {step.yours ? <p className="mt-2 font-semibold text-fg">{step.yours}</p> : null}
    </>
  );
}

/** The reveal at the end of a session: the shared HowItWorks, with the visitor's own numbers. */
export function ViewfinderHowItWorks({ numbers }: { numbers: SessionNumbers | null }) {
  const steps = howSteps(numbers).map((step, i) => {
    const Visual = VISUALS[i];
    return { title: step.title, text: <StepText step={step} />, visual: <Visual /> };
  });
  return <HowItWorks title="How the AI did it" intro={HOW_INTRO} steps={steps} />;
}

/**
 * The same three steps during play (header action). A single column with a
 * small drawing beside each step, so it reads as a list inside a dialog.
 */
export function HowItWorksModal({
  open,
  onOpenChange,
  numbers,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  numbers: SessionNumbers | null;
}) {
  const steps = howSteps(numbers);
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="How it works"
      description={HOW_INTRO}
      size="lg"
      footer={
        <Button variant="game" size="lg" onClick={() => onOpenChange(false)}>
          Keep playing
        </Button>
      }
    >
      <ol className="flex flex-col gap-3">
        {steps.map((step, i) => {
          const Visual = VISUALS[i];
          return (
            <li
              key={step.title}
              className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-start gap-4 rounded-lg bg-surface p-4 shadow-ring sm:grid-cols-[9rem_minmax(0,1fr)]"
            >
              <div className="overflow-hidden rounded-md bg-sunken">
                <Visual />
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                <span className="type-label text-game">Step {i + 1}</span>
                <h3 className="type-title-3 text-fg">{step.title}</h3>
                <div className="type-body text-fg-muted">
                  <StepText step={step} />
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </Modal>
  );
}
