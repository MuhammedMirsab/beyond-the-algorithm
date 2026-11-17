"use client";

import { ArrowBigUp, ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { FaceControlSession } from "../play/session";

function HoldButton({
  label,
  icon,
  onPress,
  onRelease,
  className,
}: {
  label: string;
  icon: ReactNode;
  onPress: () => void;
  onRelease?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className={cn(
        "grid size-16 touch-none select-none place-items-center rounded-full bg-surface text-fg shadow-ring",
        "transition-[background-color,transform] duration-150 ease-out active:scale-[0.97] active:bg-raised [&_svg]:size-7",
        className,
      )}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        onPress();
      }}
      onPointerUp={onRelease}
      onPointerCancel={onRelease}
      onLostPointerCapture={onRelease}
      onContextMenu={(e) => e.preventDefault()}
    >
      {icon}
    </button>
  );
}

/** Keyboard mode on a phone or tablet: hold to roll, tap to jump. */
export function TouchControls({ session }: { session: FaceControlSession }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-end justify-between px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
      <div className="pointer-events-auto flex gap-3">
        <HoldButton label="Roll left" icon={<ChevronLeft />} onPress={() => session.touchSteer(-1, true)} onRelease={() => session.touchSteer(-1, false)} />
        <HoldButton label="Roll right" icon={<ChevronRight />} onPress={() => session.touchSteer(1, true)} onRelease={() => session.touchSteer(1, false)} />
      </div>
      <HoldButton label="Jump" icon={<ArrowBigUp />} onPress={() => session.touchJump()} className="pointer-events-auto bg-game text-game-ink active:bg-game" />
    </div>
  );
}
