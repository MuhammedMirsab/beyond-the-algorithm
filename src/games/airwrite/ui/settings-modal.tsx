"use client";

import { Crosshair } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { SliderRow } from "@/components/ui/controls";
import { Modal } from "@/components/ui/dialog";
import { KeyHints } from "@/components/ui/key-hints";
import { MachineLabel } from "@/components/ui/surface";
import { DEFAULT_SETTINGS, type PenSettings } from "../engine/airPen";
import type { TrackingStats } from "../engine/useHandTracking";
import { WRITE_KEYS } from "./toolbar";

const level = (value: number) => (value < 0.34 ? "Low" : value < 0.67 ? "Medium" : "High");

function Setting({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <SliderRow
      label={label}
      description={hint}
      value={Math.round(value * 100)}
      onValueChange={(v) => onChange(v / 100)}
      valueText={level(value)}
    />
  );
}

/** Pen settings. They live only in memory, so every visitor starts from the defaults. */
export function SettingsModal({
  open,
  onOpenChange,
  settings,
  onSettings,
  cameraReady,
  readStats,
  onCentre,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: PenSettings;
  onSettings: (settings: PenSettings) => void;
  cameraReady: boolean;
  /** Live tracking numbers, polled while the modal is open. */
  readStats: () => TrackingStats;
  onCentre: () => void;
}) {
  const [stats, setStats] = useState<TrackingStats | null>(null);

  useEffect(() => {
    if (!open || !cameraReady) return;
    const tick = () => setStats(readStats());
    const first = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, 1000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [open, cameraReady, readStats]);

  const set = (patch: Partial<PenSettings>) => onSettings({ ...settings, ...patch });
  const readout = cameraReady && stats?.delegate ? `${stats.delegate} · ${stats.fps} fps · 21-point hand model` : "Camera off";

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Settings"
      description="For this player only. Next player starts from the defaults."
      footer={
        <>
          <Button variant="ghost" onClick={() => onSettings({ ...DEFAULT_SETTINGS, center: { ...DEFAULT_SETTINGS.center } })}>
            Reset to defaults
          </Button>
          <Button variant="game" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <Setting
          label="Sensitivity"
          hint="Higher needs less hand movement to reach the edges."
          value={settings.sensitivity}
          onChange={(sensitivity) => set({ sensitivity })}
        />
        <Setting
          label="Smoothing"
          hint="Higher draws steadier lines but follows a little later."
          value={settings.smoothing}
          onChange={(smoothing) => set({ smoothing })}
        />
        <Setting
          label="Pinch distance"
          hint="Higher lifts the pen with your finger and thumb further apart."
          value={settings.pinch}
          onChange={(pinch) => set({ pinch })}
        />
        <div className="flex flex-col items-start gap-2 border-t border-line pt-5">
          <span className="type-body font-semibold text-fg">Writing area</span>
          <p className="type-small text-fg-subtle">
            {cameraReady
              ? "Centre the writing area on your hand: after a short countdown, wherever your fingertip is becomes the middle."
              : "Turn on the camera to centre the writing area on your hand."}
          </p>
          <Button variant="secondary" icon={<Crosshair />} disabled={!cameraReady} onClick={onCentre} className="mt-1">
            Centre on my hand
          </Button>
        </div>
        <div className="flex flex-col gap-3 border-t border-line pt-5">
          <span className="type-body font-semibold text-fg">Keyboard</span>
          <KeyHints
            layout="list"
            items={[
              { keys: ["Enter", "Space"], label: "Read my writing" },
              ...WRITE_KEYS.filter((k) => k.label !== "Read my writing"),
              { keys: ["F"], label: "Full screen" },
            ]}
          />
        </div>
        <MachineLabel>{readout}</MachineLabel>
      </div>
    </Modal>
  );
}
