"use client";

import { useEffect, useSyncExternalStore } from "react";
import { MANIFEST_URL, parseManifest, splitLibrary, type DatasetManifest, type LibrarySplit } from "../engine/dataset";

export type DatasetState =
  | { status: "loading" }
  | { status: "ready"; manifest: DatasetManifest; split: LibrarySplit }
  | { status: "error" };

/** One fetch per page; every component reads the same snapshot. */
let state: DatasetState = { status: "loading" };
let requested = false;
const listeners = new Set<() => void>();
const SERVER_STATE: DatasetState = { status: "loading" };

function setState(next: DatasetState) {
  state = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function loadDataset() {
  if (requested) return;
  requested = true;
  if (state.status === "error") setState({ status: "loading" });
  fetch(MANIFEST_URL)
    .then((res) => {
      if (!res.ok) throw new Error(`Manifest answered ${res.status}`);
      return res.json() as Promise<unknown>;
    })
    .then((json) => {
      const manifest = parseManifest(json);
      setState({ status: "ready", manifest, split: splitLibrary(manifest.photos) });
    })
    .catch(() => {
      requested = false;
      setState({ status: "error" });
    });
}

export function useDataset(): DatasetState {
  const snapshot = useSyncExternalStore(
    subscribe,
    () => state,
    () => SERVER_STATE,
  );
  useEffect(() => {
    loadDataset();
  }, []);
  return snapshot;
}
