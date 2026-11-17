import { cn } from "@/lib/cn";

export type SensorId = "motion" | "gps" | "camera" | "microphone" | "light" | "touch" | "battery" | "connection";

/**
 * Isometric illustration of one sensor inside a phone. Fills its box; keep the
 * box square. `active` lifts the sensor part out of the phone (exploded view).
 *
 * Placeholder: the isometric drawings replace this body; the API stays.
 */
export function SensorArt({ sensor, active = false, className }: { sensor: SensorId; active?: boolean; className?: string }) {
  return (
    <div
      role="img"
      aria-label={`${sensor} sensor`}
      className={cn("grid aspect-square size-full place-items-center rounded-lg bg-game-soft text-game", className)}
    >
      <span className={cn("type-label transition-transform duration-300 ease-out", active && "-translate-y-1")}>{sensor}</span>
    </div>
  );
}
