/**
 * Reads a design token for canvas drawing. Custom properties resolve through
 * the element's ancestors (data-game sets --game), so pass an element inside
 * the game. Returns the fallback if the browser's canvas can't parse it.
 */
export function cssColor(el: Element, name: string, fallback: string): string {
  const value = getComputedStyle(el).getPropertyValue(name).trim();
  if (!value) return fallback;
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return fallback;
  ctx.fillStyle = "#010203";
  ctx.fillStyle = value;
  // An unparseable colour leaves fillStyle unchanged.
  return ctx.fillStyle === "#010203" ? fallback : value;
}
