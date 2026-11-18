"use client";

import { ListMusic, RotateCcw, Trophy } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useState, type Ref } from "react";
import { ResultPanel } from "@/components/game/panels";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Score, Stat } from "@/components/ui/score";
import { WINDOWS } from "../engine/practice/scoring";
import { INSTRUMENT_NAMES } from "../engine/settings";
import type { LessonResult, Story } from "../play/session";
import { StudioHowItWorks } from "./how-it-works";
import { OffsetChart, offsetWords, Recommendations } from "./report-bits";
import { SoundCredits } from "./sound-credits";

/** The score rolls up from zero a moment after the result arrives: the one big reveal of a lesson. */
function RevealScore({ value }: { value: number }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const timer = window.setTimeout(() => setShown(value), 380);
    return () => window.clearTimeout(timer);
  }, [value]);
  return <Score value={shown} label="Score" tone="game" />;
}

function verdict(r: LessonResult): string {
  const { correct, perfect, targets } = r.report;
  if (!targets || !correct) return "No notes landed this time";
  if (correct === targets && perfect === targets) return `All ${targets} on time`;
  return `You hit ${correct} of ${targets}`;
}

/** A finished lesson: the verdict, the score, the visitor's own numbers, then the reveal. */
export function ResultView({
  result,
  story,
  headingRef,
  onAgain,
  onLessons,
  onFreePlay,
}: {
  result: LessonResult;
  story: Story;
  headingRef: Ref<HTMLHeadingElement>;
  onAgain: () => void;
  onLessons: () => void;
  onFreePlay: () => void;
}) {
  const r = result.report;
  const win = WINDOWS[result.level];
  return (
    <ResultPanel
      label={`${INSTRUMENT_NAMES[result.lesson.inst]} lesson · ${result.lesson.title}`}
      badge={
        result.improved ? (
          <Chip tone="game" icon={<Trophy />}>
            Your best yet
          </Chip>
        ) : null
      }
      title={verdict(result)}
      headingRef={headingRef}
      score={<RevealScore value={r.overall ?? 0} />}
      stats={
        <>
          <Stat value={r.perfect ?? 0} label={`On time, within ${win.perfect} ms`} />
          <Stat value={r.early ?? 0} label="Early" />
          <Stat value={r.late ?? 0} label="Late" />
          <Stat value={r.missed ?? 0} label="Missed" />
          {r.meanOffsetMs !== null ? <Stat value={offsetWords(r.meanOffsetMs) ?? ""} label="On average" /> : null}
        </>
      }
      actions={
        <>
          <Button variant="game" size="lg" arrow autoFocus icon={<RotateCcw />} onClick={onAgain}>
            Try again
          </Button>
          <Button variant="secondary" size="lg" icon={<ListMusic />} onClick={onLessons}>
            Another lesson
          </Button>
          <Button variant="secondary" size="lg" onClick={onFreePlay}>
            Back to free play
          </Button>
        </>
      }
    >
      <motion.section
        aria-label="Your timing"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: 0.25 } }}
        className="flex flex-col gap-8 rounded-xl bg-surface p-6 shadow-ring sm:p-8"
      >
        <OffsetChart offsets={r.offsets} window={win.perfect} reveal />
        <Recommendations items={r.recommendations} />
      </motion.section>
      <StudioHowItWorks story={story} />
      <SoundCredits />
    </ResultPanel>
  );
}
