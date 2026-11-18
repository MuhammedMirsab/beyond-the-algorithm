"use client";

import { motion, useInView, useReducedMotion } from "motion/react";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { decide, NONE_LABEL } from "../engine/rules";
import { EMBEDDING_SIZE } from "../engine/vision";
import { AccuracyChart } from "./accuracy-chart";
import { ClusterMap, MarkSwatch } from "./cluster-map";
import { joinWords } from "./copy";
import { EmbeddingDots } from "./embedding-dots";
import { UNSURE } from "./session";
import type { ExamplePhoto, TestResult, TrainedRun } from "./state";
import { SureBars } from "./verdict";

const NUMBERS = EMBEDDING_SIZE.toLocaleString("en");
const EASE_OUT = [0.22, 1, 0.36, 1] as const;

/** Plays once, when most of it has scrolled into view. */
function useReveal<T extends Element>() {
  const ref = useRef<T | null>(null);
  const inView = useInView(ref, { once: true, amount: 0.35 });
  const reduce = useReducedMotion();
  return { ref, on: inView || !!reduce, animate: !reduce };
}

/**
 * "How it did it": five steps, each a picture of this visitor's own photos,
 * numbers, training and answers.
 */
export function LearnsHowItWorks({
  run,
  labels,
  threshold,
  results,
  live,
  nonePhotos,
}: {
  run: TrainedRun;
  /** Every group, the visitor's first, "No object" last. */
  labels: string[];
  threshold: number;
  /** Test photo results, when it was tested on library photos. */
  results: Record<string, TestResult>;
  /** Live camera answers: label (or "unsure") to count. */
  live: Record<string, number>;
  /** Example photos of the "No object" group. */
  nonePhotos: ExamplePhoto[];
}) {
  const things = labels.filter((l) => l !== NONE_LABEL);
  const meaning =
    things.length === 2
      ? `which numbers mean ${things[0].toLowerCase()} and which mean ${things[1].toLowerCase()}`
      : `which numbers mean ${joinWords(things)}`;
  const first = run.history[0];
  const last = run.history.at(-1);
  const line = Math.round(threshold * 100);
  const explained = run.map ? Math.round((run.map.projection.explained[0] + run.map.projection.explained[1]) * 100) : 0;
  // One real answer to show: the first test photo it was confident about, else the first one.
  const scored = Object.values(results);
  const example =
    scored.find((r) => decide(r.candidates, { threshold, similarityCutoff: run.similarityCutoff }).answer) ?? scored[0] ?? null;
  const liveTotal = Object.values(live).reduce((a, b) => a + b, 0);

  return (
    <section aria-labelledby="how-title" className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 id="how-title" className="type-title-1 text-fg">
          How it did it
        </h2>
        <p className="type-body-lg max-w-[40rem] text-fg-muted">
          Nobody told it what {things[0]?.toLowerCase() ?? "your things"} looks like. It worked it out from your {run.examples}{" "}
          example photos, in two parts: one that turns photos into numbers, and one that learns from them.
        </p>
      </div>

      <ol className="flex flex-col gap-4">
        <Chapter
          index={1}
          title={`Each photo became ${NUMBERS} numbers`}
          visual={run.sample ? <PhotoToNumbers photo={run.sample.photo} embedding={run.sample.embedding} /> : null}
          readout={`${run.examples} photos × ${NUMBERS} numbers = ${(run.examples * EMBEDDING_SIZE).toLocaleString("en")} numbers`}
        >
          MobileNet, an AI already trained on more than a million photos, looks at each photo and writes down {NUMBERS} numbers.
          Each number says how strongly the photo shows one pattern it learned to spot, like a texture, a curve or a part of
          something. The photo itself is never used again.
        </Chapter>

        <Chapter
          index={2}
          title="Similar things got similar numbers"
          visual={run.map ? <MapVisual run={run} labels={labels} /> : null}
          readout={run.map ? `This flat view keeps ${explained}% of how your photos differ` : null}
        >
          Here are all {run.examples} of your photos, flattened from {NUMBERS} numbers onto a page. Photos of the same thing land
          close together, before any training: MobileNet already sees them as alike. That is what makes learning from a few
          examples possible.
        </Chapter>

        <Chapter
          index={3}
          title="Training taught the last layer"
          visual={<ChartVisual run={run} />}
          readout={
            first && last
              ? `Loss ${first.loss.toFixed(2)} → ${last.loss.toFixed(2)} · ${run.weights.toLocaleString("en")} numbers adjusted`
              : null
          }
        >
          A small last layer learned {meaning}. In each of {run.history.length} rounds it labelled every example, measured how
          wrong it was (the loss), and nudged its {run.weights.toLocaleString("en")} numbers to be a little less wrong.
        </Chapter>

        <Chapter
          index={4}
          title={`It answers only when it is ${line}% sure`}
          visual={
            example ? (
              <AnswerVisual result={example} threshold={threshold} run={run} />
            ) : liveTotal > 0 ? (
              <LiveVisual live={live} labels={labels} />
            ) : null
          }
          readout={
            liveTotal > 0
              ? `It answered ${liveTotal.toLocaleString("en")} times while you tested with the camera`
              : example
                ? `One of the ${scored.length} test photos`
                : null
          }
        >
          For a new picture it splits its confidence between the groups, adding up to 100%. It answers only when the top group
          is above {line}% (you can change that on the test screen) and the picture looks like its examples. Otherwise it says
          “I don’t know”, which is better than a confident mistake.
        </Chapter>

        <Chapter
          index={5}
          title="“No object” is a group it learned too"
          visual={nonePhotos.length ? <NoneVisual photos={nonePhotos} /> : null}
          readout={`${run.perGroup[NONE_LABEL] ?? nonePhotos.length} photos with nothing you taught it`}
        >
          Your photos with nothing in view became a group of their own. When that group wins, it says no object is present,
          instead of being forced to pick one of your things. Without it, a model can only ever answer with something it was
          taught.
        </Chapter>
      </ol>
    </section>
  );
}

