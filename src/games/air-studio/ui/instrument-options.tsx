"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useId, type ReactNode } from "react";
import { Button, IconButton } from "@/components/ui/button";
import { ToggleChip } from "@/components/ui/chip";
import { Segmented, SliderRow, SwitchRow } from "@/components/ui/controls";
import { Modal } from "@/components/ui/dialog";
import { DRUM_PACKS } from "../engine/audio/instruments/drums";
import { GUITAR_PRESETS } from "../engine/audio/instruments/guitar";
import { PIANO_PRESETS } from "../engine/audio/instruments/piano";
import { SYNTH_PRESETS } from "../engine/audio/instruments/synth";
import { DRUM_LAYOUTS } from "../engine/instruments/drums";
import { PERC_LAYOUTS } from "../engine/instruments/percussion";
import { NOTE_NAMES, PROGRESSIONS, SCALES, type ProgressionId, type ScaleId } from "../engine/music";
import { DEFAULTS, INSTRUMENT_NAMES, settings, type InstrumentId, type PercLayout, type Settings } from "../engine/settings";
import { useSettings } from "./hooks";

/** A labelled group of options. */
function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  const id = useId();
  return (
    <div role="group" aria-labelledby={id} className="flex flex-col gap-2.5">
      <div className="flex flex-col gap-0.5">
        <span id={id} className="type-body font-semibold text-fg">
          {label}
        </span>
        {hint ? <span className="type-small text-fg-subtle">{hint}</span> : null}
      </div>
      {children}
    </div>
  );
}

/** One choice from a handful, as chips. */
function Chips<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <ToggleChip key={o.value} pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </ToggleChip>
      ))}
    </div>
  );
}

/** Previous / next through a short list (keys, octaves). */
function Stepper({ label, text, onPrev, onNext, prevDisabled, nextDisabled }: { label: string; text: string; onPrev: () => void; onNext: () => void; prevDisabled?: boolean; nextDisabled?: boolean }) {
  return (
    <div className="inline-flex h-11 items-center gap-1 rounded-full bg-surface p-1 shadow-ring">
      <IconButton label={`Lower ${label}`} icon={<ChevronLeft />} variant="ghost" size="sm" onClick={onPrev} disabled={prevDisabled} />
      <span className="type-body min-w-12 text-center font-semibold tabular-nums text-fg" aria-live="polite">
        {text}
      </span>
      <IconButton label={`Higher ${label}`} icon={<ChevronRight />} variant="ghost" size="sm" onClick={onNext} disabled={nextDisabled} />
    </div>
  );
}

const SCALE_OPTIONS = (Object.keys(SCALES) as ScaleId[]).map((id) => ({ value: id, label: SCALES[id].label }));

function KeyAndOctave({ keyValue, octave, minOctave, maxOctave, onKey, onOctave }: { keyValue: number; octave: number; minOctave: number; maxOctave: number; onKey: (k: number) => void; onOctave: (o: number) => void }) {
  return (
    <div className="flex flex-wrap gap-x-8 gap-y-4">
      <Field label="Key">
        <Stepper label="key" text={NOTE_NAMES[keyValue]} onPrev={() => onKey((keyValue + 11) % 12)} onNext={() => onKey((keyValue + 1) % 12)} />
      </Field>
      <Field label="Octave">
        <Stepper label="octave" text={String(octave)} onPrev={() => onOctave(octave - 1)} onNext={() => onOctave(octave + 1)} prevDisabled={octave <= minOctave} nextDisabled={octave >= maxOctave} />
      </Field>
    </div>
  );
}

