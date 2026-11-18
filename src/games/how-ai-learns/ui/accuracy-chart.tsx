import type { EpochLog } from "../engine/classifier";
import { cn } from "@/lib/cn";

/**
 * Training as it happens, from TF.js's own numbers after each round: the
 * share of its examples it gets right (rising) and the loss, how wrong it
 * still is (falling, drawn against the first round's loss). Grows one point
 * per round. Lines are SVG (stretched to fit); labels are HTML so they stay
 * type-label size.
 */
export function AccuracyChart({ history, total, className }: { history: EpochLog[]; total: number; className?: string }) {
  const x = (epoch: number) => (total <= 1 ? 0 : ((epoch - 1) / (total - 1)) * 100);
  const y = (share: number) => (1 - Math.min(1, Math.max(0, share))) * 100;
  const firstLoss = Math.max(1e-6, history[0]?.loss ?? 1);
  const accuracy = history.map((h) => `${x(h.epoch).toFixed(2)},${y(h.accuracy).toFixed(2)}`).join(" ");
  const loss = history.map((h) => `${x(h.epoch).toFixed(2)},${y(h.loss / firstLoss).toFixed(2)}`).join(" ");
  const first = history[0];
  const last = history.at(-1);
  const description = last
    ? `Chart: after round 1 it got ${Math.round((first?.accuracy ?? 0) * 100)}% of its examples right with a loss of ${(first?.loss ?? 0).toFixed(2)}; after round ${last.epoch} of ${total}, ${Math.round(last.accuracy * 100)}% right with a loss of ${last.loss.toFixed(2)}.`
    : "Chart of training rounds. Waiting for the first round.";

  return (
    <figure className={cn("flex flex-col gap-3", className)}>
      <div role="img" aria-label={description} className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3">
        <div aria-hidden className="type-label flex h-40 flex-col justify-between text-right text-fg-subtle tabular-nums">
          <span className="-translate-y-1/2">100%</span>
          <span>50%</span>
          <span className="translate-y-1/2">0%</span>
        </div>
        <div className="relative h-40">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden className="absolute inset-0 size-full overflow-visible">
            {[0, 50, 100].map((v) => (
              <line key={v} x1={0} x2={100} y1={v} y2={v} className="stroke-line-strong" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            ))}
            {history.length > 1 ? (
              <>
                <polyline
                  points={loss}
                  fill="none"
                  className="stroke-fg-muted"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
                <polyline
                  points={accuracy}
                  fill="none"
                  className="stroke-game"
                  strokeWidth={3}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              </>
            ) : null}
          </svg>
          {last ? (
            <>
              <span
                aria-hidden
                className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-fg-muted"
                style={{ left: `${x(last.epoch)}%`, top: `${y(last.loss / firstLoss)}%` }}
              />
              <span
                aria-hidden
                className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-game"
                style={{ left: `${x(last.epoch)}%`, top: `${y(last.accuracy)}%` }}
              />
            </>
          ) : null}
        </div>
        <span aria-hidden />
        <div aria-hidden className="type-label mt-2 flex justify-between text-fg-subtle tabular-nums">
          <span>Round 1</span>
          <span>Round {total}</span>
        </div>
      </div>
      <figcaption aria-hidden className="flex flex-wrap gap-x-5 gap-y-1">
        <span className="type-label inline-flex items-center gap-2 text-fg-muted">
          <span className="h-[3px] w-5 rounded-full bg-game" />
          Examples it gets right
        </span>
        <span className="type-label inline-flex items-center gap-2 text-fg-muted">
          <span className="h-0 w-5 border-t-2 border-dashed border-fg-muted" />
          Loss: how wrong it is
        </span>
      </figcaption>
    </figure>
  );
}
