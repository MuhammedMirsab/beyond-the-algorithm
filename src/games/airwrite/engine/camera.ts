/**
 * Opens the webcam. Errors are rethrown as the browser raised them, so the
 * shared cameraIssueFrom() can turn them into the arcade's camera copy.
 */

function errorName(err: unknown): string {
  if (typeof err === "object" && err !== null && "name" in err) return String((err as { name: unknown }).name);
  return "";
}

/** Modest resolution keeps tracking fast on ordinary school laptops. */
export async function openCamera(): Promise<MediaStream> {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    // cameraIssueFrom() reads the reason (insecure page, no camera API) from the browser itself.
    throw new Error("The camera API is not available.");
  }
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: "user",
        width: { ideal: 960 },
        height: { ideal: 540 },
        frameRate: { ideal: 30, max: 60 },
      },
    });
  } catch (err) {
    const name = errorName(err);
    if (name !== "NotFoundError" && name !== "OverconstrainedError" && name !== "DevicesNotFoundError") throw err;
    // Some webcams reject the constraints; retry with anything that works.
    return navigator.mediaDevices.getUserMedia({ audio: false, video: true });
  }
}

export function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((t) => t.stop());
}
