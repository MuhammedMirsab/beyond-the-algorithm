"use client";

import Image from "next/image";
import { FlaskConical, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Score, Stat } from "@/components/ui/score";
import { HowItWorks, ResultPanel } from "@/components/game/panels";
import { ConfidenceBars } from "@/components/ui/meter";
import { decide } from "../engine/rules";
import { EMBEDDING_SIZE, MODEL_NAME } from "../engine/vision";
import { joinWords, withArticle } from "./copy";
import { EmbeddingDots } from "./embedding-dots";
import { EXPERIMENT_EXAMPLES, tallyResults, type PreviousRun, type TestResult } from "./state";
import type { LearnGame } from "./use-learn-game";

const NUMBERS = EMBEDDING_SIZE.toLocaleString("en");

/** "10 pens and 10 cups" from per-label counts. */
function describeCounts(perGroup: Record<string, number>, plurals: Record<string, string>) {
  return joinWords(Object.entries(perGroup).map(([label, n]) => `${n} ${n === 1 ? label.toLowerCase() : (plurals[label] ?? label)}`));
}

function sameTestSet(a: Record<string, TestResult>, b: Record<string, TestResult>) {
  const ka = Object.keys(a).sort();
  const kb = Object.keys(b).sort();
  return ka.length === kb.length && ka.every((k, i) => k === kb[i]);
}

