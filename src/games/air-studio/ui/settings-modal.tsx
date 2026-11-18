"use client";

import { MoveHorizontal } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Segmented, SliderRow, SwitchRow } from "@/components/ui/controls";
import { Modal } from "@/components/ui/dialog";
import { KeyHints, type KeyHint } from "@/components/ui/key-hints";
import { MachineLabel } from "@/components/ui/surface";
import { DEFAULTS, INSTRUMENT_NAMES, settings, type InstrumentId } from "../engine/settings";
import { REF_SIZE } from "../engine/tracking/hands";
import { strikeThreshold } from "../engine/tracking/reach";
import type { InputMode } from "../play/session";
import { useSettings } from "./hooks";
import { InstrumentOptions, resetInstrument } from "./instrument-options";

const level = (v: number) => (v < 34 ? "Low" : v < 67 ? "Medium" : "High");

type Tab = "instrument" | "hands";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h3 className="type-title-3 text-fg">{title}</h3>
      {children}
    </section>
  );
}

/** Hands, camera and keys: the same for every instrument. */
function HandsSettings({
  mode,
  canMeasure,
  recordKey,
  onMeasure,
}: {
  mode: InputMode | null;
  canMeasure: boolean;
  recordKey: boolean;
  onMeasure: () => void;
}) {
  const t = useSettings((s) => s.tracking);
  const needed = Math.round((strikeThreshold(0, t.sensitivity) / REF_SIZE) * 10) / 10;
  const r = t.reach;
  const d = DEFAULTS.tracking.reach;
  const custom = r.x0 !== d.x0 || r.x1 !== d.x1 || r.y0 !== d.y0 || r.y1 !== d.y1;
  const keys: KeyHint[] = [];
  if (recordKey) keys.push({ keys: ["R"], label: "Start or stop recording" });
  if (mode === "mouse") {
    keys.push(
      { keys: ["Space"], label: "Hold to make a fist" },
      { keys: ["1", "6"], join: "to", label: "Raise or lower your left hand" },
      { keys: ["0"], label: "Hide your left hand" },
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-5">
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
        <MachineLabel>A hit needs {needed} hand lengths a second</MachineLabel>
      </div>

      <Section title="Fit to your reach">
        <p className="type-small -mt-2 text-fg-subtle">
          {mode === "camera"
            ? "Sweep both hands to the edges for 6 seconds. The instruments then fit inside the area you reached, so nothing is out of range."
            : "This needs the camera: it measures how far your hands reach."}
        </p>
        {mode === "camera" ? (
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" icon={<MoveHorizontal />} onClick={onMeasure} disabled={!canMeasure}>
              {custom ? "Measure again" : "Measure my reach"}
            </Button>
            {custom ? (
              <Button variant="ghost" onClick={() => settings.update("tracking", { reach: DEFAULTS.tracking.reach })}>
                Use the standard area
              </Button>
            ) : null}
          </div>
        ) : null}
      </Section>

      {keys.length ? (
        <Section title="Keyboard">
          <KeyHints items={keys} layout="list" />
        </Section>
      ) : null}
    </div>
  );
}

/**
 * One place for every setting, for this player only: the current
 * instrument's sound and layout, then hands, camera and keys (including
 * measuring the visitor's reach). Next player starts from the defaults.
 */
export function SettingsModal({
  open,
  onOpenChange,
  instrument,
  mode,
  canMeasure,
  recordKey,
  onMeasure,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instrument: InstrumentId | null;
  mode: InputMode | null;
  /** Hand tracking is running, so the reach can be measured. */
  canMeasure: boolean;
  /** R records (Record is showing). */
  recordKey: boolean;
  onMeasure: () => void;
}) {
  const [picked, setTab] = useState<Tab>("instrument");
  const tab: Tab = instrument ? picked : "hands";
  const name = instrument ? INSTRUMENT_NAMES[instrument] : null;
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Settings"
      description="For this player only. Next player starts from the defaults."
      size="lg"
      footer={
        <>
          <Button
            variant="ghost"
            onClick={() => {
              if (tab === "instrument" && instrument) resetInstrument(instrument);
              else
                settings.update("tracking", {
                  sensitivity: DEFAULTS.tracking.sensitivity,
                  leftHanded: DEFAULTS.tracking.leftHanded,
                  showLandmarks: DEFAULTS.tracking.showLandmarks,
                  reach: DEFAULTS.tracking.reach,
                });
            }}
          >
            {tab === "instrument" && name ? `Reset ${name.toLowerCase()}` : "Reset to defaults"}
          </Button>
          <Button variant="game" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-7">
        {instrument && name ? (
          <Segmented
            label="Settings for"
            value={tab}
            onValueChange={setTab}
            options={[
              { value: "instrument", label: name },
              { value: "hands", label: "Hands and keys" },
            ]}
          />
        ) : null}
        {tab === "instrument" && instrument ? (
          <InstrumentOptions instrument={instrument} />
        ) : (
          <HandsSettings
            mode={mode}
            canMeasure={canMeasure}
            recordKey={recordKey}
            onMeasure={() => {
              onOpenChange(false);
              onMeasure();
            }}
          />
        )}
      </div>
    </Modal>
  );
}
