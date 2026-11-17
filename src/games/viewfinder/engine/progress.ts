/**
 * Fans one loading job's progress out to every caller waiting on it.
 *
 * The original tracker only told its first caller how the download was
 * going: anyone who joined while it was in flight (Play again during a
 * load, React StrictMode's second mount) waited on a frozen bar. A late
 * subscriber here gets the latest value at once, then every later one.
 */
export interface ProgressHub<T> {
  /** Adds a listener and replays the latest value. Returns an unsubscribe. */
  subscribe(listener: (value: T) => void): () => void;
  emit(value: T): void;
  /** Forgets the latest value (the job finished or failed). Listeners stay. */
  reset(): void;
  readonly size: number;
}

export function createProgressHub<T>(): ProgressHub<T> {
  const listeners = new Set<(value: T) => void>();
  let latest: { value: T } | null = null;

  return {
    subscribe(listener) {
      listeners.add(listener);
      if (latest) listener(latest.value);
      return () => {
        listeners.delete(listener);
      };
    },
    emit(value) {
      latest = { value };
      for (const listener of [...listeners]) listener(value);
    },
    reset() {
      latest = null;
    },
    get size() {
      return listeners.size;
    },
  };
}
