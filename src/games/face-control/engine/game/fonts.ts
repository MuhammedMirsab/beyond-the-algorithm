/**
 * Font families for text drawn on canvases (Phaser signs, the "+100" label,
 * the calibration demo). The page fonts come from next/font as CSS variables
 * with generated family names, so they are read at runtime and loaded before
 * any texture is drawn. Until then, system fallbacks are used.
 */
const FALLBACK = {
  mono: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  display: "ui-sans-serif, system-ui, sans-serif",
} as const;

const families: { mono: string; display: string } = { ...FALLBACK };

export type CanvasFamily = keyof typeof FALLBACK;

/** A canvas `font` string, e.g. canvasFont(600, 12) → "600 12px <Martian Mono>, ui-monospace, ...". */
export function canvasFont(weight: number, px: number, family: CanvasFamily = "mono") {
  return `${weight} ${px}px ${families[family]}`;
}

export function setCanvasFonts(next: Partial<Record<CanvasFamily, string>>) {
  if (next.mono) families.mono = `${next.mono}, ${FALLBACK.mono}`;
  if (next.display) families.display = `${next.display}, ${FALLBACK.display}`;
}

let loading: Promise<void> | null = null;

/**
 * Reads --font-martian (mono) and --font-mona (display) from the root element
 * and waits for the weights the canvases use. Never rejects: a font that
 * fails to load just leaves the fallback in place.
 */
export function loadCanvasFonts(): Promise<void> {
  if (typeof document === "undefined") return Promise.resolve();
  if (!loading) {
    loading = (async () => {
      const style = getComputedStyle(document.documentElement);
      const mono = style.getPropertyValue("--font-martian").trim();
      const display = style.getPropertyValue("--font-mona").trim();
      setCanvasFonts({ mono: mono || undefined, display: display || undefined });
      if (!document.fonts?.load) return;
      const wanted = [
        mono && `500 12px ${mono}`,
        mono && `600 12px ${mono}`,
        mono && `600 16px ${mono}`,
        display && `700 16px ${display}`,
      ].filter((f): f is string => Boolean(f));
      await Promise.allSettled(wanted.map((f) => document.fonts.load(f)));
    })();
  }
  return loading;
}
