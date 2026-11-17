import type { CloudPoint } from "../engine/recognition/pdollar";
import type { LetterClouds } from "../engine/letters";
import { cn } from "@/lib/cn";

function Cloud({ points, label, char, className }: { points: CloudPoint[]; label: string; char: string; className?: string }) {
  return (
    <figure className="flex min-w-0 flex-col items-center gap-1.5">
      <svg viewBox="-0.75 -0.75 1.5 1.5" aria-hidden className={cn("size-20", className)}>
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={0.03} fill="currentColor" />
        ))}
      </svg>
      <figcaption className="type-label truncate text-fg-subtle">
        {label} <span className="normal-case text-fg">{char}</span>
      </figcaption>
    </figure>
  );
}

/** The machine's view of one letter: 32 points, next to the library shape it was matched with. */
export function LetterCloudsCompare({ clouds, sample = false }: { clouds: LetterClouds; sample?: boolean }) {
  return (
    <div
      role="img"
      aria-label={`${sample ? "Example: a" : "Your"} letter ${clouds.char} as ${clouds.yours.length} points, next to the library's ${clouds.char}`}
      className="dot-field grid h-36 grid-cols-2 items-center px-3"
    >
      <Cloud points={clouds.yours} label={sample ? "Written" : "Yours"} char={clouds.char} className="text-fg" />
      <Cloud points={clouds.library} label="Library" char={clouds.char} className="text-game" />
    </div>
  );
}
