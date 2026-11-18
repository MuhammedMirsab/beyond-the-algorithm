"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useId, type ReactNode } from "react";
import { IconButton } from "@/components/ui/button";
import { ToggleChip } from "@/components/ui/chip";
import { Segmented, SwitchRow } from "@/components/ui/controls";
import { PIANO_PRESETS } from "../engine/audio/instruments/piano";
import { SYNTH_PRESETS } from "../engine/audio/instruments/synth";
import { PERC_LAYOUTS } from "../engine/instruments/percussion";
import { NOTE_NAMES, SCALES, type ScaleId } from "../engine/music";
import { DEFAULTS, settings, type InstrumentId, type PercLayout, type Settings } from "../engine/settings";
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
  synth: () => settings.update("synth", structuredClone(DEFAULTS.synth)),
  percussion: () => settings.update("percussion", structuredClone(DEFAULTS.percussion)),
};

/** Puts one instrument's options back to the defaults. */
export const resetInstrument = (id: InstrumentId) => RESET[id]();

/** The current instrument's options. They change the sound at once; Next player puts them back. */
export function InstrumentOptions({ instrument }: { instrument: InstrumentId }) {
  return (
    <div className="flex flex-col gap-7">
      {instrument === "piano" ? <PianoOptions /> : null}
      {instrument === "synth" ? <SynthOptions /> : null}
      {instrument === "percussion" ? <PercussionOptions /> : null}
    </div>
  );
}
