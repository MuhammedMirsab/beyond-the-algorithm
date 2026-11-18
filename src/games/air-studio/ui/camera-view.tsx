"use client";

import { MousePointer2 } from "lucide-react";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import { CameraProblem, CameraWaiting, ModelLoading } from "@/components/game/camera-notice";
import { Button } from "@/components/ui/button";
import type { TrackerState } from "../engine/tracking/tracker";

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

/**
 * Fades in after a short delay, so a camera that is already allowed never
 * flashes a prompt. On a card, because the kit is already waiting behind it.
 */
function Card({ children, delay = 0.35 }: { children: ReactNode; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: EASE_OUT, delay }}
      className="flex w-full max-w-[30rem] justify-center rounded-xl bg-canvas/90 px-6 py-7 shadow-float"
    >
      {children}
    </motion.div>
  );
}

/** Asking for the camera, loading the hand model, or saying what went wrong. */
export function CameraView({ state, onRetry, onMouse }: { state: TrackerState; onRetry: () => void; onMouse: () => void }) {
  const mouse = (
    <Button variant="ghost" size="lg" icon={<MousePointer2 />} onClick={onMouse}>
      Play with the mouse
    </Button>
  );
  if (state.status === "waiting") {
    return (
      <Card>
        <CameraWaiting actions={mouse} />
      </Card>
    );
  }
  if (state.status === "loading") {
    return (
      <Card>
        <ModelLoading label="Starting hand tracking" detail="21 points per hand · 2 hands" progress={state.progress} actions={mouse} />
      </Card>
    );
  }
  if (state.status === "error") {
    return (
      <Card delay={0}>
        <CameraProblem issue={state.issue} onRetry={onRetry} alternative={mouse} />
      </Card>
    );
  }
  return null;
}