function Chapter({
  index,
  title,
  visual,
  readout,
  children,
}: {
  index: number;
  title: string;
  visual: ReactNode;
  readout?: string | null;
  children: ReactNode;
}) {
  return (
    <li className="grid items-center gap-6 rounded-xl bg-surface p-4 shadow-ring sm:p-6 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] md:gap-8 lg:p-8">
      {visual ? <div className="dot-field relative aspect-[4/3] overflow-hidden rounded-lg bg-sunken">{visual}</div> : null}
      <div className={cn("flex min-w-0 flex-col gap-3", !visual && "md:col-span-2")}>
        <span className="type-label text-game">Step {index}</span>
        <h3 className="type-title-2 text-fg">{title}</h3>
        <p className="type-body-lg text-fg-muted">{children}</p>
        {readout ? <p className="type-label tabular-nums text-fg-subtle">{readout}</p> : null}
      </div>
    </li>
  );
}

/* ── 1. A photo, then its numbers ──────────────────────────────────── */

function PhotoToNumbers({ photo, embedding }: { photo: ExamplePhoto; embedding: Float32Array }) {
  const { ref, on, animate } = useReveal<HTMLDivElement>();
  return (
    <div ref={ref} className="absolute inset-0 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1.25fr)] items-center gap-3 p-4 sm:p-6">
      <motion.div
        className="relative aspect-square overflow-hidden rounded-md bg-canvas"
        initial={false}
        animate={{ opacity: on ? 1 : 0, x: on || !animate ? 0 : -10 }}
        transition={{ duration: 0.4, ease: EASE_OUT }}
      >
        <Image src={photo.url} alt={`One of your examples: ${photo.label.toLowerCase()}`} fill unoptimized sizes="200px" className="object-cover" />
      </motion.div>
      <ArrowRight aria-hidden className="size-6 text-game" />
      {/* The numbers sweep in from the left, as if read off the photo. */}
      <motion.div
        initial={false}
        animate={{ clipPath: on ? "inset(0% 0% 0% 0%)" : "inset(0% 100% 0% 0%)" }}
        transition={{ duration: animate ? 0.9 : 0, delay: 0.35, ease: EASE_OUT }}
      >
        <EmbeddingDots values={embedding} label={`The ${NUMBERS} numbers MobileNet made from that photo, drawn as dots. Bigger dot, bigger number.`} />
      </motion.div>
    </div>
  );
}

/* ── 2. The map ─────────────────────────────────────────────────────── */

