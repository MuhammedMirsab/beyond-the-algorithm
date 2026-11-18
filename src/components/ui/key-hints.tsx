import { Fragment, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Kbd } from "./surface";

export interface KeyHint {
  /** Key caps, e.g. ["←", "→"], ["Space"], ["1", "6"]. Arrow and letter keys read best as glyphs. */
  keys: ReactNode[];
  /** What they do, verb first and short: "Roll", "Jump", "Pause". */
  label: string;
  /** How several keys relate: side by side (any of them), "to" for a range (1 to 6), "+" for a chord. */
  join?: "any" | "to" | "plus";
}

/**
 * The one way to show keyboard controls. `row` sits in a HUD or under an
 * intro button; `list` is a tidy two-column table for settings and help.
 * Purely visual hints: the key handlers live with the game.
 */
export function KeyHints({
  items,
  layout = "row",
  size = "sm",
  tone = "neutral",
  className,
}: {
  items: KeyHint[];
  layout?: "row" | "list";
  size?: "sm" | "md";
  tone?: "neutral" | "on-game";
  className?: string;
}) {
  const muted = tone === "on-game" ? "text-game-ink/80" : "text-fg-muted";
  const joiner = (join: KeyHint["join"]) =>
    join === "to" ? (
      <span className={cn("type-small px-0.5", muted)}>to</span>
    ) : join === "plus" ? (
      <span aria-hidden className={cn("type-small", muted)}>
        +
      </span>
    ) : null;

  const keys = (item: KeyHint) => (
    <span className="inline-flex shrink-0 items-center gap-1">
      {item.keys.map((key, i) => (
        <Fragment key={i}>
          {i > 0 ? joiner(item.join) : null}
          <Kbd size={size} tone={tone}>
            {key}
          </Kbd>
        </Fragment>
      ))}
    </span>
  );

  if (layout === "list") {
    return (
      <dl className={cn("grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-2.5", className)}>
        {items.map((item) => (
          <Fragment key={item.label}>
            <dt className="justify-self-start">{keys(item)}</dt>
            <dd className={cn("type-small", muted)}>{item.label}</dd>
          </Fragment>
        ))}
      </dl>
    );
  }

  return (
    <ul className={cn("flex flex-wrap items-center gap-x-5 gap-y-2", className)}>
      {items.map((item) => (
        <li key={item.label} className="inline-flex items-center gap-2 whitespace-nowrap">
          {keys(item)}
          <span className={cn("type-small", muted)}>{item.label}</span>
        </li>
      ))}
    </ul>
  );
}
