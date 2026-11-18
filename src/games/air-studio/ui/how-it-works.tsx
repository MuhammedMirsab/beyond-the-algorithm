"use client";

import { HowItWorks } from "@/components/game/panels";
import { Modal } from "@/components/ui/dialog";
import { instrumentInfo } from "../engine/instruments/index";
import { WINDOWS } from "../engine/practice/scoring";
import { INSTRUMENT_NAMES } from "../engine/settings";
import type { Story } from "../play/session";
import { exampleTrace, PointsVisual, RearmVisual, SAMPLE_HAND, SmoothVisual, SoundVisual, StrikeVisual, strikeData, TimingVisual } from "./how-visuals";
import { offsetWords } from "./report-bits";
import { SoundCredits } from "./sound-credits";
import { listWords } from "./take-modal";

export const TITLE = "How the AI did it";
export const INTRO = "A model finds points on your hands. Simple rules about how those points move turn into notes.";

const r1 = (v: number) => Math.round(v * 10) / 10;

/**
 * Six steps, from camera picture to judged note: the points, the smoothing,
 * the speed that makes a hit, the re-arm that keeps a resting hand quiet,
 * the sound, and the timing. Every number is the visitor's own where there
 * is one; the pictures say "Example" where there isn't.
 */
function steps(story: Story) {
  const { stats, mode } = story;
  const camera = mode === "camera";
  const fps = stats.fps;
  const chip = story.delegate === "GPU" ? "graphics chip" : story.delegate === "CPU" ? "processor" : null;
  const strike = strikeData(story.strike, story.threshold);
  const fastest = stats.fastest === null ? null : r1(stats.fastest);

  const pointsText = camera
    ? `A hand model on this computer finds 21 points on each of your hands, ${fps ? `${fps} times a second` : "about 30 times a second"}${chip ? `, on its ${chip}` : ""}. Each point is just two numbers: across and down. No picture leaves the computer.`
    : mode === "mouse"
      ? "With the camera on, a hand model finds 21 points on each hand, about 30 times a second. You used the mouse, so a pretend hand with the same 21 points followed your pointer through every step below."
      : "A hand model on this computer finds 21 points on each hand in the camera picture, about 30 times a second. Each point is just two numbers: across and down. No picture leaves the computer.";

  const hand = camera && stats.hand ? stats.hand : null;
  const trace = camera && story.trace.length >= 20 ? story.trace : null;

  const used = stats.instruments.map((i) => instrumentInfo(i));
  const recorded = used.filter((i) => i.source === "recorded").map((i) => INSTRUMENT_NAMES[i.id].toLowerCase());
  const built = used.filter((i) => i.source === "synthesised").map((i) => INSTRUMENT_NAMES[i.id].toLowerCase());
  const soundNumbers = used.length ? ` You played ${listWords([...recorded, ...built])}${recorded.length && built.length ? ", so you heard both kinds" : ""}.` : "";

  const lesson = stats.lesson;
  const win = lesson?.level === "advanced" ? WINDOWS.advanced : WINDOWS.beginner;
  const timingText = lesson
    ? `The beat comes from the computer's sound clock. Each note was matched to the nearest target: within ${win.perfect} ms counted as on time, up to ${win.max} ms as early or late. In your lesson you hit ${lesson.correct} of ${lesson.targets}${lesson.meanOffsetMs !== null ? `, ${offsetWords(lesson.meanOffsetMs)} on average` : ""}.`
    : `The beat comes from the computer's sound clock. In a lesson, each note is matched to the nearest target: within ${WINDOWS.beginner.perfect} ms is on time, up to ${WINDOWS.beginner.max} ms is early or late.${camera ? " The camera adds about 70 ms of delay, and the judge allows for it." : ""}`;

  return [
    {
      title: "It finds 21 points on each hand",
      text: pointsText,
      visual: <PointsVisual points={hand ?? SAMPLE_HAND} sample={!hand} aspect={story.aspect} fps={camera ? fps : null} />,
    },
    {
      title: "It steadies the points",
      text: `Points wobble a little even when you hold still: the thin line is ${trace ? "your" : "a"} fingertip as the model saw it. A filter smooths a slow hand a lot and a fast hand hardly at all, so keys stay steady and hits stay quick.`,
      visual: trace ? <SmoothVisual trace={trace} example={false} /> : <SmoothVisual trace={exampleTrace()} example />,
    },
    {
      title: "A hit is a fast move down",
      text: `It measures how fast your palm moves down in hand lengths a second, so it works near the camera or far from it. The moment the speed crosses ${r1(strike.threshold)}, that's a hit, and a faster hit plays louder.${fastest !== null ? ` Your fastest was ${fastest}.` : ""}`,
      visual: <StrikeVisual data={strike} />,
    },
    {
      title: "A resting hand stays quiet",
      text: `After a hit, the next one only counts once your hand slows below ${r1(strike.rearm)} hand lengths a second. So a hand held still, or still moving after a hit, plays nothing by accident.`,
      visual: <RearmVisual data={strike} />,
    },
    {
      title: "It makes the sound",
      text: `Piano, guitar and bass play short recordings of real instruments, sped up or slowed down for each note. Drums, percussion and synth are built from waves and noise as you play, so a harder hit changes the sound, not just the volume.${soundNumbers}`,
      visual: <SoundVisual recorded={recorded} built={built} />,
    },
    {
      title: "It judges your timing",
      text: timingText,
      visual: <TimingVisual offsets={lesson?.offsets ?? null} window={win.perfect} />,
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
        <HowItWorks title={TITLE} heading={false} columns="auto" steps={steps(story)} />
        <SoundCredits />
      </div>
    </Modal>
  );
}
