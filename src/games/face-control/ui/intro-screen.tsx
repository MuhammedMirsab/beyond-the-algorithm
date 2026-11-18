"use client";

import { Camera, Keyboard, ShieldCheck } from "lucide-react";
import { GameArt } from "@/components/art/game-art";
import { PRIVACY_LINE } from "@/components/game/camera-notice";
import { GameIntro } from "@/components/game/game-intro";
import { cn } from "@/lib/cn";
import type { FaceControlSession, ModelState } from "../play/session";
import { PLAY_KEYS } from "./dock";

/** What you will do, in the order it happens. The setup is one second of looking at the screen. */
const STEPS = [
  { title: "Look at the camera", text: "It finds 478 points on your face in about a second." },
  { title: "Tilt your head to roll", text: "Lean toward a shoulder. The ball follows." },
  { title: "Open your mouth to jump", text: "Three short levels, five lives." },
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
      art={<GameArt slug="face-control" mode="intro" />}
      steps={STEPS}
      primary={{ label: "Turn on camera", icon: <Camera />, onClick: () => session.act({ type: "choose-camera" }) }}
      secondary={{ label: "Play with keyboard", icon: <Keyboard />, onClick: () => session.act({ type: "choose-keyboard" }) }}
      footnote={
        <span className="flex items-start gap-1.5">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
          {PRIVACY_LINE}
        </span>
      }
      keys={PLAY_KEYS}
    >
      <ModelReadout model={model} />
    </GameIntro>
  );
}
