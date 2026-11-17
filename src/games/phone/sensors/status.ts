/**
 * One lifecycle for every live sensor, so the "Try it" panel can speak about
 * all of them the same way.
 */
export type SensorStatus =
  | "idle"
  | "starting"
  | "live"
  | "denied"
  | "unavailable"
  | "busy"
  | "insecure"
  | "timeout"
  | "error";

export const isProblem = (status: SensorStatus) =>
  status === "denied" ||
  status === "unavailable" ||
  status === "busy" ||
  status === "insecure" ||
  status === "timeout" ||
  status === "error";

/** Maps a getUserMedia error to a status. */
export function statusFromMediaError(error: unknown): SensorStatus {
  if (typeof window !== "undefined" && window.isSecureContext === false) return "insecure";
  const name =
    typeof error === "object" && error !== null && "name" in error ? String((error as { name: unknown }).name) : "";
  if (name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError") return "denied";
  if (name === "NotFoundError" || name === "OverconstrainedError" || name === "DevicesNotFoundError") return "unavailable";
  if (name === "NotReadableError" || name === "AbortError" || name === "TrackStartError") return "busy";
  return "error";
}

export interface IssueCopy {
  title: string;
  text: string;
}

type Sensor = "motion" | "location" | "camera" | "microphone";

const NOUN: Record<Sensor, string> = {
  motion: "motion sensors",
  location: "location",
  camera: "camera",
  microphone: "microphone",
};

/** What happened and what to do, for each sensor and problem. */
export function issueCopy(sensor: Sensor, status: SensorStatus): IssueCopy {
  const noun = NOUN[sensor];
  switch (status) {
    case "denied":
      return sensor === "motion"
        ? {
            title: "Motion sensors are blocked",
            text: "Reload the page and choose Allow when your phone asks. Or try the simulation.",
          }
        : {
            title: `The ${noun} is blocked`,
            text: `Allow the ${noun} for this site in your browser settings, then try again. Or try the simulation.`,
          };
    case "unavailable":
      return sensor === "motion"
        ? { title: "No motion sensor found", text: "This device didn't send any tilt readings. Try the simulation instead." }
        : sensor === "location"
          ? { title: "Your location wasn't found", text: "Move closer to a window and try again, or try the simulation." }
          : { title: `No ${noun} found`, text: `This device doesn't seem to have a ${noun}. Try the simulation instead.` };
    case "busy":
      return { title: `The ${noun} is in use`, text: "Another app or tab is using it. Close that, then try again." };
    case "insecure":
      return { title: "This needs a secure page", text: `Open the arcade from its https:// address to use the ${noun}.` };
    case "timeout":
      return { title: "Finding you took too long", text: "Try again near a window, or try the simulation." };
    default:
      return { title: `The ${noun} didn't start`, text: "Try again. If it keeps happening, try the simulation." };
  }
}
