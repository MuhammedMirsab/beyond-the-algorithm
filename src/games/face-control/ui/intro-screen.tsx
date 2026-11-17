"use client";

import { Camera, Keyboard, ShieldCheck } from "lucide-react";
import { GameArt } from "@/components/art/game-art";
import { PRIVACY_LINE } from "@/components/game/camera-notice";
import { GameIntro } from "@/components/game/game-intro";
import { Kbd } from "@/components/ui/surface";
import { cn } from "@/lib/cn";
import type { FaceControlSession, ModelState } from "../play/session";

const STEPS = [
  { title: "Turn on your camera", text: "Your browser asks first." },
  { title: "Show it your face", text: "Look straight, tilt, open your mouth." },
  { title: "Tilt to roll the ball, open your mouth to jump", text: "Three levels, five lives." },
];

/** A quiet machine-voice line while the face model warms up in the background. */
export function ModelReadout({ model, className }: { model: ModelState; className?: string }) {
  const pct = Math.round(model.fraction * 100);
  const text =
    model.status === "ready"
      ? `Face model ready · ${model.delegate ?? "GPU"}`
      : model.status === "failed"
        ? "Face model not loaded · it tries again when you start"
        : model.stage === "initialise"
          ? "Face model starting"
          : `Face model loading · ${pct}%`;
  return (
    <p className={cn("type-label flex items-center gap-2 text-fg-subtle", className)}>
      <span
        aria-hidden
        className={cn("size-1.5 shrink-0 rounded-full", model.status === "ready" ? "bg-success" : model.status === "failed" ? "bg-warning" : "bg-fg-faint")}
      />
      {text}
    </p>
  );
}

export function IntroScreen({ session, model }: { session: FaceControlSession; model: ModelState }) {
  return (
    <GameIntro
      slug="face-control"
      art={<GameArt slug="face-control" />}
      steps={STEPS}
      primary={{ label: "Turn on camera", icon: <Camera />, onClick: () => session.act({ type: "choose-camera" }) }}
      secondary={{ label: "Play with keyboard", icon: <Keyboard />, onClick: () => session.act({ type: "choose-keyboard" }) }}
      footnote={
        <>
          <span className="flex items-start gap-1.5">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
            {PRIVACY_LINE}
          </span>
          <span className="mt-2 hidden flex-wrap items-center gap-1.5 lg:flex">
            Keyboard: <Kbd>←</Kbd>
            <Kbd>→</Kbd> to roll, <Kbd>Space</Kbd> to jump, <Kbd>P</Kbd> to pause
          </span>
        </>
      }
    >
      <ModelReadout model={model} />
    </GameIntro>
  );
}
