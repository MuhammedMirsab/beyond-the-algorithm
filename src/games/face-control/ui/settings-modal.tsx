"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { SliderRow, SwitchRow } from "@/components/ui/controls";
import { Modal } from "@/components/ui/dialog";
import { resetSettings, settings } from "../engine/state/settings";
import type { FaceControlSession } from "../play/session";
import { useSettings } from "./hooks";

const pct = (v: number) => `${Math.round(v * 100)}%`;

function Help({ children }: { children: ReactNode }) {
  return <p className="type-small -mt-1 mb-3 text-fg-subtle">{children}</p>;
}

/** Live-tuning for the face controls. Changes apply at once; Next player puts them back. */
export function SettingsModal({ session, open }: { session: FaceControlSession; open: boolean }) {
  const s = useSettings();
  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (!next) session.closeSettings();
      }}
      title="Settings"
      description="Changes apply straight away. Next player puts them back to the defaults."
      footer={
        <>
          <Button variant="ghost" onClick={resetSettings}>
            Reset to defaults
          </Button>
          <Button variant="game" onClick={session.closeSettings}>
            Done
          </Button>
        </>
      }
    >
      <div className="flex flex-col">
        <h3 className="type-label mb-2 text-fg-subtle">Face controls</h3>
        <SliderRow
          label="Steering sensitivity"
          value={s.steerSensitivity}
          min={0.5}
          max={2}
          step={0.05}
          valueText={`${s.steerSensitivity.toFixed(2)}×`}
          onValueChange={(v) => settings.set({ steerSensitivity: v })}
        />
        <Help>Higher means a smaller tilt gives full speed.</Help>
        <SliderRow
          label="Neutral zone"
          value={s.deadZone}
          min={0}
          max={0.35}
          step={0.01}
          valueText={pct(s.deadZone)}
          onValueChange={(v) => settings.set({ deadZone: v })}
        />
        <Help>Small head movements inside this zone are ignored.</Help>
        <SliderRow
          label="Jump sensitivity"
          value={s.jumpSensitivity}
          min={1}
          max={5}
          step={1}
          valueText={`${s.jumpSensitivity} of 5`}
          onValueChange={(v) => settings.set({ jumpSensitivity: v })}
        />
        <Help>Lower it if talking or smiling makes the ball jump.</Help>
        <SliderRow
          label="Smoothing"
          value={s.smoothing}
          min={0}
          max={1}
          step={0.05}
          valueText={pct(s.smoothing)}
          onValueChange={(v) => settings.set({ smoothing: v })}
        />
        <Help>More smoothing is calmer. Less reacts faster.</Help>

        <h3 className="type-label mb-1 mt-4 text-fg-subtle">Display and sound</h3>
        <SwitchRow
          label="Show tracking points"
          description="Draws the points the model finds on your face."
          checked={s.showLandmarks}
          onCheckedChange={(on) => settings.set({ showLandmarks: on })}
        />
        <SwitchRow
          label="Music"
          description="Plays while you roll, when sound is on."
          checked={s.music}
          onCheckedChange={(on) => settings.set({ music: on })}
        />
      </div>
    </Modal>
  );
}