function MapVisual({ run, labels }: { run: TrainedRun; labels: string[] }) {
  const { ref, on } = useReveal<HTMLDivElement>();
  if (!run.map) return null;
  return (
    <div ref={ref} className="absolute inset-0 flex flex-col">
      <div className="min-h-0 flex-1">
        {on ? (
          <ClusterMap
            map={run.map}
            labels={labels}
            fly
            className="h-full"
            label={`Your ${run.examples} photos as dots. Photos of the same thing land close together.`}
          />
        ) : null}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 px-4 pb-3">
        {labels.map((l) => (
          <li key={l} className="type-label inline-flex items-center gap-1.5 text-fg-muted">
            <MarkSwatch label={l} labels={labels} />
            {l}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ── 3. The training rounds ─────────────────────────────────────────── */

function ChartVisual({ run }: { run: TrainedRun }) {
  const { ref, on, animate } = useReveal<HTMLDivElement>();
  return (
    <div ref={ref} className="absolute inset-0 flex flex-col justify-center p-4 sm:p-6">
      <motion.div
        initial={false}
        animate={{ clipPath: on ? "inset(0% 0% 0% 0%)" : "inset(0% 100% 0% 0%)" }}
        transition={{ duration: animate ? 1.1 : 0, ease: EASE_OUT }}
      >
        <AccuracyChart history={run.history} total={run.history.length} />
      </motion.div>
    </div>
  );
}

/* ── 4. One real answer, or what it said live ──────────────────────── */

function AnswerVisual({ result, threshold, run }: { result: TestResult; threshold: number; run: TrainedRun }) {
  const { ref, on } = useReveal<HTMLDivElement>();
  const decision = decide(result.candidates, { threshold, similarityCutoff: run.similarityCutoff });
  return (
    <div ref={ref} className="absolute inset-0 flex flex-col justify-center gap-4 p-4 sm:p-6">
      <div className="flex items-baseline justify-between gap-3">
        <span className="type-label text-fg-muted">A test photo of {result.truth.toLowerCase()}</span>
        <span className={cn("type-title-3", decision.answer ? "text-game" : "text-fg-muted")}>{decision.answer ?? "I don’t know"}</span>
      </div>
      <motion.div initial={false} animate={{ opacity: on ? 1 : 0 }} transition={{ duration: 0.4, ease: EASE_OUT }}>
        {/* The bars grow from zero once in view (their own transition does the motion). */}
        <SureBars candidates={on ? result.candidates : result.candidates.map((c) => ({ ...c, probability: 0 }))} decision={decision} threshold={threshold} />
      </motion.div>
    </div>
  );
}

function LiveVisual({ live, labels }: { live: Record<string, number>; labels: string[] }) {
  const { ref, on } = useReveal<HTMLDivElement>();
  const rows = [...labels, UNSURE]
    .map((l) => ({ label: l === UNSURE ? "I don’t know" : l, count: live[l] ?? 0 }))
    .filter((r) => r.count > 0);
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div ref={ref} className="absolute inset-0 flex flex-col justify-center gap-3 p-4 sm:p-6">
      <span className="type-label text-fg-muted">What it said while you tested</span>
      <ul className="flex flex-col gap-3">
        {rows.map((row, i) => (
          <li key={row.label} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5">
            <span className="type-body truncate font-semibold text-fg">{row.label}</span>
            <span className="type-body font-semibold tabular-nums text-fg-subtle">{row.count}</span>
            <span aria-hidden className="relative col-span-2 block h-2.5 overflow-hidden rounded-full bg-fg/10">
              <motion.span
                className="absolute inset-0 origin-left rounded-full bg-game"
                initial={false}
                animate={{ scaleX: on ? row.count / max : 0 }}
                transition={{ duration: 0.6, delay: Math.min(i, 4) * 0.06, ease: EASE_OUT }}
              />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ── 5. The "No object" group ───────────────────────────────────────── */

function NoneVisual({ photos }: { photos: ExamplePhoto[] }) {
  const { ref, on } = useReveal<HTMLDivElement>();
  const shown = photos.slice(0, 6);
  return (
    <div ref={ref} className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-4 sm:p-6">
      <div className="grid w-full grid-cols-3 gap-2">
        {shown.map((photo, i) => (
          <motion.div
            key={photo.id}
            className="relative aspect-[4/3] overflow-hidden rounded-sm bg-canvas"
            initial={false}
            animate={{ opacity: on ? 1 : 0, scale: on ? 1 : 0.94 }}
            transition={{ duration: 0.35, delay: Math.min(i, 4) * 0.05, ease: EASE_OUT }}
          >
            <Image src={photo.url} alt="" fill unoptimized sizes="120px" className="object-cover" />
          </motion.div>
        ))}
      </div>
      <motion.span
        className="type-title-3 inline-flex items-center gap-2 rounded-full bg-raised px-4 py-2 text-fg shadow-ring"
        initial={false}
        animate={{ opacity: on ? 1 : 0 }}
        transition={{ duration: 0.3, delay: 0.4, ease: EASE_OUT }}
      >
        <MarkSwatch label={NONE_LABEL} labels={[NONE_LABEL]} />
        {NONE_LABEL}
      </motion.span>
    </div>
  );
}
