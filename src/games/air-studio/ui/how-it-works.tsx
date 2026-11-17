"use client";

import { HowItWorks } from "@/components/game/panels";
import { Modal } from "@/components/ui/dialog";
import { lerp } from "../engine/music";
import { REF_SIZE, type Pt, type TraceSample } from "../engine/tracking/hands";
import { OneEuro } from "../engine/tracking/one-euro";
import { strikeThreshold } from "../engine/tracking/reach";
import { instrumentInfo } from "../engine/instruments/index";
import { WINDOWS } from "../engine/practice/scoring";
import { INSTRUMENT_NAMES } from "../engine/settings";
import type { Story } from "../play/session";
import { offsetWords } from "./report-bits";
import { SoundCredits } from "./sound-credits";
import { listWords } from "./take-modal";

export const TITLE = "How the AI did it";
export const INTRO = "A model finds points on your hands. Simple rules about how those points move turn into notes.";

const BONES = [
  [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
];

/** An open right hand, palm to the camera, in the model's landmark order: a stand-in before the camera has seen one. */
const SAMPLE_HAND: Pt[] = [
  [0.5, 0.92], [0.39, 0.85], [0.31, 0.74], [0.25, 0.64], [0.2, 0.56],
  [0.4, 0.55], [0.37, 0.4], [0.355, 0.3], [0.345, 0.21],
  [0.49, 0.53], [0.49, 0.36], [0.49, 0.25], [0.49, 0.15],
  [0.58, 0.55], [0.6, 0.4], [0.61, 0.3], [0.62, 0.22],
  [0.66, 0.6], [0.7, 0.49], [0.72, 0.42], [0.74, 0.35],
].map(([x, y]) => ({ x, y }));

/** 21 points and the bones between them, fitted into the box. */
function HandPoints({ points, sample, aspect }: { points: Pt[]; sample: boolean; aspect: number }) {
  const W = 220;
  const H = 150;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const w = Math.max(...xs) - minX || 1;
  const h = Math.max(...ys) - minY || 1;
  // Camera points are fractions of the picture's width and height: stretch x back to the picture's shape.
  const sx = sample ? 1 : aspect;
  const scale = Math.min((W - 30) / (w * sx), (H - 40) / h);
  const ox = (W - w * sx * scale) / 2;
  const oy = 28 + (H - 40 - h * scale) / 2;
  const at = (p: Pt) => ({ x: ox + (p.x - minX) * sx * scale, y: oy + (p.y - minY) * scale });
  return (
    <div className="dot-field relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-36 w-full" role="img" aria-label={sample ? "A sample hand: 21 points" : "Your hand as the model saw it: 21 points"}>
        <g className="stroke-fg/45" strokeWidth={1.5} strokeLinecap="round">
          {BONES.map(([a, b]) => {
            const p = at(points[a]);
            const q = at(points[b]);
            return <line key={`${a}-${b}`} x1={p.x} y1={p.y} x2={q.x} y2={q.y} />;
          })}
        </g>
        {points.map((p, i) => {
          const c = at(p);
          return <circle key={i} cx={c.x} cy={c.y} r={i === 8 ? 4.5 : 3} className={i === 8 ? "fill-game" : "fill-fg"} />;
        })}
      </svg>
      <span className="type-label absolute left-3 top-2.5 text-fg-subtle">{sample ? "Sample hand" : "Your hand"}</span>
    </div>
  );
}

/**
 * Without camera data: the same One-Euro filter the game uses, run on a
 * made-up fingertip that rests (with webcam-sized jitter) and then strikes.
 * Labelled as an example on screen.
 */
function exampleTrace(): TraceSample[] {
  const f = new OneEuro(lerp(4, 0.5, 0.5), 6);
  const out: TraceSample[] = [];
  let seed = 7;
  const noise = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed / 2147483647 - 0.5) * 0.012;
  };
  for (let i = 0; i < 80; i++) {
    const t = i * 33;
    // Still, then a quick move down, then still again.
    const move = i < 40 ? 0 : Math.min(1, (i - 40) / 6);
    const raw = 0.4 + move * 0.05 + noise();
    out.push({ t, raw, smooth: f.filter(raw, 0.033) });
  }
  return out;
}

/** The fingertip's height over a few seconds: raw from the model, and after smoothing. */
function TraceChart({ trace, example = false }: { trace: TraceSample[]; example?: boolean }) {
  const W = 220;
  const H = 150;
  const pad = 14;
  const t0 = trace[0].t;
  const t1 = trace[trace.length - 1].t;
  const all = trace.flatMap((s) => [s.raw, s.smooth]);
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const span = Math.max(0.02, hi - lo);
  const x = (t: number) => pad + ((t - t0) / Math.max(1, t1 - t0)) * (W - pad * 2);
  // Room for the legend at the top.
  const y = (v: number) => pad * 2.6 + ((v - lo) / span) * (H - pad * 3.6);
  const line = (k: "raw" | "smooth") => trace.map((s) => `${x(s.t).toFixed(1)},${y(s[k]).toFixed(1)}`).join(" ");
  return (
    <div className="dot-field relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-36 w-full" role="img" aria-label={`${example ? "An example fingertip" : "Your fingertip"} over ${((t1 - t0) / 1000).toFixed(1)} seconds: the raw points, and the smoothed line`}>
        <polyline points={line("raw")} fill="none" className="stroke-fg/50" strokeWidth={1.25} strokeLinejoin="round" />
        <polyline points={line("smooth")} fill="none" className="stroke-game" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      <span className="type-label absolute left-3 top-2.5 flex gap-3">
        <span className="text-fg-subtle">Raw</span>
        <span className="text-game">Smoothed</span>
      </span>
      {example ? <span className="type-label absolute right-3 top-2.5 text-fg-subtle">Example</span> : null}
    </div>
  );
}

