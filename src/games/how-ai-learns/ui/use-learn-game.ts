"use client";

import { useEffect, useReducer, useSyncExternalStore } from "react";
import { useIdle } from "@/lib/idle";
import {
  disposeClassifier,
  scoreEmbedding,
  trainClassifier,
  TRAINING_DEFAULTS,
  TrainingCancelled,
  type Classifier,
  type Example,
} from "../engine/classifier";
import { drawFromPool, photoUrl, type DatasetPhoto } from "../engine/dataset";
import { loadFeatureExtractor, loadTf, modelStatusStore } from "../engine/vision";
import { withArticle } from "./copy";
import { getSession } from "./session";
import {
  initialState,
  LIBRARY_BATCH,
  perGroupCounts,
  reducer,
  testPhotosFor,
  type ExamplePhoto,
  type StepId,
} from "./state";
import { useDataset } from "./use-dataset";

/**
 * Training and evaluation runs are numbered. Anything that finishes after a
 * newer run started (or after Next player) is thrown away, tensors included.
 */
let activeRun = 0;

/** Wait for the next painted frame, or 100 ms if the tab is hidden. */
function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      window.cancelAnimationFrame(frame);
      resolve();
    }, 100);
    const frame = window.requestAnimationFrame(() => {
      window.clearTimeout(timer);
      resolve();
    });
  });
}

function trainingErrorText(error: unknown): string {
  const status = modelStatusStore.getSnapshot();
  if (status.state === "error") return "The AI model didn’t load. Check the internet connection, then try again.";
  if (error instanceof Error && error.message.startsWith("Could not load")) {
    return "One of the photos didn’t load. Check the internet connection, then try again.";
  }
  return "Training stopped before it finished. Try again.";
}

export function libraryExample(photo: DatasetPhoto): ExamplePhoto {
  return { id: photo.id, category: photo.category, label: photo.label, url: photoUrl(photo), kind: "library", title: photo.title };
}

const toEmbeddable = (photo: ExamplePhoto) => ({ id: photo.id, url: photo.url, fromVisitor: photo.kind === "camera" });

