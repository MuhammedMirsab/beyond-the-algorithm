/**
 * "Is there anything to look at?" Copied from the original
 * analyzeImagePresence: shrink the frame to 64 x 64, then look at brightness
 * and edges. A covered lens, a dark room or a blank wall is not a pen or a
 * cup, so the model should not pretend it is.
 */

export type EmptyReason = "dark" | "blank" | "no-edges";

export interface Presence {
  isEmpty: boolean;
  reason: EmptyReason | null;
}

export const PRESENCE_SIZE = 64;

/** Pure part: RGBA pixels of a PRESENCE_SIZE x PRESENCE_SIZE frame. */
export function presenceFromPixels(data: ArrayLike<number>, size = PRESENCE_SIZE): Presence {
  const n = size * size;
  const luma = new Float32Array(n);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const idx = i * 4;
    const y = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
    luma[i] = y;
    sum += y;
  }
  const mean = sum / n;
  let varSum = 0;
  for (let i = 0; i < n; i++) {
    const d = luma[i] - mean;
    varSum += d * d;
  }
  const lumaStd = Math.sqrt(varSum / n);

  let edgeSum = 0;
  let strongEdges = 0;
  let edgeCount = 0;
  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const idx = y * size + x;
      const g = Math.abs(luma[idx + 1] - luma[idx]) + Math.abs(luma[idx + size] - luma[idx]);
      edgeSum += g;
      if (g > 20) strongEdges++;
      edgeCount++;
    }
  }
  const meanEdge = edgeSum / Math.max(1, edgeCount);
  const strongEdgeRatio = strongEdges / Math.max(1, edgeCount);

  if (mean < 12 && lumaStd < 10) return { isEmpty: true, reason: "dark" };
  if (lumaStd < 11 && strongEdgeRatio < 0.025) return { isEmpty: true, reason: "blank" };
  if (meanEdge < 4.2 && strongEdgeRatio < 0.015) return { isEmpty: true, reason: "no-edges" };
  return { isEmpty: false, reason: null };
}

let presenceCanvas: HTMLCanvasElement | null = null;

/** Browser part: draw the frame small and check it. Never blocks a prediction on failure. */
export function analyzePresence(source: CanvasImageSource): Presence {
  try {
    if (!presenceCanvas) {
      presenceCanvas = document.createElement("canvas");
      presenceCanvas.width = PRESENCE_SIZE;
      presenceCanvas.height = PRESENCE_SIZE;
    }
    const ctx = presenceCanvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return { isEmpty: false, reason: null };
    ctx.drawImage(source, 0, 0, PRESENCE_SIZE, PRESENCE_SIZE);
    return presenceFromPixels(ctx.getImageData(0, 0, PRESENCE_SIZE, PRESENCE_SIZE).data);
  } catch {
    return { isEmpty: false, reason: null };
  }
}
