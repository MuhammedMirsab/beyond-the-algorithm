import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

const CREDITS = [
  { what: "Piano", who: "Salamander Grand Piano V3 by Alexander Holm", license: "CC BY 3.0" },
  { what: "Guitar and bass", who: "tonejs-instruments samples", license: "MIT" },
  { what: "808 drums and electronic hits", who: "TR-808 samples via @fluid-music/tr-808", license: "ISC" },
];

/**
 * Who recorded the sounds, behind a native disclosure (keyboard and screen
 * reader friendly for free). The other sounds are synthesised in the browser.
 */
export function SoundCredits({ className }: { className?: string }) {
  return (
    <details className={cn("group rounded-lg bg-surface shadow-ring", className)}>
      <summary
        className={
          "flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 rounded-lg px-5 py-3 [&::-webkit-details-marker]:hidden " +
          "transition-colors duration-150 ease-out hover:bg-fg/[0.03] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg"
        }
      >
        <span className="type-body font-semibold text-fg">Sound credits</span>
        <ChevronDown
          aria-hidden
          className="size-5 shrink-0 text-fg-muted transition-transform duration-150 ease-out group-open:rotate-180 motion-reduce:transition-none"
        />
      </summary>
      <div className="flex flex-col gap-3 px-5 pb-5">
        <p className="type-small max-w-[40rem] text-fg-subtle">
          The drums, percussion and synth are built from waves and noise on this computer. Everything else, in your playing and in the bands, is a recording:
        </p>
        <ul className="flex flex-col divide-y divide-line">
          {CREDITS.map((c) => (
            <li key={c.what} className="flex flex-col gap-1 py-3">
              <span className="type-small font-semibold text-fg">{c.what}</span>
              <span className="type-small text-fg-muted">
                {c.who}, {c.license}.
              </span>
            </li>
          ))}
        </ul>
        <p className="type-small text-fg-subtle">Hand tracking: Google MediaPipe, Apache 2.0.</p>
      </div>
    </details>
  );
}
