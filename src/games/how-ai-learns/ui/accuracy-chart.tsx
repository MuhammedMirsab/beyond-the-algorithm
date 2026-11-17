import type { EpochLog } from "../engine/classifier";
import { cn } from "@/lib/cn";

/**
 * Accuracy on the visitor's own examples after each practice round, as
 * reported by TF.js. Grows one point per round while training runs.
 * Lines are SVG (stretched to fit); labels are HTML so they stay type-label size.
 */
export function AccuracyChart({ history, total, className }: { history: EpochLog[]; total: number; className?: string }) {
  const x = (epoch: number) => (total <= 1 ? 0 : ((epoch - 1) / (total - 1)) * 100);
  const y = (acc: number) => (1 - Math.min(1, Math.max(0, acc))) * 100;
  const points = history.map((h) => `${x(h.epoch).toFixed(2)},${y(h.accuracy).toFixed(2)}`).join(" ");
  const first = history[0];
  const last = history.at(-1);
  const description = last
    ? `Chart: ${Math.round((first?.accuracy ?? 0) * 100)}% of its examples right after round 1, ${Math.round(last.accuracy * 100)}% after round ${last.epoch} of ${total}.`
    : "Chart of accuracy per round. Waiting for the first round.";

  return (
    <figure className={cn("flex flex-col gap-2", className)}>
      <div role="img" aria-label={description} className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3">
        <div aria-hidden className="type-label flex h-36 flex-col justify-between text-right text-fg-subtle tabular-nums">
          <span className="-translate-y-1/2">100%</span>
          <span>50%</span>
          <span className="translate-y-1/2">0%</span>
        </div>
        <div className="relative h-36">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden className="absolute inset-0 size-full overflow-visible">
            {[0, 50, 100].map((v) => (
              <line key={v} x1={0} x2={100} y1={v} y2={v} className="stroke-line-strong" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            ))}
            {history.length > 1 ? (
              <polyline
                points={points}
                fill="none"
                className="stroke-game"
                strokeWidth={2.5}
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            ) : null}
          </svg>
          {last ? (
            <span
              aria-hidden
              className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-game"
              style={{ left: `${x(last.epoch)}%`, top: `${y(last.accuracy)}%` }}
            />
          ) : null}
        </div>
        <span aria-hidden />
        <div aria-hidden className="type-label mt-2 flex justify-between text-fg-subtle tabular-nums">
          <span>Round 1</span>
          <span>Round {total}</span>
        </div>
      </div>
    </figure>
  );
}
