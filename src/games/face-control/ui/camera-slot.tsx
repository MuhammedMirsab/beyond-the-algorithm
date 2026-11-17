"use client";

import { useLayoutEffect, useRef } from "react";
import type { Density } from "../play/camera-surface";
import type { FaceControlSession } from "../play/session";
import { cn } from "@/lib/cn";

/**
 * A place on screen for the live camera and its landmark overlay. The game
 * has one camera preview that moves into whichever slot is mounted, so the
 * face tracker never loses its video between screens.
 */
export function CameraSlot({
  session,
  density = "all",
  className,
  children,
}: {
  session: FaceControlSession;
  density?: Density;
  className?: string;
  /** Overlays drawn above the video (e.g. the face guide). */
  children?: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    session.showCamera(el, density);
    return () => session.releaseCamera(el);
  }, [session, density]);

  return (
    <div className={cn("relative overflow-hidden bg-sunken", className)}>
      <div ref={ref} className="absolute inset-0" />
      {children}
    </div>
  );
}
