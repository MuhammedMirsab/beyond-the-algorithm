"use client";

import { Play, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SliderRow } from "@/components/ui/controls";
import { Modal } from "@/components/ui/dialog";
import { cn } from "@/lib/cn";
import { BACKING_STYLES } from "../engine/audio/backing";
import { MAX_BPM, MIN_BPM } from "../engine/audio/transport";
import type { StudioSession, StudioView } from "../play/session";

function Option({ selected, title, text, onClick }: { selected: boolean; title: string; text: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={cn(
        "flex min-h-16 flex-col items-start justify-center gap-0.5 rounded-md px-4 py-3 text-left",
        "transition-[background-color,box-shadow,scale] duration-150 ease-out active:scale-[0.98]",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg",
        selected ? "bg-game-soft shadow-[inset_0_0_0_2px_var(--game)]" : "bg-surface shadow-ring hover:bg-overlay",
      )}
    >
      <span className="type-body font-semibold text-fg">{title}</span>
      <span className="type-small text-fg-muted">{text}</span>
    </button>
  );
}

/**
 * Play along: a click track or one of eight bands, made up live in the
 * browser so they follow the tempo exactly. Lessons use the same beat.
 */
export function PlayAlongModal({ session, view, open, onOpenChange }: { session: StudioSession; view: StudioView; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { choice, bpm, running, starting } = view.playAlong;
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Play along"
      description="A click or a band keeps the beat. Record with it on and your take gets a timing score."
      size="lg"
      footer={
        running ? (
          <>
            <Button variant="ghost" icon={<Square className="fill-current" />} onClick={session.stopPlayAlong}>
              Stop
            </Button>
            <Button variant="game" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          </>
        ) : (
          <Button
            variant="game"
            icon={<Play className="fill-current" />}
            loading={starting}
            onClick={async () => {
              await session.startPlayAlong();
              onOpenChange(false);
            }}
          >
            Start
          </Button>
        )
      }
    >
      <div className="flex flex-col gap-7">
        <div role="radiogroup" aria-label="Play along with" className="grid gap-2 sm:grid-cols-3">
          <Option selected={choice === "click"} title="Click" text="A beep on every beat" onClick={() => session.choosePlayAlong("click")} />
          {BACKING_STYLES.map((s) => (
            <Option key={s.id} selected={choice === s.id} title={s.genre} text={s.desc} onClick={() => session.choosePlayAlong(s.id)} />
          ))}
        </div>
        <SliderRow
          label="Tempo"
          description={choice === "click" ? undefined : "Each band starts at its own tempo."}
          value={bpm}
          min={MIN_BPM}
          max={MAX_BPM}
          step={1}
          onValueChange={session.setTempo}
          valueText={`${bpm} beats a minute`}
        />
      </div>
    </Modal>
  );
}
