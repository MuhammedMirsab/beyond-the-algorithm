"use client";

import { useEffect } from "react";
import { GAMES } from "@/content/games";
import { ARCADE } from "@/content/plays";
import { openPage, track } from "@/lib/play-tracker";

const SLUGS = new Set<string>(GAMES.map((g) => g.slug));

/**
 * Analytics for the hub: a session for the arcade page itself and which game
 * tile was opened from it. Renders nothing.
 */
export function ArcadeTracker() {
  useEffect(() => {
    const release = openPage(ARCADE);
    const onClick = (e: MouseEvent) => {
      const link = e.target instanceof Element ? e.target.closest("a[href]") : null;
      if (!link) return;
      const path = new URL(link.getAttribute("href") ?? "", window.location.href).pathname.replace(/^\/+|\/+$/g, "");
      if (SLUGS.has(path)) track.step("game", path);
    };
    document.addEventListener("click", onClick, { capture: true });
    return () => {
      document.removeEventListener("click", onClick, { capture: true });
      release();
    };
  }, []);
  return null;
}