export function useLearnGame() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const dataset = useDataset();
  const model = useSyncExternalStore(modelStatusStore.subscribe, modelStatusStore.getSnapshot, modelStatusStore.getServerSnapshot);

  const testPhotos = dataset.status === "ready" ? testPhotosFor(state.picked, dataset.split.test) : [];

  /* ── Actions ──────────────────────────────────────────────────── */

  const go = (step: StepId) => {
    dispatch({ type: "go", step });
    window.scrollTo({ top: 0 });
  };

  const start = () => {
    go("pick");
    // Start the 2.6 MB download now; it is usually done before training.
    loadFeatureExtractor().catch(() => {
      // The status store shows the error where it matters (the Train step).
    });
  };

  const addFromLibrary = (category: string) => {
    if (dataset.status !== "ready") return;
    const taken = new Set((state.examples[category] ?? []).map((p) => p.id));
    const photos = drawFromPool(dataset.split.pool.get(category) ?? [], taken, LIBRARY_BATCH).map(libraryExample);
    dispatch({ type: "add-examples", category, photos });
  };

  const addCameraPhoto = (category: string, label: string, canvas: HTMLCanvasElement) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const session = getSession();
        const url = URL.createObjectURL(blob);
        session.trackBlobUrl(url);
        const id = `cam_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
        dispatch({
          type: "add-examples",
          category,
          photos: [{ id, category, label, url, kind: "camera", title: `Your photo of ${withArticle(label)}` }],
        });
        // Read it straight from the canvas while we have it.
        if (modelStatusStore.getSnapshot().state === "ready") {
          session.embed({ id, url, fromVisitor: true }, canvas).catch(() => {});
        }
      },
      "image/jpeg",
      0.9,
    );
  };

  const removeExample = (photo: ExamplePhoto) => {
    dispatch({ type: "remove-example", category: photo.category, id: photo.id });
    if (photo.kind === "camera") getSession().forgetVisitorPhoto(photo.id, photo.url);
  };

  const evaluateTests = async (run: number, classifier: Classifier, photos: DatasetPhoto[]) => {
    const tf = await loadTf();
    const session = getSession();
    for (const photo of photos) {
      if (run !== activeRun) return;
      try {
        const embedding = await session.embed({ id: photo.id, url: photoUrl(photo), fromVisitor: false });
        if (run !== activeRun) return;
        const candidates = await scoreEmbedding(tf, classifier, embedding);
        if (run !== activeRun) return;
        dispatch({ type: "test-result", id: photo.id, result: { truth: photo.label, candidates } });
      } catch {
        if (run === activeRun) dispatch({ type: "test-failed", id: photo.id });
      }
    }
  };

  /** keepFirst: the experiment, "train again with only 3 examples each". */
  const train = async (keepFirst?: number) => {
    const run = ++activeRun;
    const session = getSession();
    const examples = state.picked.flatMap((category) => (state.examples[category] ?? []).slice(0, keepFirst ?? Infinity));
    const photos = testPhotos;
    if (keepFirst) dispatch({ type: "keep-first", count: keepFirst });
    // The old model is not needed while a new one trains: free its tensors now.
    session.setClassifier(null);
    dispatch({ type: "train-start" });
    window.scrollTo({ top: 0 });

    try {
      await loadFeatureExtractor();
      if (run !== activeRun) return;
      const t0 = performance.now();
      // Time spent waiting for the screen to paint is not training time.
      let paused = 0;
      const paint = async () => {
        const p0 = performance.now();
        await nextFrame();
        paused += performance.now() - p0;
      };
      dispatch({ type: "train", train: { phase: "reading", done: 0, total: examples.length, current: null } });
      const items: Example[] = [];
      for (const [i, photo] of examples.entries()) {
        const embedding = await session.embed(toEmbeddable(photo));
        if (run !== activeRun) return;
        items.push({ id: photo.id, label: photo.label, embedding });
        dispatch({
          type: "train",
          train: { phase: "reading", done: i + 1, total: examples.length, current: { photo, embedding } },
        });
        await paint();
      }

      const tf = await loadTf();
      dispatch({ type: "train", train: { phase: "practising", history: [], total: TRAINING_DEFAULTS.epochs } });
      const classifier = await trainClassifier(tf, items, {
        holdOut: { val: 0, test: 0 },
        onEpoch: async (log) => {
          if (run === activeRun) dispatch({ type: "train-epoch", log });
          await paint();
        },
        shouldStop: () => run !== activeRun,
      });
      if (run !== activeRun) {
        disposeClassifier(classifier);
        return;
      }
      session.setClassifier(classifier);
      const first = examples[0];
      dispatch({
        type: "train",
        train: {
          phase: "done",
          run: {
            labels: classifier.labels,
            centroids: classifier.centroids,
            similarityCutoff: classifier.similarityCutoff,
            history: classifier.history,
            perGroup: perGroupCounts(examples),
            examples: items.length,
            seconds: (performance.now() - t0 - paused) / 1000,
            sample: first ? { photo: first, embedding: items[0].embedding } : null,
          },
        },
      });
      void evaluateTests(run, classifier, photos);
    } catch (error) {
      if (run !== activeRun || error instanceof TrainingCancelled) return;
      dispatch({ type: "train", train: { phase: "error", message: trainingErrorText(error) } });
    }
  };

  const nextPlayer = () => {
    activeRun++;
    getSession().resetVisitor();
    dispatch({ type: "reset" });
    window.scrollTo({ top: 0 });
  };

  /* ── Effects ──────────────────────────────────────────────────── */

  // Read example photos (then the test photos) in the background while the
  // visitor is still choosing, so training itself takes seconds.
  const { step, picked, examples } = state;
  const modelReady = model.state === "ready";
  useEffect(() => {
    if (!modelReady || step !== "examples") return;
    let stopped = false;
    const tests = dataset.status === "ready" ? testPhotosFor(picked, dataset.split.test) : [];
    const photos = [
      ...picked.flatMap((category) => examples[category] ?? []).map(toEmbeddable),
      ...tests.map((p) => ({ id: p.id, url: photoUrl(p), fromVisitor: false })),
    ];
    void getSession().warm(photos, () => stopped);
    return () => {
      stopped = true;
    };
  }, [modelReady, step, picked, examples, dataset]);

  // Leaving the page: drop the model and the visitor's photos.
  useEffect(
    () => () => {
      activeRun++;
      getSession().resetVisitor();
    },
    [],
  );

  // Booth: intro and results reset after 90 s; mid-game after 3 minutes,
  // except while someone is testing with the camera (no input events then).
  const midGame = step === "pick" || step === "examples" || step === "train" || step === "test";
  const cameraOnly = (step === "test" && state.testMode === "camera") || state.capture !== null;
  useIdle(nextPlayer, { enabled: step === "intro" || step === "results" });
  useIdle(nextPlayer, { ms: 180_000, enabled: midGame && !cameraOnly });

  return {
    state,
    dispatch,
    dataset,
    model,
    testPhotos,
    actions: { go, start, addFromLibrary, addCameraPhoto, removeExample, train, nextPlayer },
  };
}

export type LearnGame = ReturnType<typeof useLearnGame>;