function PianoOptions() {
  const s = useSettings((st) => st.piano);
  const u = (p: Partial<Settings["piano"]>) => settings.update("piano", p);
  const beginner = s.level === "beginner";
  return (
    <>
      <Field label="Sound">
        <Chips value={s.preset} options={PIANO_PRESETS.map((p) => ({ value: p.id, label: p.label }))} onChange={(preset) => u({ preset })} />
      </Field>
      <Field label="Keys" hint={beginner ? "Eight big keys: one octave of the scale." : "One or two octaves, locked to the scale."}>
        <Segmented
          label="Keys"
          value={s.level}
          onValueChange={(level) => u({ level })}
          options={[
            { value: "beginner", label: "8 keys" },
            { value: "advanced", label: "More keys" },
          ]}
        />
        {!beginner ? (
          <Segmented
            label="Octaves"
            value={String(s.octaves) as "1" | "2"}
            onValueChange={(v) => u({ octaves: v === "2" ? 2 : 1 })}
            options={[
              { value: "1", label: "1 octave" },
              { value: "2", label: "2 octaves" },
            ]}
          />
        ) : null}
      </Field>
      <Field label="Scale" hint="Only notes of the scale get a key, so every key sounds right.">
        <Chips value={beginner && s.scale === "chromatic" ? "major" : s.scale} options={beginner ? SCALE_OPTIONS.filter((o) => o.value !== "chromatic") : SCALE_OPTIONS} onChange={(scale) => u({ scale })} />
      </Field>
      <KeyAndOctave keyValue={s.key} octave={s.octave} minOctave={2} maxOctave={6} onKey={(key) => u({ key })} onOctave={(octave) => u({ octave })} />
      <Field label="Chord help" hint="One finger plays a whole chord.">
        <Segmented
          label="Chord help"
          value={s.chordAssist}
          onValueChange={(chordAssist) => u({ chordAssist })}
          options={[
            { value: "off", label: "Off" },
            { value: "triad", label: "Chords" },
            { value: "power", label: "Power chords" },
          ]}
        />
      </Field>
      <Field label="Play by">
        <Segmented
          label="Play by"
          value={s.activation}
          onValueChange={(activation) => u({ activation })}
          options={[
            { value: "line", label: "Dipping below a line" },
            { value: "tap", label: "Tapping down" },
          ]}
        />
      </Field>
      <Field label="Hold notes" hint="Keeps notes ringing while you hold the gesture.">
        <Segmented
          label="Hold notes"
          value={s.sustain}
          onValueChange={(sustain) => u({ sustain })}
          options={[
            { value: "off", label: "Off" },
            { value: "leftFist", label: "Left fist" },
            { value: "rightFist", label: "Right fist" },
            { value: "pinch", label: "Pinch" },
          ]}
        />
      </Field>
      <SwitchRow label="Slide between keys" description="Keep your finger down and move sideways to play the next key." checked={s.glide} onCheckedChange={(glide) => u({ glide })} />
    </>
  );
}

function LeftHanded({ description }: { description: string }) {
  const leftHanded = useSettings((st) => st.tracking).leftHanded;
  return <SwitchRow label="Left-handed" description={description} checked={leftHanded} onCheckedChange={(on) => settings.update("tracking", { leftHanded: on })} />;
}

function DrumOptions() {
  const s = useSettings((st) => st.drums);
  const u = (p: Partial<Settings["drums"]>) => settings.update("drums", p);
  return (
    <>
      <Field label="Sound" hint="Studio and vintage are built from waves and noise. 808 uses recordings of a classic drum machine.">
        <Chips value={s.pack} options={DRUM_PACKS.map((p) => ({ value: p.id, label: p.label }))} onChange={(pack) => u({ pack })} />
      </Field>
      <Field label="Kit">
        <Segmented
          label="Kit"
          value={s.layout}
          onValueChange={(layout) => u({ layout })}
          options={[
            { value: "standard", label: DRUM_LAYOUTS.standard.label },
            { value: "compact", label: DRUM_LAYOUTS.compact.label },
          ]}
        />
      </Field>
      <LeftHanded description="Mirrors the kit, so the hi-hat is on your right." />
    </>
  );
}

function GuitarOptions() {
  const s = useSettings((st) => st.guitar);
  const u = (p: Partial<Settings["guitar"]>) => settings.update("guitar", p);
  const ids = Object.keys(PROGRESSIONS) as ProgressionId[];
  return (
    <>
      <Field label="Sound">
        <Segmented label="Sound" value={s.preset} onValueChange={(preset) => u({ preset })} options={GUITAR_PRESETS.map((p) => ({ value: p.id, label: p.label }))} />
      </Field>
      <Field label="Chords" hint="The column shows them top to bottom.">
        <div className="flex flex-wrap gap-2">
          {ids.map((id) => (
            <ToggleChip key={id} pressed={s.progression === id} onClick={() => u({ progression: id })}>
              {PROGRESSIONS[id].label}
              <span className={s.progression === id ? "text-canvas/70" : "text-fg-subtle"}>{PROGRESSIONS[id].chords.join(" ")}</span>
            </ToggleChip>
          ))}
        </div>
      </Field>
      <Field label="Change chords by">
        <Segmented
          label="Change chords by"
          value={s.chordSelect}
          onValueChange={(chordSelect) => u({ chordSelect })}
          options={[
            { value: "height", label: "Hand height" },
            { value: "pinch", label: "Pinching" },
          ]}
        />
      </Field>
      <SliderRow
        label="Strum sensitivity"
        description="Higher plays with smaller swings."
        value={s.strumSens}
        onValueChange={(strumSens) => u({ strumSens })}
        valueText={s.strumSens < 34 ? "Low" : s.strumSens < 67 ? "Medium" : "High"}
      />
      <LeftHanded description="Strum with your left hand and choose chords with your right." />
    </>
  );
}

