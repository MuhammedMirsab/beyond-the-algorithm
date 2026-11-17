import Image from "next/image";
import { ZoomIn } from "lucide-react";
import { IconButton } from "@/components/ui/button";
import { ROUND_SIZES } from "../engine/preload";
import type { PairPhoto, Side } from "../engine/types";
import { PickLabel, SideBadge, TruthLabel } from "./labels";
import { cn } from "@/lib/cn";

export type LoadStatus = "loading" | "loaded" | "error";

/** Alt text names the scene, never the answer, until the round is over. */
export function photoAlt(side: Side, subject: string, photo: PairPhoto, revealed: boolean): string {
  if (!revealed) return `Photo ${side}: ${subject}`;
  return `Photo ${side}, ${photo.isReal ? "the real photo" : "made by AI"}: ${subject}`;
}

/**
 * One of the two big photos in a round. The whole photo is the button; the
 * magnifier sits beside it (not inside: buttons can't nest). Both photos of a
 * pair share one aspect box and are cropped the same way, so shape never gives
 * the answer away.
 */
export function PhotoSlot({
  side,
  photo,
  subject,
  status,
  revealed,
  picked,
  pickCorrect,
  canChoose,
  onChoose,
  onZoom,
  onSettle,
}: {
  side: Side;
  photo: PairPhoto;
  subject: string;
  status: LoadStatus;
  revealed: boolean;
  picked: boolean;
  pickCorrect: boolean;
  canChoose: boolean;
  onChoose: (side: Side) => void;
  onZoom: (side: Side) => void;
  onSettle: (side: Side, status: Exclude<LoadStatus, "loading">) => void;
}) {
  const isAi = !photo.isReal;
  return (
    <div
      className={cn(
        "relative aspect-[var(--ratio)] w-full justify-self-center",
        // Landscape phones: keep each stacked photo inside the screen.
        "max-w-[calc(max(12rem,100dvh_-_9rem)*var(--ratio))] md:max-w-none",
      )}
    >
      <button
        type="button"
        onClick={() => onChoose(side)}
        disabled={!canChoose}
        aria-label={revealed ? photoAlt(side, subject, photo, true) : `Choose photo ${side}`}
        className={cn(
          "absolute inset-0 overflow-hidden rounded-lg bg-sunken md:rounded-xl",
          // Tailwind 4's scale-* sets the `scale` property, so that's what transitions.
          "transition-[box-shadow,scale] duration-150 ease-out",
          "enabled:cursor-pointer enabled:hover:ring-2 enabled:hover:ring-fg/60 enabled:active:scale-[0.985]",
          "focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-fg",
          "disabled:cursor-default",
          revealed && isAi && "ring-4 ring-game ring-offset-4 ring-offset-canvas",
        )}
      >
        {status === "loading" ? (
          <span className="type-label absolute inset-0 grid place-items-center text-fg-subtle">Loading photo</span>
        ) : null}
        {status === "error" ? (
          <span className="type-small absolute inset-0 grid place-items-center px-6 text-center text-fg-muted">
            This photo didn&apos;t load. Pick the other one if you can spot it.
          </span>
        ) : null}
        <Image
          src={photo.src}
          alt={photoAlt(side, subject, photo, revealed)}
          fill
          sizes={ROUND_SIZES}
          loading="eager"
          fetchPriority="high"
          draggable={false}
          onLoad={() => onSettle(side, "loaded")}
          onError={() => onSettle(side, "error")}
          className={cn(
            "pointer-events-none select-none object-cover object-center [-webkit-touch-callout:none]",
            "transition-opacity duration-200 ease-out",
            status === "loaded" ? "opacity-100" : "opacity-0",
          )}
        />
      </button>

      <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2 lg:left-4 lg:top-4">
        <SideBadge side={side} />
        {revealed ? <TruthLabel isReal={photo.isReal} /> : null}
      </div>

      <IconButton
        label={`Look closer at photo ${side}`}
        icon={<ZoomIn />}
        onClick={() => onZoom(side)}
        className="absolute right-3 top-3 lg:right-4 lg:top-4 lg:size-14 lg:[&_svg]:size-6"
      />

      {revealed && picked ? (
        <div className="pointer-events-none absolute bottom-3 left-3 lg:bottom-4 lg:left-4">
          <PickLabel correct={pickCorrect} />
        </div>
      ) : null}
    </div>
  );
}
