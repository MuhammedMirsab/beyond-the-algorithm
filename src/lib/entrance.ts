/**
 * Entrance animations that never hide server-rendered HTML.
 *
 * A motion element with `initial={{ opacity: 0 }}` is server-rendered with
 * opacity 0 and only appears once JavaScript has loaded and hydrated. On slow
 * venue Wi-Fi that is seconds of blank screen. `entrance(initial)` returns
 * `false` (no entrance) until the app has hydrated, and `initial` after that,
 * so step changes and client-side navigation still fade in.
 */

let hydrated = false;

/** Called once by the app's providers after the first client render. */
export function markHydrated() {
  hydrated = true;
}

/** Use as a motion `initial` on anything that can be on the first paint. */
export function entrance<T>(initial: T): T | false {
  return hydrated ? initial : false;
}