function SynthOptions() {
  const s = useSettings((st) => st.synth);
  const u = (p: Partial<Settings["synth"]>) => settings.update("synth", p);
  return (
    <>
      <Field label="Hands">
        <Segmented
          label="Hands"
          value={s.level}
          onValueChange={(level) => u({ level })}
          options={[
            { value: "simple", label: "Two voices" },
            { value: "advanced", label: "Left hand controls" },
          ]}
        />
        <span className="type-small text-fg-subtle">
          {s.level === "simple" ? "Each hand plays its own note." : "Your right hand plays. Your left hand's height sets the volume, and moving it right adds wobble."}
        </span>
      </Field>
      <Field label="Sound">
        <Chips
          value={s.preset}
          options={SYNTH_PRESETS.map((p) => ({ value: p.id, label: p.label }))}
          onChange={(preset) => {
            const p = SYNTH_PRESETS.find((x) => x.id === preset);
            u({ preset, ...(p?.params ?? {}) });
          }}
        />
      </Field>
      <Field label="Scale">
        <Chips value={s.scale} options={SCALE_OPTIONS} onChange={(scale) => u({ scale })} />
      </Field>
      <KeyAndOctave keyValue={s.key} octave={s.octave} minOctave={1} maxOctave={5} onKey={(key) => u({ key })} onOctave={(octave) => u({ octave })} />
      <SwitchRow label="Snap to the scale" description="Off, the pitch slides smoothly like a theremin." checked={s.quantize} onCheckedChange={(quantize) => u({ quantize })} />
      <Field label="Hand height changes">
        <Segmented
          label="Hand height changes"
          value={s.yAxis}
          onValueChange={(yAxis) => u({ yAxis })}
          options={[
            { value: "filter", label: "Brightness" },
            { value: "volume", label: "Volume" },
          ]}
        />
      </Field>
    </>
  );
}

function PercussionOptions() {
  const s = useSettings((st) => st.percussion);
  const u = (p: Partial<Settings["percussion"]>) => settings.update("percussion", p);
  const ids = Object.keys(PERC_LAYOUTS) as PercLayout[];
  return (
    <>
      <Field label="Set">
        <Segmented label="Set" value={s.layout} onValueChange={(layout) => u({ layout })} options={ids.map((id) => ({ value: id, label: PERC_LAYOUTS[id].label }))} />
      </Field>
      <SwitchRow label="Shaker" description="Make a fist and shake it side to side." checked={s.shake} onCheckedChange={(shake) => u({ shake })} />
    </>
  );
}

const RESET: Record<InstrumentId, () => void> = {
  piano: () => settings.update("piano", structuredClone(DEFAULTS.piano)),
  drums: () => settings.update("drums", structuredClone(DEFAULTS.drums)),
  guitar: () => settings.update("guitar", structuredClone(DEFAULTS.guitar)),
  synth: () => settings.update("synth", structuredClone(DEFAULTS.synth)),
  percussion: () => settings.update("percussion", structuredClone(DEFAULTS.percussion)),
};

/** The current instrument's options. They change the sound at once; Next player puts them back. */
export function InstrumentOptionsModal({ instrument, open, onOpenChange }: { instrument: InstrumentId | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const name = instrument ? INSTRUMENT_NAMES[instrument] : "Instrument";
  return (
    <Modal
      open={open && instrument !== null}
      onOpenChange={onOpenChange}
      title={`${name} options`}
      description="Changes apply as you play."
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={() => instrument && RESET[instrument]()}>
            Reset to defaults
          </Button>
          <Button variant="game" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-7">
        {instrument === "piano" ? <PianoOptions /> : null}
        {instrument === "drums" ? <DrumOptions /> : null}
        {instrument === "guitar" ? <GuitarOptions /> : null}
        {instrument === "synth" ? <SynthOptions /> : null}
        {instrument === "percussion" ? <PercussionOptions /> : null}
      </div>
    </Modal>
  );
}
