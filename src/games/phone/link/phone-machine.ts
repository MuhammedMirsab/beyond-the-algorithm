import { TIMING, type EndReason, type Message } from "./protocol";

/**
 * The visitor's phone side of the link, as a pure state machine (see
 * host-machine.ts for the laptop). The phone is the visitor's own device, so
 * the link ending never wipes what they were doing on it: they keep playing
 * on the phone, with a note saying why the booth screen let go.
 *
 * - A fresh scan that can't connect ends in `failed`, with a reason the UI can
 *   explain (expired code, someone else linked, no internet, too slow).
 * - Once linked, a dropped line, a locked screen or leaving the game never
 *   ends the session on its own: the phone keeps trying to get back for as
 *   long as the laptop holds the session (`TIMING.grace`).
 */

export type FailReason = "expired" | "busy" | "network" | "timeout" | "unsupported";

/** Why the phone is no longer linked, said once in a dismissible note. */
export type PhoneNotice = "reset" | "idle" | "timeout" | "replaced" | "gone" | "lost" | "unlinked";

export type PhoneState =
  /** Playing on this phone only. */
  | { kind: "off"; notice: PhoneNotice | null }
  /** `resume`: the code and token came back from the address bar or memory (a reload, a return to the game). */
  | { kind: "connecting"; code: string; token: string; resume: boolean; since: number; attempt: number }
  | { kind: "linked"; code: string; token: string; lastSeen: number; hidden: boolean }
  /** `nextAt`: when the next attempt starts if this one hasn't been welcomed by then. */
  | { kind: "reconnecting"; code: string; token: string; since: number; nextAt: number; attempt: number; hidden: boolean }
  | { kind: "failed"; code: string; token: string; reason: FailReason; attempt: number };

export type PhoneEvent =
  | { type: "begin"; code: string; token: string; resume: boolean; now: number }
  /** The laptop accepted. `resume`: it already knew this phone. */
  | { type: "welcome"; resume: boolean; now: number }
  | { type: "busy" }
  /** The matchmaking server doesn't know the code: the laptop moved on or was closed. */
  | { type: "unavailable" }
  /** This attempt failed: no internet, the matchmaking server, or WebRTC itself. */
  | { type: "failed"; now: number; unsupported?: boolean }
  /** Anything else from the laptop: proof it's still there. */
  | { type: "message"; now: number }
  | { type: "end"; reason: EndReason }
  | { type: "closed"; now: number }
  | { type: "hidden"; now: number }
  /** `open`: the line to the laptop survived while the page was hidden. */
  | { type: "visible"; now: number; open: boolean }
  | { type: "tick"; now: number }
  /** Try again, after a failure. */
  | { type: "retry"; now: number }
  /** Unlink, or "Play on this phone only". */
  | { type: "unlink" }
  | { type: "next-player" }
  /** The game is closing (the visitor went back to the arcade): step away, don't end. */
  | { type: "leave" }
  | { type: "dismiss" };

export type PhoneEffect =
  /** Drop any old line, then connect to the laptop's code and say hello with the token. */
  | { type: "connect"; code: string; token: string }
  | { type: "send"; message: Message }
  | { type: "disconnect" }
  /** Put the visitor back where the laptop last saw them (after a reload). */
  | { type: "restore" }
  /** Keep the code and token in the address bar and in memory, so a reload or a return can rejoin. */
  | { type: "remember"; code: string; token: string }
  | { type: "forget" };

export interface PhoneStep {
  state: PhoneState;
  effects: PhoneEffect[];
}

export const PHONE_OFF: PhoneState = { kind: "off", notice: null };

/** A first attempt that has been running this long when the page comes back is started over. */
const RESTART_STUCK_AFTER = 3000;
/** After a failed reconnect attempt, wait this long before the next. */
export const RETRY_GAP = 2000;

const stay = (state: PhoneState): PhoneStep => ({ state, effects: [] });

