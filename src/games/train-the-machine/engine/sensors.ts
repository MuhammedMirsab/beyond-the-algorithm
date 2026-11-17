/**
 * Camera light, sharpness and motion, measured on a 32 x 24 copy of the
 * frame. Ported from the original cameraSensors.js, which kept its canvas and
 * the previous frame at module level (so one visitor's last frame stayed in
 * memory for the next) and returned made-up "synthetic" readings, a fake
 * 60 FPS and invented colour temperatures whenever the camera wasn't ready.
 * Here each game owns an instance, reset per visitor, and no frame means no
 * reading.
 */

export interface SensorReading {
  /** Mean brightness, 0 to 100. */
  light: number;
  /** Edge strength, 0 to 100. Low on blur, but also on plain backgrounds. */
  focus: number;
  /** Change since the previous reading, 0 to 100. */
  motion: number;
}

export type LightStatus = "low" | "dim" | "ok" | "bright";

const SAMPLE_W = 32;
const SAMPLE_H = 24;

export function lightStatus(light: number): LightStatus {
  if (light < 25) return "low";
  if (light < 38) return "dim";
  if (light > 80) return "bright";
  return "ok";
}

export class CameraSensors {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private previous: Float32Array | null = null;

  read(video: HTMLVideoElement): SensorReading | null {
    if (!video.videoWidth || video.readyState < 2) return null;
    const ctx = this.context();
    if (!ctx) return null;

    ctx.drawImage(video, 0, 0, SAMPLE_W, SAMPLE_H);
    const data = ctx.getImageData(0, 0, SAMPLE_W, SAMPLE_H).data;
    const total = SAMPLE_W * SAMPLE_H;
    const lum = new Float32Array(total);
    let sum = 0;
    for (let i = 0; i < total; i++) {
      // Perceptual luminance (Rec. 709).
      lum[i] = 0.2126 * data[i * 4] + 0.7152 * data[i * 4 + 1] + 0.0722 * data[i * 4 + 2];
      sum += lum[i];
    }
    const light = Math.round((sum / total / 255) * 100);

    // Sharpness: average gradient on every other pixel.
    let gradient = 0;
    let count = 0;
    for (let y = 1; y < SAMPLE_H - 1; y += 2) {
      for (let x = 1; x < SAMPLE_W - 1; x += 2) {
        const i = y * SAMPLE_W + x;
        gradient += Math.abs(lum[i] - lum[i + 1]) + Math.abs(lum[i] - lum[i + SAMPLE_W]);
        count++;
      }
    }
    const focus = Math.min(100, Math.round((count ? gradient / count : 0) * 3.2));

    // Motion: mean change from the previous reading.
    let motion = 0;
    if (this.previous) {
      let diff = 0;
      for (let i = 0; i < total; i += 2) diff += Math.abs(lum[i] - this.previous[i]);
      motion = Math.min(100, Math.round((diff / (total / 2) / 255) * 400));
    }
    this.previous = lum;

    return { light, focus, motion };
  }

  /** Forget the last frame and the canvas (Next player). */
  reset() {
    this.previous = null;
    if (this.canvas) {
      this.canvas.width = 0;
      this.canvas.height = 0;
    }
    this.canvas = null;
    this.ctx = null;
  }

  private context(): CanvasRenderingContext2D | null {
    if (this.ctx) return this.ctx;
    if (typeof document === "undefined") return null;
    const canvas = document.createElement("canvas");
    canvas.width = SAMPLE_W;
    canvas.height = SAMPLE_H;
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { willReadFrequently: true });
    return this.ctx;
  }
}
