"use client";

import { useLayoutEffect, useRef } from "react";
import type { FaceControlSession } from "../play/session";
import { cn } from "@/lib/cn";

/**
 * The full-bleed element the Phaser world renders into. Always mounted (so
 * the world survives screen changes); hidden and asleep outside play.
 */
export function Stage({ session, visible }: { session: FaceControlSession; visible: boolean }) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    session.setStage(ref.current);
    return () => session.setStage(null);
  }, [session]);

  return <div ref={ref} aria-hidden className={cn("fixed inset-0 z-0", !visible && "invisible")} />;
}
