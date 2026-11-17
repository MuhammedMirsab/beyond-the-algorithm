"use client";

import { Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/surface";
import { cn } from "@/lib/cn";
import { GESTURES } from "../engine/aiPredictor";
import type { Gesture } from "../engine/types";
import { GESTURE_KEY, GESTURE_LABEL, GestureIcon } from "./gesture-icon";

/**
 * Playing without a camera: three big buttons (and R, P, S). They work once
 * the AI has locked its move; a pick made during the countdown is thrown at
 * Shoot.
 */
export function ThrowPad({
  enabled,
  shoot,
  selected,
  onThrow,
  onUseCamera,
  canSwitch,
}: {
  /** The AI has locked its move and a throw is expected. */
  enabled: boolean;
  /** It's Shoot right now. */
  shoot: boolean;
  /** A pick made during the countdown, waiting for Shoot. */
  selected: Gesture | null;
  onThrow: (gesture: Gesture) => void;
  onUseCamera: () => void;
  /** Switching is only offered between rounds. */
  canSwitch: boolean;
}) {
  return (
    <section aria-label="Your move" className="flex min-w-0 flex-col gap-3">
      <div className="flex w-full flex-col items-center justify-center gap-5 rounded-xl bg-sunken px-3 py-6 shadow-ring sm:px-6 md:aspect-[4/3] lg:py-8">
        <p className="type-title-3 text-center text-fg">
          {shoot ? "Pick your move now" : enabled ? "Pick now or on Shoot" : "Start the round, then pick"}
        </p>
        <div className="grid w-full max-w-[30rem] grid-cols-3 gap-2 sm:gap-3">
          {GESTURES.map((gesture) => {
            const pressed = selected === gesture;
            return (
              <button
                key={gesture}
                type="button"
                disabled={!enabled}
                aria-pressed={pressed}
                aria-keyshortcuts={GESTURE_KEY[gesture]}
                onClick={() => onThrow(gesture)}
                className={cn(
                  "flex min-h-28 select-none flex-col items-center justify-center gap-2 rounded-lg px-2 py-4 sm:min-h-32",
                  "transition-[background-color,color,box-shadow,transform,opacity] duration-150 ease-out active:scale-[0.97]",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg",
                  "disabled:pointer-events-none disabled:opacity-45",
                  pressed ? "bg-fg text-canvas" : "bg-surface text-fg shadow-ring hover:bg-raised",
                )}
              >
                <GestureIcon gesture={gesture} className="size-10 sm:size-12" />
                <span className="type-body font-semibold">{GESTURE_LABEL[gesture]}</span>
                <Kbd className={cn("hidden lg:inline-grid", pressed && "bg-canvas/15 text-canvas")}>{GESTURE_KEY[gesture]}</Kbd>
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="type-small text-fg-subtle">Playing without the camera. The AI works the same way.</p>
        <Button variant="ghost" size="sm" icon={<Camera />} onClick={onUseCamera} disabled={!canSwitch}>
          Use the camera
        </Button>
      </div>
    </section>
  );
}
