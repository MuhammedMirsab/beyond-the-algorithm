import { Hand, ScanFace, Sun } from "lucide-react";
import type { ReactNode } from "react";
import type { Move } from "./model";
import type { PerceptionStatus } from "./use-perception";

/** What the camera can't see right now, most important first. Null when all is well. */
export function liveHint(status: PerceptionStatus, move: Move | null): { icon: ReactNode; text: string } | null {
  if (!status.hasPerson) return { icon: <ScanFace aria-hidden />, text: "Step in front of the camera so it can see you." };
  if (!status.shouldersVisible) return { icon: <ScanFace aria-hidden />, text: "Step back so your shoulders are in view." };
  if (move?.traits.needsHands && !status.hasHands) return { icon: <Hand aria-hidden />, text: "Show your hand to the camera." };
  if (status.light === "low") return { icon: <Sun aria-hidden />, text: "Find more light. The camera can barely see you." };
  if (status.light === "bright") return { icon: <Sun aria-hidden />, text: "Too bright. Move out of the direct light." };
  return null;
}
