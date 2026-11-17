"use client";

import { MotionConfig } from "motion/react";
import { useEffect, type ReactNode } from "react";
import { markHydrated } from "@/lib/entrance";

/** App-wide client providers. Motion respects the visitor's reduced-motion setting everywhere. */
export function Providers({ children }: { children: ReactNode }) {
  useEffect(() => markHydrated(), []);
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
