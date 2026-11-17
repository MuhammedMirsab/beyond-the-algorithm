/**
 * Canvas drawing can't use Tailwind classes, so canvases read the design
 * tokens (CSS custom properties) at runtime and convert them to rgba().
 */
function readRgb(value: string): [number, number, number] | null {
  if (typeof document === "undefined" || !value) return null;
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  const sentinel = "#010203";
  ctx.fillStyle = sentinel;
  ctx.fillStyle = value;
  if (ctx.fillStyle === sentinel) return null;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return [r, g, b];
}

/** A token such as "--game" or "--color-fg", resolved on `el`, as rgba() with `alpha`. */
export function tokenColor(el: Element, name: string, alpha = 1, fallback = "rgba(255, 255, 255, 1)") {
  const rgb = readRgb(getComputedStyle(el).getPropertyValue(name).trim());
  return rgb ? `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})` : fallback;
}
