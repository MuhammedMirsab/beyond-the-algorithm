"use client";

import { HowItWorks } from "@/components/game/panels";
import { Modal } from "@/components/ui/dialog";
import type { InkImage } from "../engine/exportImage";
import { CLOUD_SIZE, sampleClouds, type LetterBox, type LetterClouds } from "../engine/letters";
import type { Recognition } from "../engine/recognition/recognize";
import { HandDiagram } from "./hand-diagram";
import { InkFigure } from "./ink-figure";
import { LetterCloudsCompare } from "./letter-clouds";

/** What happened on the visitor's last read, so the steps can point at it. */
export interface ReadingStory {
  ink: InkImage;
  result: Recognition;
  /** The reading was rude and is not shown. */
  hidden: boolean;
  boxes: LetterBox[];
  words: number;
  clouds: LetterClouds | null;
}

interface StoryProps {
  story?: ReadingStory | null;
  /** Frames per second the hand model actually ran at, when the camera was on. */
  fps?: number | null;
  /** Whether a fingertip in the air wrote the ink (false: mouse or touch). */
  usedCamera?: boolean;
}

export const TITLE = "How it read your writing";
export const INTRO = "Everything happens on this device. Nothing is sent anywhere, so it works without the internet.";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "HI" with a box round each letter: a stand-in before the visitor has written anything. */
function SampleSplit() {
  return (
    <div role="img" aria-label="Example: HI split into two letters" className="dot-field grid h-36 place-items-center">
      <svg viewBox="0 0 120 70" aria-hidden className="h-28 w-auto">
        <g fill="none" strokeLinecap="round" strokeLinejoin="round">
          <path d="M30 18v36M58 18v36M30 36h28M88 18v36" className="stroke-fg" strokeWidth={4.5} />
          <rect x="21" y="10" width="46" height="52" rx="3" className="stroke-game" strokeWidth={1.6} strokeDasharray="4 3" />
          <rect x="79" y="10" width="18" height="52" rx="3" className="stroke-game" strokeWidth={1.6} strokeDasharray="4 3" />
        </g>
      </svg>
    </div>
  );
}

function handText({ fps, usedCamera = true }: StoryProps): string {
  if (!usedCamera) {
    return "With the camera on, a hand model on this device finds 21 points on your hand about 30 times a second, and your index fingertip becomes the pen. This time you used the mouse or touch.";
  }
  const rate = fps && fps > 0 ? `${fps} times a second here` : "about 30 times a second";
  return `A hand model on this device finds 21 points on your hand, ${rate}. Your index fingertip becomes the pen, and a pinch lifts it.`;
}

function splitText(story: ReadingStory | null | undefined): string {
  const base = "Strokes that overlap from side to side make one letter. A bigger gap starts a new word.";
  if (!story || !story.boxes.length) return base;
  const words = story.words > 1 ? ` in ${plural(story.words, "word", "words")}` : "";
  return `${base} This time it found ${plural(story.boxes.length, "letter", "letters")}${words}.`;
}

function matchText(story: ReadingStory | null | undefined): string {
  const base = `Each letter becomes a cloud of ${CLOUD_SIZE} points and is compared with a library of letter shapes. A word list settles look-alikes, like O and D.`;
  if (!story) return base;
  const ms = `${Math.max(1, Math.round(story.result.ms))} ms`;
  if (story.hidden) return `${base} This time it read a word this screen keeps hidden.`;
  if (story.result.kind === "unreadable") return `${base} This time no shape was close enough, so it said so instead of guessing.`;
  return `${base} It read “${story.result.text}”, ${Math.round(story.result.confidence * 100)}% sure, in ${ms}.`;
}

function steps(props: StoryProps) {
  const { story } = props;
  const clouds = story?.clouds && !story.hidden ? story.clouds : null;
  return [
    {
      title: "It finds your hand",
      text: handText(props),
      visual: (
        <div className="dot-field grid h-36 place-items-center">
          <HandDiagram className="h-28 w-auto" />
        </div>
      ),
    },
    {
      title: "It splits the ink into letters",
      text: splitText(story),
      visual: story ? <InkFigure ink={story.ink} boxes={story.hidden ? story.boxes.map((b) => ({ ...b, char: null })) : story.boxes} compact /> : <SampleSplit />,
    },
    {
      title: "It matches each letter",
      text: matchText(story),
      visual: clouds ? <LetterCloudsCompare clouds={clouds} /> : <LetterCloudsCompare clouds={sampleClouds()} sample />,
    },
  ];
}

/** The reveal under the first result. */
export function AirWriteHowItWorks({ className, ...props }: StoryProps & { className?: string }) {
  return <HowItWorks title={TITLE} intro={INTRO} steps={steps(props)} className={className} />;
}

/** The same three steps in a modal, from the header. */
export function HowItWorksModal({ open, onOpenChange, ...props }: StoryProps & { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Modal open={open} onOpenChange={onOpenChange} size="lg" title={TITLE} description={INTRO}>
      <HowItWorks title={TITLE} heading={false} columns={3} steps={steps(props)} />
    </Modal>
  );
}
