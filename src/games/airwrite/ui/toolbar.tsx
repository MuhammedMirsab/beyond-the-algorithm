"use client";

import { useAnimate, useReducedMotion } from "motion/react";
import { SlidersHorizontal, Trash2, Undo2 } from "lucide-react";
import { useEffect, type ReactNode, type Ref } from "react";
import { Button, IconButton } from "@/components/ui/button";
import { Kbd } from "@/components/ui/surface";
import { cn } from "@/lib/cn";

/** 44px on phones, 56px (booth size) from 640px. */
const ICON = "sm:size-14 sm:[&_svg]:size-6";

/** Icon-only until there is room (1280px), then icon and label. */
function Tool({
  label,
  icon,
  onClick,
  disabled,
  shortcut,
  popup,
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  shortcut?: string;
  popup?: boolean;
}) {
  return (
    <>
      <IconButton
        label={label}
        icon={icon}
        variant="ghost"
        onClick={onClick}
        disabled={disabled}
        aria-keyshortcuts={shortcut}
        aria-haspopup={popup ? "dialog" : undefined}
        className={cn(ICON, "xl:hidden")}
      />
      <Button
        variant="ghost"
        size="lg"
        icon={icon}
        onClick={onClick}
        disabled={disabled}
        aria-keyshortcuts={shortcut}
        aria-haspopup={popup ? "dialog" : undefined}
        className="hidden px-5 xl:inline-flex"
      >
        {label}
      </Button>
    </>
  );
}

/**
 * Undo, Clear, Settings and the one filled action: Read my writing.
 * `shake` changes when Read is pressed with nothing written, to nudge the button.
 */
export function Toolbar({
  canUndo,
  canClear,
  shake,
  readRef,
  onUndo,
  onClear,
  onSettings,
  onRead,
  className,
}: {
  canUndo: boolean;
  canClear: boolean;
  shake: number;
  readRef?: Ref<HTMLButtonElement>;
  onUndo: () => void;
  onClear: () => void;
  onSettings: () => void;
  onRead: () => void;
  className?: string;
}) {
  const [scope, animate] = useAnimate<HTMLDivElement>();
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!shake || reduceMotion || !scope.current) return;
    animate(scope.current, { x: [0, -7, 7, -4, 4, 0] }, { duration: 0.32, ease: "easeOut" });
  }, [shake, reduceMotion, animate, scope]);

  return (
    <div
      role="toolbar"
      aria-label="Writing tools"
      className={cn("flex w-full items-center gap-1.5 rounded-full bg-surface p-1.5 shadow-ring sm:w-auto sm:gap-2", className)}
    >
      <Tool label="Undo" icon={<Undo2 />} onClick={onUndo} disabled={!canUndo} shortcut="Z" />
      <Tool label="Clear" icon={<Trash2 />} onClick={onClear} disabled={!canClear} shortcut="C" />
      <Tool label="Settings" icon={<SlidersHorizontal />} onClick={onSettings} popup />
      <div ref={scope} className="min-w-0 flex-1 sm:ml-1 sm:flex-none">
        <Button
          ref={readRef}
          variant="game"
          onClick={onRead}
          aria-keyshortcuts="Enter"
          className="w-full sm:h-14 sm:w-auto sm:px-7 sm:text-[1.0625rem]"
        >
          Read my writing
          <Kbd tone="on-game" className="ml-1 hidden lg:inline-grid">
            Enter
          </Kbd>
        </Button>
      </div>
    </div>
  );
}
