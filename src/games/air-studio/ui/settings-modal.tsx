"use client";

import { Button } from "@/components/ui/button";
import { SliderRow, SwitchRow } from "@/components/ui/controls";
import { Modal } from "@/components/ui/dialog";
import { MachineLabel } from "@/components/ui/surface";
import { REF_SIZE } from "../engine/tracking/hands";
import { strikeThreshold } from "../engine/tracking/reach";
import { DEFAULTS, settings } from "../engine/settings";
import { useSettings } from "./hooks";

const level = (v: number) => (v < 34 ? "Low" : v < 67 ? "Medium" : "High");

/**
 * Three settings for this player. They live in memory only, so every
 * visitor starts from the original app's tuned defaults.
 */
export function SettingsModal({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useSettings((s) => s.tracking);
  const needed = Math.round((strikeThreshold(0, t.sensitivity) / REF_SIZE) * 10) / 10;
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Settings"
      description="For this player only. Next player starts from the defaults."
      footer={
        <>
          <Button
            variant="ghost"
            onClick={() =>
              settings.update("tracking", {
                sensitivity: DEFAULTS.tracking.sensitivity,
                leftHanded: DEFAULTS.tracking.leftHanded,
                showLandmarks: DEFAULTS.tracking.showLandmarks,
              })
            }
          >
            Reset to defaults
          </Button>
          <Button variant="game" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <SwitchRow
          label="Left-handed"
          description="Strum the guitar with your left hand, and mirror the drum kit."
          checked={t.leftHanded}
          onCheckedChange={(leftHanded) => settings.update("tracking", { leftHanded })}
        />
        <SliderRow
          label="Sensitivity"
          description="Higher plays with gentler moves. Lower it if notes play by themselves."
          value={t.sensitivity}
          onValueChange={(sensitivity) => settings.update("tracking", { sensitivity })}
          valueText={level(t.sensitivity)}
        />
        <SwitchRow
          label="Show hand points"
          description="Draws the 21 points the model finds on each hand."
          checked={t.showLandmarks}
          onCheckedChange={(showLandmarks) => settings.update("tracking", { showLandmarks })}
        />
        <MachineLabel>Hit threshold · {needed} hand lengths/s</MachineLabel>
      </div>
    </Modal>
  );
}
