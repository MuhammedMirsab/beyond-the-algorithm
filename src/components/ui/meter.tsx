import { cn } from "@/lib/cn";

export interface ConfidenceRow {
  id: string;
  label: string;
  /** 0 to 1. */
  value: number;
}

/**
 * What the model thinks, as bars. Used for predictions in every game, so
 * visitors learn to read "confidence" the same way everywhere.
 * The top row is highlighted in the game colour; the rest stay neutral.
 */
export function ConfidenceBars({
  rows,
  highlight,
  className,
  size = "md",
}: {
  rows: ConfidenceRow[];
  /** id of the row to highlight. Defaults to the highest value. */
  highlight?: string | null;
  className?: string;
  size?: "sm" | "md";
}) {
  const top = highlight ?? rows.reduce<ConfidenceRow | null>((a, r) => (!a || r.value > a.value ? r : a), null)?.id;
  return (
    <ul className={cn("flex flex-col", size === "md" ? "gap-3" : "gap-2", className)}>
      {rows.map((row) => {
        const pct = Math.round(Math.min(1, Math.max(0, row.value)) * 100);
        const active = row.id === top;
        return (
          <li key={row.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5">
            <span className={cn("truncate font-semibold", size === "md" ? "type-body" : "type-small", active ? "text-fg" : "text-fg-muted")}>
              {row.label}
            </span>
            <span className={cn("tabular-nums font-semibold", size === "md" ? "type-body" : "type-small", active ? "text-game" : "text-fg-subtle")}>
              {pct}%
            </span>
            <span className="col-span-2 block h-2 overflow-hidden rounded-full bg-fg/10" aria-hidden>
              <span
                className={cn(
                  "block h-full origin-left rounded-full transition-transform duration-300 ease-out",
                  active ? "bg-game" : "bg-fg/35",
                )}
                style={{ transform: `scaleX(${pct / 100})` }}
              />
            </span>
          </li>
        );
      })}
    </ul>
  );
}
