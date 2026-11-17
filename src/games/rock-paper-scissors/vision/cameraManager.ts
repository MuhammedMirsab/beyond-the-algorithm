/**
 * The webcam, copied from the original app. `analyzeFrameQuality` is unchanged:
 * it shrinks each frame to 48 x 36 to measure brightness and movement, and
 * keeps no image. Changes: one front camera at a fixed 640 x 480 (no device or
 * quality pickers at the booth), and a failed `play()` no longer counts as a
 * camera failure (the video is played again when it is shown).
 *
 * Browser only: call these from event handlers or effects, never during render.
 */

export interface FrameQualityAnalysis {
  brightnessScore: number; // 0..255
  motionScore: number; // 0..1
  isLowLight: boolean;
  isHighMotionBlur: boolean;
}

const CONSTRAINTS: MediaTrackConstraints = {
  width: { ideal: 640 },
  height: { ideal: 480 },
  frameRate: { ideal: 30 },
  facingMode: "user",
};

export class CameraManager {
  private stream: MediaStream | null = null;
  private analysisCanvas: HTMLCanvasElement | null = null;
  private analysisCtx: CanvasRenderingContext2D | null = null;
  private prevLumaBuffer: Uint8Array | null = null;

  public async startCamera(
    videoElement: HTMLVideoElement,
    options: { onTrackEnded?: () => void } = {},
  ): Promise<MediaStream> {
    this.stopCamera(videoElement);

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Webcam API (getUserMedia) is not supported in this browser.");
    }

    const stream = await navigator.mediaDevices.getUserMedia({ video: CONSTRAINTS, audio: false });

    this.stream = stream;
    videoElement.srcObject = stream;
    videoElement.playsInline = true;
    videoElement.muted = true;

    const track = stream.getVideoTracks()[0];
    if (track && options.onTrackEnded) {
      track.onended = () => {
        options.onTrackEnded?.();
      };
    }

    // Autoplay can be refused while the element is off screen; it is played
    // again as soon as the camera view shows it.
    await videoElement.play().catch(() => undefined);
    return stream;
  }

  public stopCamera(videoElement?: HTMLVideoElement | null): void {
    if (this.stream) {
      for (const track of this.stream.getTracks()) {
        track.onended = null;
        track.stop();
      }
      this.stream = null;
    }
    if (videoElement) {
      videoElement.srcObject = null;
    }
    this.prevLumaBuffer = null;
  }

  public isActive(): boolean {
    if (!this.stream) return false;
    return this.stream.getVideoTracks().some((t) => t.readyState === "live");
  }

  /**
   * Downsamples video frame to 48x36 to measure ambient brightness & inter-frame motion blur
   * without storing any image data.
   */
  public analyzeFrameQuality(videoElement: HTMLVideoElement): FrameQualityAnalysis {
    if (videoElement.readyState < 2 || videoElement.videoWidth === 0) {
      return { brightnessScore: 128, motionScore: 0, isLowLight: false, isHighMotionBlur: false };
    }

    if (!this.analysisCanvas) {
      this.analysisCanvas = document.createElement("canvas");
      this.analysisCanvas.width = 48;
      this.analysisCanvas.height = 36;
      this.analysisCtx = this.analysisCanvas.getContext("2d", { willReadFrequently: true });
    }

    const ctx = this.analysisCtx;
    if (!ctx) {
      return { brightnessScore: 128, motionScore: 0, isLowLight: false, isHighMotionBlur: false };
    }

    ctx.drawImage(videoElement, 0, 0, 48, 36);
    const imgData = ctx.getImageData(0, 0, 48, 36).data;
    const pixelCount = 48 * 36;
    const luma = new Uint8Array(pixelCount);

    let lumaSum = 0;
    let diffSum = 0;
    for (let i = 0; i < pixelCount; i++) {
      const idx = i * 4;
      const y = Math.round(0.299 * imgData[idx] + 0.587 * imgData[idx + 1] + 0.114 * imgData[idx + 2]);
      luma[i] = y;
      lumaSum += y;
      if (this.prevLumaBuffer) {
        diffSum += Math.abs(y - this.prevLumaBuffer[i]);
      }
    }

    const brightnessScore = lumaSum / pixelCount;
    const motionScore = this.prevLumaBuffer ? Math.min(1, diffSum / (pixelCount * 42)) : 0;
    this.prevLumaBuffer = luma;

    return {
      brightnessScore,
      motionScore,
      isLowLight: brightnessScore < 48,
      isHighMotionBlur: motionScore > 0.58,
    };
  }

  /** Releases the analysis canvas too (on unmount). */
  public dispose(videoElement?: HTMLVideoElement | null): void {
    this.stopCamera(videoElement);
    this.analysisCanvas = null;
    this.analysisCtx = null;
  }
}
