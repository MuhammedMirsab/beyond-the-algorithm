/**
 * Opens the webcam with the original app's request: 640 x 480, up to 60
 * frames a second (more frames, quicker strikes). Errors are rethrown as the
 * browser raised them, so the shared cameraIssueFrom() can name the problem.
 */

function errorName(err: unknown): string {
  if (typeof err === "object" && err !== null && "name" in err) return String((err as { name: unknown }).name);
  return "";
}

export async function openCamera(): Promise<MediaStream> {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    // cameraIssueFrom() reads the reason (insecure page, no camera API) from the browser itself.
    throw new Error("The camera API is not available.");
  }
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 60 } },
    });
  } catch (err) {
    const name = errorName(err);
    if (name !== "OverconstrainedError" && name !== "NotFoundError") throw err;
    // Some cameras and drivers reject the constraints: retry with anything that works.
    return navigator.mediaDevices.getUserMedia({ audio: false, video: true });
  }
}

export function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((t) => t.stop());
}
