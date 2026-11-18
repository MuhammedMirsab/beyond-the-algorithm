"use client";

import { Camera, CircleHelp, MousePointer2, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { GameArt } from "@/components/art/game-art";
import { GameIntro } from "@/components/game/game-intro";
import { GameShell } from "@/components/game/game-shell";
import { useIdle } from "@/lib/idle";
import { cn } from "@/lib/cn";
import { acquireHandTracker, type Delegate } from "../engine/handTracker";
import { AdaptiveButton } from "./adaptive-button";
import { HowItWorksModal } from "./how-it-works";
import { WRITE_KEYS } from "./toolbar";
import type { InputMode } from "./write-screen";

const LEAD = "Write a word in the air with one finger. This computer tracks your hand, then reads your letters by matching their shapes.";

/** What you will do, in order. The best-results advice (capitals, a pinch between letters) is built into the steps. */
const STEPS = [
  { title: "Raise one hand and point", text: "Your index fingertip is the pen." },
  { title: "Write a word in big capitals", text: "One letter at a time. Short words read best." },
  { title: "Pinch to lift the pen", text: "Touch thumb and finger between letters." },
];

type ModelState = { status: "loading"; progress: number } | { status: "ready"; delegate: Delegate } | { status: "failed" };

/**
 * Starts loading the hand model while the visitor reads, so the first stroke
 * comes seconds after the camera turns on. The writing screen picks up the
 * same model (it stays warm for a few seconds after this lease ends).
 */
function useWarmHandModel(): ModelState {
  const [state, setState] = useState<ModelState>({ status: "loading", progress: 0 });
  useEffect(() => {
    let cancelled = false;
    const lease = acquireHandTracker();
    const off = lease.onProgress((progress) => {
      if (!cancelled) setState((s) => (s.status === "loading" ? { status: "loading", progress } : s));
    });
    lease.promise.then(
      (tracker) => {
        if (!cancelled) setState({ status: "ready", delegate: tracker.delegate });
      },
      () => {
        if (!cancelled) setState({ status: "failed" });
      },
    );
    return () => {
      cancelled = true;
      off();
      lease.release();
    };
  }, []);
  return state;
}

function ModelReadout({ model }: { model: ModelState }) {
  const text =
    model.status === "ready"
      ? `Hand model ready · ${model.delegate}`
      : model.status === "failed"
        ? "Hand model not loaded · it tries again when you start"
        : `Hand model loading · ${Math.round(model.progress * 100)}%`;
  return (
    <p className="type-label flex items-center gap-2 text-fg-subtle">
      <span
        aria-hidden
        className={cn("size-1.5 shrink-0 rounded-full", model.status === "ready" ? "bg-success" : model.status === "failed" ? "bg-warning" : "bg-fg-faint")}
      />
      {text}
    </p>
  );
}

export function IntroScreen({ onStart, returning = false }: { onStart: (mode: InputMode) => void; returning?: boolean }) {
  const [howOpen, setHowOpen] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const model = useWarmHandModel();
  // The intro is already the reset state; an abandoned modal still closes for the next visitor.
  useIdle(() => setHowOpen(false), { enabled: howOpen });

  // Back from Next player or an idle reset: put keyboard focus at the top, not on a removed button.
  useEffect(() => {
    if (returning) headingRef.current?.focus({ preventScroll: true });
  }, [returning]);

  return (
    <GameShell
      slug="airwrite"
      actions={<AdaptiveButton icon={<CircleHelp />} label="How it works" onClick={() => setHowOpen(true)} />}
    >
      <GameIntro
        slug="airwrite"
        art={<GameArt slug="airwrite" mode="intro" />}
        lead={LEAD}
        steps={STEPS}
        headingRef={headingRef}
        primary={{ label: "Turn on camera", icon: <Camera />, onClick: () => onStart("camera") }}
        secondary={{ label: "Write with mouse or touch", icon: <MousePointer2 />, onClick: () => onStart("pointer") }}
        footnote={
          <span className="flex items-start gap-1.5">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
            Everything happens on this device. The video and your writing are never recorded or sent anywhere.
          </span>
        }
        keys={WRITE_KEYS}
      >
        <ModelReadout model={model} />
      </GameIntro>
      <HowItWorksModal open={howOpen} onOpenChange={setHowOpen} usedCamera />
    </GameShell>
  );
}
