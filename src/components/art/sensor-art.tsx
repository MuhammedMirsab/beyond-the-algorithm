import { IsoPhone, ON_DARK, type PhonePart } from "./iso-phone";
import { cn } from "@/lib/cn";

export type SensorId = "motion" | "gps" | "camera" | "microphone" | "light" | "touch" | "battery" | "connection";

const PART: Record<SensorId, PhonePart> = {
  motion: "motion",
  gps: "gps",
  camera: "camera",
  microphone: "microphone",
  light: "light",
  touch: "touch",
  battery: "battery",
  connection: "connection",
};

const NAME: Record<SensorId, string> = {
  motion: "Motion sensor (accelerometer and gyroscope)",
  gps: "GPS antenna",
  camera: "Camera module",
  microphone: "Microphone",
  light: "Light sensor",
  touch: "Touch layer in the glass",
  battery: "Battery",
  connection: "Wi-Fi and mobile radio",
};

/**
 * Isometric illustration of one sensor inside a phone: the phone exploded
 * into its layers, the sensor lit in the game colour and lifted out.
 * Fills its box; keep the box roughly square. `active` lifts the part further.
 */
export function SensorArt({ sensor, active = false, className }: { sensor: SensorId; active?: boolean; className?: string }) {
  // Glass-level parts need less lift to clear the phone; board parts need more.
  const lift = sensor === "touch" ? 16 : sensor === "light" ? 26 : 40;
  const zoom: Record<SensorId, number> = { motion: 2.3, gps: 1.5, camera: 1.3, microphone: 1.9, light: 2.6, touch: 1, battery: 1, connection: 2 };
  return (
    <div role="img" aria-label={`Where it is: ${NAME[sensor]}`} className={cn("grid size-full place-items-center", className)}>
      <IsoPhone lit={PART[sensor]} lift={lift} litScale={zoom[sensor]} active={active} explode={0.62} colors={ON_DARK} className="size-full" />
    </div>
  );
}
