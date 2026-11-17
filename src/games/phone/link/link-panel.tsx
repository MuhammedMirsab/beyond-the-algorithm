"use client";

import { Smartphone, Unlink } from "lucide-react";
import { PhoneHandoff } from "@/components/game/phone-handoff";
import { Button } from "@/components/ui/button";
import { StatusDot } from "@/components/ui/surface";
import { cn } from "@/lib/cn";
import { useLink } from "./link";

/**
 * The booth laptop's QR code. While the laptop holds a fresh code, scanning
 * it links the phone to this screen; once a phone is linked the code goes
 * away. If the matchmaking server can't be reached, it falls back to the
 * plain link, so the phone can still play on its own.
 */
export function LinkHandoff({ size, className }: { size: number; className?: string }) {
  const link = useLink();

  if (link.role === "host" && link.linked) {
    return (
      <div className={cn("flex w-fit max-w-md items-start gap-4 rounded-lg bg-surface p-4 pr-5 shadow-ring", className)}>
        <span className="grid size-10 shrink-0 place-items-center rounded-md bg-game-soft text-game">
          <Smartphone aria-hidden className="size-5" />
        </span>
        <div className="flex min-w-0 flex-col gap-2">
          <StatusDot tone="success" label="Phone linked" />
          <span className="type-small text-fg-muted">
            This screen now shows what the visitor does on their phone. Only readings are sent, never the camera picture or sound,
            and nothing is saved.
          </span>
          <Button variant="ghost" icon={<Unlink />} onClick={() => link.end()} className="-ml-3 self-start">
            Unlink phone
          </Button>
        </div>
      </div>
    );
  }

  if (link.role === "host" && link.hostId) {
    return (
      <PhoneHandoff
        path={`/phone#link=${link.hostId}`}
        title="Use your phone as the sensor"
        text="Scan with your phone's camera. Your phone's sensors drive this screen. Nothing is saved."
        size={size}
        className={cn("w-fit", className)}
      />
    );
  }

  return (
    <PhoneHandoff
      path="/phone"
      title="Try the real sensors on your phone"
      text="Scan the code with your phone's camera."
      size={size}
      className={cn("w-fit", className)}
    />
  );
}

/** On the visitor's phone: whether it is linked to the booth screen, and a way out. */
export function PhoneLinkBar() {
  const link = useLink();
  const { phase } = link;
  if (phase === "idle" || phase === "waiting") return null;

  const text =
    phase === "connecting"
      ? "Linking to the booth screen."
      : phase === "connected"
        ? "Linked to the booth screen. It gets your readings, never your camera picture or sound."
        : phase === "ended"
          ? "Unlinked from the booth screen. Nothing was kept on either device."
          : "Couldn't link to the booth screen. You can still try every sensor here.";

  return (
    <div role="status" className="mx-auto w-full max-w-[40rem] px-4 pb-2 sm:px-6">
      <div className="flex items-center gap-3 rounded-lg bg-surface py-2 pl-4 pr-2 shadow-ring">
        <span
          aria-hidden
          className={cn(
            "size-2 shrink-0 rounded-full",
            phase === "connected" ? "bg-success" : phase === "connecting" ? "animate-pulse bg-game" : "bg-fg-faint",
          )}
        />
        <span className="type-small min-w-0 flex-1 text-fg-muted">{text}</span>
        {phase === "connected" ? (
          <Button variant="ghost" size="sm" onClick={() => link.end()}>
            Unlink
          </Button>
        ) : phase === "connecting" ? null : (
          <Button variant="ghost" size="sm" onClick={link.dismiss}>
            OK
          </Button>
        )}
      </div>
    </div>
  );
}