export function ResultsStep({ game }: { game: LearnGame }) {
  const { state, dataset, actions } = game;
  if (state.train.phase !== "done" || dataset.status !== "ready") return null;
  const run = state.train.run;
  const { threshold, results, previous } = state;
  const tally = tallyResults(results, threshold, run.similarityCutoff);
  const plurals = Object.fromEntries(dataset.manifest.categories.map((c) => [c.label, c.plural]));
  const fewest = Math.min(...Object.values(run.perGroup));
  const rounds = run.history.length;
  // In the order the visitor picked them.
  const picked = Object.keys(run.perGroup);
  const words = picked.map((l) => l.toLowerCase());
  const meaning =
    words.length === 2
      ? `which numbers mean ${words[0]} and which mean ${words[1]}`
      : `which numbers mean ${words.slice(0, -1).join(", ")} or ${words[words.length - 1]}`;
  const groups = run.labels.length;

  const title =
    tally.total === 0
      ? "The test photos didn’t load"
      : tally.right === tally.total
        ? `It got all ${tally.total} new photos right`
        : `It got ${tally.right} of ${tally.total} new photos right`;

  // One real prediction for the "it answers or stays quiet" visual.
  const example = Object.values(results)[0];
  const exampleDecision = example ? decide(example.candidates, { threshold, similarityCutoff: run.similarityCutoff }) : null;

  const comparable: PreviousRun | null = previous && sameTestSet(previous.results, results) ? previous : null;
  const previousTally = comparable ? tallyResults(comparable.results, threshold, comparable.similarityCutoff) : null;

  return (
    <ResultPanel
      label={`${MODEL_NAME} · ${groups} groups · ${run.examples} examples`}
      title={title}
      score={<Score value={tally.right} label={`of ${tally.total} right`} tone="game" />}
      stats={
        <>
          <Stat value={tally.wrong} label="Wrong" />
          <Stat value={tally.unknown} label="Said “I don’t know”" />
          <Stat value={run.examples} label="Examples" />
          <Stat value={`${run.seconds.toFixed(1)} s`} label="Training time" />
        </>
      }
      actions={
        <>
          <Button variant="game" size="lg" icon={<RotateCcw />} onClick={actions.nextPlayer}>
            Next player
          </Button>
          <Button variant="secondary" size="lg" onClick={() => actions.go("test")}>
            Back to testing
          </Button>
        </>
      }
    >
      {comparable && previousTally ? (
        <section aria-labelledby="compare" className="flex flex-col gap-4 rounded-xl bg-surface p-6 shadow-ring sm:p-8">
          <h2 id="compare" className="type-title-2 text-fg">
            Same test photos, different examples
          </h2>
          <dl className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1 rounded-lg bg-sunken p-4">
              <dt className="type-label text-fg-subtle">Last time</dt>
              <dd className="type-body text-fg-muted">
                Trained on {describeCounts(comparable.perGroup, plurals)}:{" "}
                <span className="font-semibold text-fg tabular-nums">
                  {previousTally.right} of {previousTally.total} right
                </span>
                {previousTally.unknown ? `, ${previousTally.unknown} “I don’t know”` : ""}.
              </dd>
            </div>
            <div className="flex flex-col gap-1 rounded-lg bg-sunken p-4">
              <dt className="type-label text-game">This time</dt>
              <dd className="type-body text-fg-muted">
                Trained on {describeCounts(run.perGroup, plurals)}:{" "}
                <span className="font-semibold text-fg tabular-nums">
                  {tally.right} of {tally.total} right
                </span>
                {tally.unknown ? `, ${tally.unknown} “I don’t know”` : ""}.
              </dd>
            </div>
          </dl>
          <p className="type-body max-w-[40rem] text-fg-muted">
            It can only be as good as its examples. Fewer or more similar examples give it less to find in common.
          </p>
        </section>
      ) : null}

      <HowItWorks
        intro={`Nobody told it what ${withArticle(picked[0] ?? run.labels[0])} looks like. It worked it out from your ${run.examples} examples.`}
        steps={[
          {
            title: "Photos become numbers",
            text: `MobileNet, an AI trained earlier on more than a million photos, turns each photo into ${NUMBERS} numbers. Similar things get similar numbers.`,
            visual: run.sample ? (
              <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] items-center gap-3 p-3">
                <div className="relative aspect-square overflow-hidden rounded-sm bg-canvas">
                  <Image src={run.sample.photo.url} alt={`One of your examples: ${run.sample.photo.label.toLowerCase()}`} fill unoptimized sizes="160px" className="object-cover" />
                </div>
                <EmbeddingDots values={run.sample.embedding} label={`The ${NUMBERS} numbers MobileNet made from that photo, drawn as dots.`} />
              </div>
            ) : undefined,
          },
          {
            title: "Your examples teach the last layer",
            text: `Your examples taught a small last layer ${meaning}. It practised for ${rounds} rounds, checking its answers each time.`,
            visual: (
              <figure className="flex flex-col gap-2 p-3">
                <div className={`grid gap-2 ${groups === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
                  {run.labels.map((label, i) => (
                    <div key={label} className="flex min-w-0 flex-col gap-1.5">
                      <EmbeddingDots values={run.centroids[i]} label={`Average numbers of the ${label.toLowerCase()} examples.`} />
                      <span className="type-label truncate text-fg-subtle">{label}</span>
                    </div>
                  ))}
                </div>
                <figcaption className="type-caption text-fg-subtle">The average numbers of each group</figcaption>
              </figure>
            ),
          },
          {
            title: "It answers, or stays quiet",
            text: `On a new photo it says how sure it is. Below ${Math.round(threshold * 100)}% sure, or when a photo looks like none of its examples, it says “I don’t know”.`,
            visual:
              example && exampleDecision ? (
                <div className="p-4">
                  <ConfidenceBars
                    size="sm"
                    rows={example.candidates.map((c) => ({ id: c.label, label: c.label, value: c.probability }))}
                    highlight={exampleDecision.answer ?? "none"}
                  />
                </div>
              ) : undefined,
          },
        ]}
      />

      <section aria-labelledby="experiment" className="flex flex-col items-start gap-4 rounded-xl bg-surface p-6 shadow-ring sm:p-8">
        <span className="type-label text-game">Try this</span>
        {fewest > EXPERIMENT_EXAMPLES ? (
          <>
            <h2 id="experiment" className="type-title-2 text-fg">
              Train again with only {EXPERIMENT_EXAMPLES} examples each and test the same photos
            </h2>
            <p className="type-body max-w-[40rem] text-fg-muted">
              It keeps the first {EXPERIMENT_EXAMPLES} photos of each group and forgets the rest. Then compare the scores.
            </p>
            <Button variant="secondary" size="lg" icon={<FlaskConical />} onClick={() => void actions.train(EXPERIMENT_EXAMPLES)}>
              Train with {EXPERIMENT_EXAMPLES} each
            </Button>
          </>
        ) : (
          <>
            <h2 id="experiment" className="type-title-2 text-fg">
              Now give it more examples and test the same photos
            </h2>
            <p className="type-body max-w-[40rem] text-fg-muted">
              Add photos from the library or the camera, train again, and compare the scores.
            </p>
            <Button variant="secondary" size="lg" icon={<FlaskConical />} onClick={() => actions.go("examples")}>
              Add more examples
            </Button>
          </>
        )}
      </section>
    </ResultPanel>
  );
}
