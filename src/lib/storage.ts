/**
 * Safe localStorage access. Every read and write is wrapped: private windows,
 * blocked storage and server rendering all fall back to the default value.
 * Keys are namespaced `bta:<scope>:<name>` so games never collide.
 */

export const storageKey = (scope: string, name: string) => `bta:${scope}:${name}`;

export function readJSON<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function writeJSON(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    // Same-tab listeners (other tabs get the native "storage" event).
    window.dispatchEvent(new CustomEvent("bta-storage", { detail: key }));
  } catch {
    // Storage full or blocked: the game keeps working without persistence.
  }
}

export function removeKey(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
    window.dispatchEvent(new CustomEvent("bta-storage", { detail: key }));
  } catch {
    // ignore
  }
}

/** Subscribe to changes of one key, from this tab or another one. */
export function subscribeKey(key: string, onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (e: StorageEvent) => {
    if (e.key === key || e.key === null) onChange();
  };
  const onLocal = (e: Event) => {
    if ((e as CustomEvent<string>).detail === key) onChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener("bta-storage", onLocal);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("bta-storage", onLocal);
  };
}