function Readout({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="dot-field flex flex-col gap-3 p-5">
      {rows.map(([label, value]) => (
        <div key={label} className="flex flex-col gap-1">
          <dt className="type-label text-fg-subtle">{label}</dt>
          <dd className="type-title-3 tabular-nums text-fg">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function steps(story: Story) {
  const { stats, mode } = story;
  const camera = mode === "camera";
  const fps = stats.fps;
  const needed = Math.round((strikeThreshold() / REF_SIZE) * 10) / 10;
  const fastest = stats.fastest === null ? null : Math.round(stats.fastest * 10) / 10;
  const chip = story.delegate === "GPU" ? "graphics chip" : story.delegate === "CPU" ? "processor" : null;

  const pointsText = camera
    ? `A hand model finds 21 points on each of your hands, ${fps ? `${fps} times a second here` : "about 30 times a second"}. It runs on this computer${chip ? `'s ${chip}` : ""}, and no picture leaves it.`
    : mode === "mouse"
      ? "With the camera on, a hand model on this computer finds 21 points on each hand, about 30 times a second. You used the mouse, so a pretend hand followed your pointer through the same steps."
      : "A hand model on this computer finds 21 points on each hand in the camera picture, about 30 times a second. No picture leaves the computer.";

  const used = stats.instruments.map((i) => instrumentInfo(i));
  const recorded = used.filter((i) => i.source === "recorded").map((i) => INSTRUMENT_NAMES[i.id].toLowerCase());
  const built = used.filter((i) => i.source === "synthesised").map((i) => INSTRUMENT_NAMES[i.id].toLowerCase());
  const soundNumbers = used.length
    ? ` You played ${listWords([...recorded, ...built])}${recorded.length && built.length ? ", so you heard both kinds" : ""}.`
    : "";

  const lesson = stats.lesson;
  const win = lesson?.level === "advanced" ? WINDOWS.advanced : WINDOWS.beginner;
  const timingText = lesson
    ? `The beat comes from the computer's sound clock. Each note was matched to the nearest target: within ${win.perfect} ms counted as on time, up to ${win.max} ms as early or late. In your lesson you hit ${lesson.correct} of ${lesson.targets}${lesson.meanOffsetMs !== null ? `, ${offsetWords(lesson.meanOffsetMs)} on average` : ""}.`
    : `The beat comes from the computer's sound clock. In a lesson, each note is matched to the nearest target: within ${WINDOWS.beginner.perfect} ms is on time, up to ${WINDOWS.beginner.max} ms is early or late.${camera ? " The camera adds about 70 ms of delay, and the judge allows for it." : ""}`;

  const hand = camera && stats.hand ? stats.hand : null;
  const trace = camera && story.trace.length >= 20 ? story.trace : null;

  return [
    {
      title: "It finds 21 points on each hand",
      text: pointsText,
      visual: <HandPoints points={hand ?? SAMPLE_HAND} sample={!hand} aspect={story.aspect} />,
    },
    {
      title: "It steadies the points",
      text: "Points shake a little even when you hold still. A filter smooths a still hand a lot and a fast hand hardly at all, so you get steady keys without slow hits.",
      visual: trace ? <TraceChart trace={trace} /> : <TraceChart trace={exampleTrace()} example />,
    },
    {
      title: "Rules turn moves into notes",
      text: "A hit is a fast move down, counted in hand lengths a second, so distance from the camera doesn't matter. Your hand must slow down before the next hit counts, so a resting hand stays quiet. A fist mutes the guitar, and height picks the chord.",
      visual: (
        <Readout
          rows={[
            ["A hit needs", `${needed} hand lengths/s`],
            ["Your fastest", fastest !== null ? `${fastest} hand lengths/s` : "No hits yet"],
            ["Notes you played", String(stats.events)],
          ]}
        />
      ),
    },
    {
      title: "It makes the sound",
      text: `Piano, guitar and bass play short recordings of real instruments, sped up or slowed down for each note. The drums, percussion and synth are built from waves and noise as you play (the 808 kit is recorded), so a harder hit changes the sound, not just the volume.${soundNumbers}`,
    },
    {
      title: "It judges your timing",
      text: timingText,
    },
  ];
}

/** The reveal under a lesson result. */
export function StudioHowItWorks({ story, className }: { story: Story; className?: string }) {
  return <HowItWorks title={TITLE} intro={INTRO} steps={steps(story)} columns={3} className={className} />;
}

/** The same steps in a modal, from the header. */
export function HowItWorksModal({ story, open, onOpenChange }: { story: Story; open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Modal open={open} onOpenChange={onOpenChange} size="lg" title={TITLE} description={INTRO}>
      <div className="flex flex-col gap-6">
        <HowItWorks title={TITLE} heading={false} columns={3} steps={steps(story)} />
        <SoundCredits />
      </div>
    </Modal>
  );
}
