"use client";

import { FlaskConical } from "lucide-react";
import { NextPlayerIcon } from "@/components/game/next-player";
import { Button } from "@/components/ui/button";
import { Score, Stat } from "@/components/ui/score";
import { ResultPanel } from "@/components/game/panels";
import { NONE_LABEL } from "../engine/rules";
import { MODEL_NAME } from "../engine/vision";
import { joinWords } from "./copy";
import { LearnsHowItWorks } from "./how-it-works";
import { getSession } from "./session";
import { EXPERIMENT_EXAMPLES, tallyResults, trainingGroups, type PreviousRun, type TestResult } from "./state";
import type { LearnGame } from "./use-learn-game";

/** "10 pens and 10 cups" from per-label counts. */
function describeCounts(perGroup: Record<string, number>, plurals: Record<string, string>) {
  return joinWords(
    Object.entries(perGroup).map(([label, n]) =>
      label === NONE_LABEL ? `${n} with no object` : `${n} ${n === 1 ? label.toLowerCase() : (plurals[label] ?? label)}`,
    ),
  );
}

function sameTestSet(a: Record<string, TestResult>, b: Record<string, TestResult>) {
  const ka = Object.keys(a).sort();
  const kb = Object.keys(b).sort();
  return ka.length === kb.length && ka.every((k, i) => k === kb[i]);
}

export function ResultsStep({ game }: { game: LearnGame }) {
  const { state, dataset, actions, testPhotos } = game;
  if (state.train.phase !== "done" || dataset.status !== "ready") return null;
  const run = state.train.run;
  const { threshold, results, previous } = state;
  const tally = tallyResults(results, threshold, run.similarityCutoff);
  const plurals = Object.fromEntries(dataset.manifest.categories.map((c) => [c.label, c.plural]));
  const fewest = Math.min(...Object.values(run.perGroup));
  const labels = trainingGroups(state.groups).map((g) => g.label);
  const things = labels.filter((l) => l !== NONE_LABEL);
  // Every group was taught with the camera: there are no library test photos to score.
  const cameraOnly = testPhotos.length === 0;
  // Library test photos exist only for groups that used the library: say which, when it's not all of them.
  const tested = state.groups.filter((g) => g.library);
  const testedWords =
    tested.length < state.groups.length
      ? ` of ${joinWords(tested.map((g) => dataset.manifest.categories.find((c) => c.id === g.library)?.plural ?? g.name))}`
      : "";
  const live = getSession().liveCounts();
  const liveTotal = Object.values(live).reduce((a, b) => a + b, 0);

  const title = cameraOnly
    ? `It learned to tell ${joinWords(things)} apart`
    : tally.total === 0
      ? "The test photos didn’t load"
      : tally.right === tally.total
        ? `It got all ${tally.total} new photos${testedWords} right`
        : `It got ${tally.right} of ${tally.total} new photos${testedWords} right`;

  const comparable: PreviousRun | null = previous && sameTestSet(previous.results, results) ? previous : null;
  const previousTally = comparable ? tallyResults(comparable.results, threshold, comparable.similarityCutoff) : null;

  return (
    <ResultPanel
      label={`${MODEL_NAME} · ${labels.length} groups · ${run.examples} examples`}
      title={title}
      score={cameraOnly || tally.total === 0 ? undefined : <Score value={tally.right} label={`of ${tally.total} right`} tone="game" />}
      stats={
        <>
          {cameraOnly ? null : (
            <>
              <Stat value={tally.wrong} label="Wrong" />
              <Stat value={tally.unknown} label="Said “I don’t know”" />
            </>
          )}
          {liveTotal > 0 ? <Stat value={liveTotal.toLocaleString("en")} label="Live answers" /> : null}
          <Stat value={run.examples} label="Examples" />
          <Stat value={`${run.seconds.toFixed(1)} s`} label="Training time" />
        </>
      }
      actions={
        <>
          <Button variant="game" size="lg" icon={<NextPlayerIcon />} onClick={actions.nextPlayer}>
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

      <LearnsHowItWorks run={run} labels={labels} threshold={threshold} results={results} live={live} />

      <section aria-labelledby="experiment" className="flex flex-col items-start gap-4 rounded-xl bg-surface p-6 shadow-ring sm:p-8">
        <span className="type-label text-game">Try this</span>
        {fewest > EXPERIMENT_EXAMPLES ? (
          <>
            <h2 id="experiment" className="type-title-2 text-fg">
              Train again with only {EXPERIMENT_EXAMPLES} examples each and test {cameraOnly ? "it again" : "the same photos"}
            </h2>
            <p className="type-body max-w-[40rem] text-fg-muted">
              It keeps the first {EXPERIMENT_EXAMPLES} photos of each group and forgets the rest.{" "}
              {cameraOnly ? "Then see how much worse it gets." : "Then compare the scores."}
            </p>
            <Button variant="secondary" size="lg" icon={<FlaskConical />} onClick={() => void actions.train(EXPERIMENT_EXAMPLES)}>
              Train with {EXPERIMENT_EXAMPLES} each
            </Button>
          </>
        ) : (
          <>
            <h2 id="experiment" className="type-title-2 text-fg">
              Now give it more examples and test {cameraOnly ? "it again" : "the same photos"}
            </h2>
            <p className="type-body max-w-[40rem] text-fg-muted">
              Take more photos with the camera, train again, and {cameraOnly ? "see what changes" : "compare the scores"}.
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
