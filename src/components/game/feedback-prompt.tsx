"use client";

import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { ArrowRight } from "lucide-react";
import { useSyncExternalStore } from "react";
import { useGameSlug } from "@/lib/game-context";
import { cn } from "@/lib/cn";

const subscribe = () => () => {};
const getOrigin = () => window.location.origin;
const getServerOrigin = () => null;

/**
 * End of a game: "How was it?" as a QR code, so a visitor can walk away and
 * answer on their own phone. On touch screens (a visitor already holding the
 * game on their phone) it is a plain link instead. The only way into /feedback.
 */
export function FeedbackPrompt({ className }: { className?: string }) {
  const slug = useGameSlug();
  const origin = useSyncExternalStore(subscribe, getOrigin, getServerOrigin);
  const path = slug ? `/feedback?game=${slug}` : "/feedback";
  const url = origin ? `${origin}${path}` : null;

  return (
    <div className={cn("shrink-0", className)}>
      {/* Mouse and keyboard (the booth laptop): scan with your phone. */}
      <div className="flex items-center gap-4 rounded-lg bg-sunken p-2 pr-5 shadow-ring pointer-coarse:hidden">
        <div className="grid size-[100px] shrink-0 place-items-center rounded-md bg-white">
          {url ? (
            <QRCodeSVG value={url} size={84} level="M" marginSize={0} bgColor="#ffffff" fgColor="#0e1015" title="QR code for the feedback form" />
          ) : null}
        </div>
        <div className="flex max-w-[13rem] flex-col gap-1">
          <span className="type-body font-semibold text-fg">How was it?</span>
          <span className="type-small text-fg-subtle">Scan with your phone. Three quick questions.</span>
        </div>
      </div>

      {/* Touch screens: the visitor is on their own device already. */}
      <Link
        href={path}
        className={cn(
          "group/feedback hidden items-center gap-4 rounded-lg bg-sunken py-3 pl-5 pr-3 shadow-ring pointer-coarse:flex",
          "transition-[background-color,scale] duration-150 ease-out active:scale-[0.98]",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg",
        )}
      >
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="type-body font-semibold text-fg">How was it?</span>
          <span className="type-small text-fg-subtle">Three quick questions.</span>
        </span>
        <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-fg/10 text-fg">
          <ArrowRight strokeWidth={2.5} className="size-5" />
        </span>
      </Link>
    </div>
  );
}
