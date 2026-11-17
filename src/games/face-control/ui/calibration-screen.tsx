"use client";

import { Check, Keyboard, ScanFace } from "lucide-react";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Progress, StepDots } from "@/components/ui/progress";
import { cn } from "@/lib/cn";
import type { DemoMode } from "../engine/ui/face-demo";
import type { FaceControlSession } from "../play/session";
import { CameraSlot } from "./camera-slot";
import { FaceDemoCanvas } from "./face-demo-canvas";
import { useCalibration, type CalibPhase } from "./use-calibration";

const COPY: Record<CalibPhase, { name: string; title: string; text: string; demo: DemoMode }> = {
  position: {
    name: "Get ready",
    title: "Find your spot",
    text: "Sit about an arm’s length away, with your whole head inside the outline.",
    demo: "neutral",
  },
  neutral: {
    name: "Step 1 of 4",
    title: "Look straight at the screen",
    text: "Relax, keep your mouth closed and hold still. This is your neutral pose.",
    demo: "neutral",
  },
  left: {
    name: "Step 2 of 4",
    title: "Tilt your head to the left",
    text: "Lean toward your left shoulder, as far as is comfortable, and hold.",
    demo: "tilt-left",
  },
  right: {
    name: "Step 3 of 4",
    title: "Now tilt to the right",
    text: "Lean toward your right shoulder and hold. Keep looking at the screen.",
    demo: "tilt-right",
  },
  mouth: {
    name: "Step 4 of 4",
    title: "Open your mouth wide",
    text: "Like saying “ah”, and hold it for a moment. This is how you jump.",
    demo: "mouth",
  },
  done: {
    name: "Done",
    title: "All set",
    text: "The game knows how your face moves now.",
    demo: "neutral",
  },
};

const STEP_INDEX: Record<CalibPhase, number> = { position: -1, neutral: 0, left: 1, right: 2, mouth: 3, done: 4 };

/**
 * About 20 seconds: the camera large with a face guide and the live points,
 * four steps demonstrated by the dot-face glyph, per-step progress and plain
 * hints. "Skip this step" appears after 10 seconds in one step.
 */
export function CalibrationScreen({ session }: { session: FaceControlSession }) {
  const readoutRef = useRef<HTMLSpanElement>(null);
  const { view, skip } = useCalibration(session, readoutRef);
  const copy = COPY[view.phase];
  const done = view.phase === "done";

  return (
    <section
      aria-labelledby="calib-title"
      className="mx-auto grid w-full max-w-[1200px] flex-1 items-start gap-6 px-4 pb-10 pt-2 sm:px-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:items-center lg:gap-10 lg:px-8"
    >
      <CameraSlot
        session={session}
        className="aspect-[4/3] w-full rounded-xl shadow-ring lg:w-[min(100%,calc(133.33dvh-12rem))] lg:justify-self-center"
      >
        {/* Face guide: where to put your head. Solid once the camera finds you there. */}
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-x-[25%] inset-y-[10%] rounded-[46%_46%_42%_42%] border-2 transition-colors duration-200 ease-out",
            view.faceOk ? "border-solid border-game" : "border-dashed border-white/60",
          )}
        />
        <span
          ref={readoutRef}
          aria-hidden
          className="type-label absolute bottom-3 left-3 rounded-full bg-canvas/85 px-2.5 py-1 tabular-nums text-fg"
        >
          No face
        </span>
      </CameraSlot>

      <div className="flex min-w-0 flex-col gap-6">
        <div className="flex items-center justify-between gap-4">
          <span className="type-label text-game">{copy.name}</span>
          <StepDots total={4} current={STEP_INDEX[view.phase]} label="Calibration step" />
        </div>

        <div className="flex flex-col gap-2">
          <h1 id="calib-title" className="type-title-1 text-fg">
            {copy.title}
          </h1>
          <p className="type-body-lg max-w-[34rem] text-fg-muted">{copy.text}</p>
        </div>

        <div className="flex items-center gap-4">
          <div className="aspect-[4/3] w-32 shrink-0 overflow-hidden rounded-md bg-sunken sm:w-40">
            <FaceDemoCanvas key={copy.demo} mode={copy.demo} />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <Progress value={view.progress} label={done ? "Calibration" : "This step"} tone="game" />
            <p aria-live="polite" className="type-body flex min-h-[3.1em] items-start gap-2 font-semibold text-fg">
              {view.hint ? (
                <>
                  {view.hint.ok ? (
                    <Check className="mt-0.5 size-5 shrink-0 text-game" aria-hidden />
                  ) : (
                    <ScanFace className="mt-0.5 size-5 shrink-0 text-fg-subtle" aria-hidden />
                  )}
                  <span>{view.hint.text}</span>
                </>
              ) : null}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          {view.canSkip && !done ? (
            <Button variant="secondary" size="lg" onClick={skip}>
              Skip this step
            </Button>
          ) : null}
          <Button variant="ghost" size="lg" icon={<Keyboard />} onClick={() => session.act({ type: "choose-keyboard" })} disabled={done}>
            Use keyboard instead
          </Button>
        </div>
      </div>
    </section>
  );
}
