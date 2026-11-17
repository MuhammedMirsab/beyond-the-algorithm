export type CameraErrorCode = "denied" | "missing" | "busy" | "insecure" | "unsupported" | "ended" | "unknown";

export class CameraError extends Error {
  constructor(
    readonly code: CameraErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "CameraError";
  }
}

/**
 * Opens the front camera. 720p gives the landmark model a sharper crop when
 * the player stands back from the laptop; 30 fps matches typical webcams and
 * keeps the tracker within budget on ordinary school laptops.
 */
export async function openCamera(): Promise<MediaStream> {
  if (!window.isSecureContext) throw new CameraError("insecure");
  if (!navigator.mediaDevices?.getUserMedia) throw new CameraError("unsupported");
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: "user",
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30, max: 30 },
      },
    });
  } catch (err) {
    const name = err instanceof DOMException ? err.name : "";
    if (name === "NotAllowedError" || name === "SecurityError") throw new CameraError("denied");
    if (name === "NotFoundError" || name === "OverconstrainedError" || name === "DevicesNotFoundError")
      throw new CameraError("missing");
    if (name === "NotReadableError" || name === "AbortError" || name === "TrackStartError") throw new CameraError("busy");
    throw new CameraError("unknown", err instanceof Error ? err.message : String(err));
  }
}

/** Stops every track so the browser's camera indicator switches off. */
export function stopStream(stream: MediaStream | null | undefined) {
  stream?.getTracks().forEach((track) => track.stop());
}

/**
 * Attaches a stream to a (muted, inline) video element and waits for the
 * first frame. play() is called explicitly: a video that is not in the page
 * yet never autoplays, so waiting for data first would wait forever.
 */
export async function attachStream(video: HTMLVideoElement, stream: MediaStream) {
  video.muted = true;
  video.playsInline = true;
  video.autoplay = true;
  video.srcObject = stream;
  const started = video.play().catch(() => {
    /* muted inline playback is always allowed; ignore spurious aborts */
  });
  if (video.readyState >= 2) return;
  await new Promise<void>((resolve, reject) => {
    const done = () => {
      cleanup();
      resolve();
    };
    const fail = () => {
      cleanup();
      reject(new CameraError("unknown", "The camera stream could not be played."));
    };
    const timer = window.setTimeout(fail, 8000);
    const cleanup = () => {
      window.clearTimeout(timer);
      video.removeEventListener("loadeddata", done);
      video.removeEventListener("error", fail);
    };
    video.addEventListener("loadeddata", done);
    video.addEventListener("error", fail);
    void started.then(() => {
      if (video.readyState >= 2) done();
    });
  });
}