const NOTICE: Record<EndReason, PhoneNotice> = {
  reset: "reset",
  "next-player": "unlinked",
  unlinked: "unlinked",
  idle: "idle",
  timeout: "timeout",
  replaced: "replaced",
};

function off(notice: PhoneNotice | null, ...effects: PhoneEffect[]): PhoneStep {
  return { state: { kind: "off", notice }, effects };
}

function reconnect(code: string, token: string, now: number, hidden: boolean): PhoneStep {
  // A hidden page can't reach anyone: the first attempt waits until it's visible again.
  return {
    state: { kind: "reconnecting", code, token, since: now, nextAt: now + TIMING.attempt, attempt: hidden ? 0 : 1, hidden },
    effects: hidden ? [] : [{ type: "connect", code, token }],
  };
}

export function phoneReducer(state: PhoneState, event: PhoneEvent): PhoneStep {
  switch (event.type) {
    case "begin":
      if (state.kind !== "off") return stay(state);
      return {
        state: { kind: "connecting", code: event.code, token: event.token, resume: event.resume, since: event.now, attempt: 1 },
        effects: [
          { type: "remember", code: event.code, token: event.token },
          { type: "connect", code: event.code, token: event.token },
        ],
      };

    case "welcome":
      if (state.kind === "connecting") {
        return {
          state: { kind: "linked", code: state.code, token: state.token, lastSeen: event.now, hidden: false },
          // Only a phone that lost its own state (reloaded, came back to the game) takes the laptop's copy.
          effects: state.resume && event.resume ? [{ type: "restore" }] : [],
        };
      }
      if (state.kind === "reconnecting") {
        return stay({ kind: "linked", code: state.code, token: state.token, lastSeen: event.now, hidden: state.hidden });
      }
      if (state.kind === "linked") return stay({ ...state, lastSeen: event.now });
      return stay(state);

    case "busy":
      if (state.kind === "connecting") {
        return { state: { kind: "failed", code: state.code, token: state.token, reason: "busy", attempt: state.attempt }, effects: [{ type: "disconnect" }, { type: "forget" }] };
      }
      if (state.kind === "reconnecting" || state.kind === "linked") return off("replaced", { type: "disconnect" }, { type: "forget" });
      return stay(state);

    case "unavailable":
      if (state.kind === "connecting") {
        // A code from a fresh scan that nobody holds has expired. One we had before means the laptop moved on.
        if (state.resume) return off("gone", { type: "disconnect" }, { type: "forget" });
        return {
          state: { kind: "failed", code: state.code, token: state.token, reason: "expired", attempt: state.attempt },
          effects: [{ type: "disconnect" }, { type: "forget" }],
        };
      }
      if (state.kind === "reconnecting" || state.kind === "linked") return off("gone", { type: "disconnect" }, { type: "forget" });
      return stay(state);

    case "failed":
      if (state.kind === "connecting") {
        return {
          state: { kind: "failed", code: state.code, token: state.token, reason: event.unsupported ? "unsupported" : "network", attempt: state.attempt },
          effects: [{ type: "disconnect" }],
        };
      }
      // While reconnecting, try again shortly.
      if (state.kind === "reconnecting") return stay({ ...state, nextAt: Math.min(state.nextAt, event.now + RETRY_GAP) });
      return stay(state);

    case "message":
      if (state.kind === "linked") return stay({ ...state, lastSeen: event.now });
      return stay(state);

    case "end":
      if (state.kind === "linked" || state.kind === "reconnecting" || state.kind === "connecting") {
        return off(NOTICE[event.reason], { type: "disconnect" }, { type: "forget" });
      }
      return stay(state);

    case "closed":
      if (state.kind === "linked") return reconnect(state.code, state.token, event.now, state.hidden);
      if (state.kind === "reconnecting") return stay({ ...state, nextAt: Math.min(state.nextAt, event.now + RETRY_GAP) });
      return stay(state);

    case "hidden":
      if (state.kind === "linked") {
        return { state: { ...state, hidden: true }, effects: [{ type: "send", message: { t: "away", why: "hidden" } }] };
      }
      if (state.kind === "reconnecting") return stay({ ...state, hidden: true });
      return stay(state);

    case "visible":
      if (state.kind === "linked") {
        if (event.open) {
          return { state: { ...state, hidden: false, lastSeen: event.now }, effects: [{ type: "send", message: { t: "back" } }] };
        }
        return reconnect(state.code, state.token, event.now, false);
      }
      if (state.kind === "reconnecting") {
        return {
          state: { ...state, hidden: false, nextAt: event.now + TIMING.attempt, attempt: state.attempt + 1 },
          effects: [{ type: "connect", code: state.code, token: state.token }],
        };
      }
      if (state.kind === "connecting" && event.now - state.since > RESTART_STUCK_AFTER) {
        // Linking stalls while a page is hidden: start this attempt over.
        return {
          state: { ...state, since: event.now, attempt: state.attempt + 1 },
          effects: [{ type: "connect", code: state.code, token: state.token }],
        };
      }
      return stay(state);

    case "tick":
      if (state.kind === "connecting" && event.now - state.since > TIMING.connect) {
        return {
          state: { kind: "failed", code: state.code, token: state.token, reason: "timeout", attempt: state.attempt },
          effects: [{ type: "disconnect" }],
        };
      }
      if (state.kind === "linked" && !state.hidden && event.now - state.lastSeen > TIMING.lost) {
        return reconnect(state.code, state.token, event.now, false);
      }
      if (state.kind === "reconnecting") {
        if (event.now - state.since > TIMING.grace) return off("lost", { type: "disconnect" }, { type: "forget" });
        if (!state.hidden && event.now >= state.nextAt) {
          return {
            state: { ...state, nextAt: event.now + TIMING.attempt, attempt: state.attempt + 1 },
            effects: [{ type: "connect", code: state.code, token: state.token }],
          };
        }
      }
      return stay(state);

    case "retry":
      if (state.kind !== "failed" || state.reason === "expired" || state.reason === "busy" || state.reason === "unsupported") return stay(state);
      return {
        state: { kind: "connecting", code: state.code, token: state.token, resume: false, since: event.now, attempt: state.attempt + 1 },
        effects: [{ type: "connect", code: state.code, token: state.token }],
      };

    case "unlink":
      if (state.kind === "linked" || state.kind === "reconnecting") {
        return off("unlinked", { type: "send", message: { t: "end", reason: "unlinked" } }, { type: "disconnect" }, { type: "forget" });
      }
      if (state.kind === "connecting") return off(null, { type: "disconnect" }, { type: "forget" });
      if (state.kind === "failed") return off(null, { type: "forget" });
      return stay(state);

    case "next-player":
      if (state.kind === "linked" || state.kind === "reconnecting") {
        return off(null, { type: "send", message: { t: "end", reason: "next-player" } }, { type: "disconnect" }, { type: "forget" });
      }
      if (state.kind === "connecting") return off(null, { type: "disconnect" }, { type: "forget" });
      if (state.kind === "failed") return off(null, { type: "forget" });
      return off(null);

    case "leave":
      // The code and token stay in memory: coming back to the game rejoins the same session.
      if (state.kind === "linked") return { state, effects: [{ type: "send", message: { t: "away", why: "left" } }, { type: "disconnect" }] };
      if (state.kind === "connecting" || state.kind === "reconnecting") return { state, effects: [{ type: "disconnect" }] };
      return stay(state);

    case "dismiss":
      if (state.kind === "off") return stay({ kind: "off", notice: null });
      if (state.kind === "failed") return off(null, { type: "forget" });
      return stay(state);
  }
}

/** The phone is linked or on its way back: readings should keep flowing to the laptop. */
export function phoneHasSession(state: PhoneState): boolean {
  return state.kind === "linked" || state.kind === "reconnecting" || state.kind === "connecting";
}
