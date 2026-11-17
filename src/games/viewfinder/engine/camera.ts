import { cameraIssueFrom, type CameraIssue } from "@/components/game/camera-notice";

export type CameraFacing = "user" | "environment";

/**
 * Why a session could not start or stopped. The shared camera issues come
 * first (their copy lives in CAMERA_ISSUE_COPY); two are Viewfinder's own:
 *  - "webgl": the lenses need WebGL 2 and this browser has none.
 *  - "stopped": the camera ended mid-session but a camera is still listed
 *    (another app took it, or one of several cameras was unplugged).
 */
export type ViewfinderIssue = CameraIssue | "webgl" | "stopped";

export class ViewfinderError extends Error {
  constructor(
    readonly issue: ViewfinderIssue,
    message?: string,
  ) {
    super(message ?? issue);
    this.name = "ViewfinderError";
  }
}

/** Anything thrown while starting a session, as an issue the UI can explain. */
export function issueFrom(error: unknown): ViewfinderIssue {
  return error instanceof ViewfinderError ? error.issue : "unknown";
}

/**
 * 720p at up to 60 fps: a higher capture rate is the single biggest lever on
 * glass-to-glass latency (frames wait less in the camera pipeline), and the
 * tracker resizes to 224² internally anyway.
 */
export async function openCamera(facing: CameraFacing): Promise<MediaStream> {
  if (typeof window !== "undefined" && !window.isSecureContext) throw new ViewfinderError("insecure");
  if (!navigator.mediaDevices?.getUserMedia) throw new ViewfinderError("unsupported");
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: facing },
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 60, max: 60 },
      },
    });
  } catch (err) {
    // NotAllowed → denied, NotFound/Overconstrained → missing, NotReadable/Abort → busy.
    throw new ViewfinderError(cameraIssueFrom(err), err instanceof Error ? err.message : String(err));
  }
}

/**
 * The camera track ended on its own. The original app always called that
 * "Camera is in use", even when the webcam had just been unplugged. If no
 * camera is listed any more it is "missing"; otherwise it "stopped".
 */
export async function issueForEndedCamera(): Promise<ViewfinderIssue> {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.some((d) => d.kind === "videoinput") ? "stopped" : "missing";
  } catch {
    return "stopped";
  }
}

/** Whether the browser will show a permission prompt when we ask for the camera. */
export async function cameraPermission(): Promise<PermissionState | "unknown"> {
  try {
    const status = await navigator.permissions?.query({ name: "camera" });
    return status?.state ?? "unknown";
  } catch {
    return "unknown";
  }
}

export async function hasMultipleCameras() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((d) => d.kind === "videoinput").length > 1;
  } catch {
    return false;
  }
}

export function stopStream(stream: MediaStream | null | undefined) {
  stream?.getTracks().forEach((track) => track.stop());
}
