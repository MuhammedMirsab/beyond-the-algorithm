"use client";

import { createContext, useContext } from "react";
import type { GameSlug } from "@/content/games";

/**
 * The game a screen belongs to. GameShell provides it; portalled UI (modals,
 * popovers) reads it to put `data-game` back on, so game colours still apply
 * outside the shell's DOM subtree.
 */
export const GameSlugContext = createContext<GameSlug | null>(null);

export function useGameSlug(): GameSlug | null {
  return useContext(GameSlugContext);
}
