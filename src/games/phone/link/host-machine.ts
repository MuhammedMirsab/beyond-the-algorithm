import { TIMING, type AwayWhy, type EndReason, type Message } from "./protocol";

/**
 * The booth laptop's side of the phone link, as a pure state machine. The
 * transport turns PeerJS events into `HostEvent`s and carries out the
 * returned effects, so every rule here can be tested without a network.
 *
 * Rules worth knowing:
 * - One phone at a time. A second phone gets `busy` while the first is linked.
 * - A phone that steps away (screen locked, other app, left the game, lost
 *   Wi-Fi) keeps its session for `TIMING.grace`. The same phone (same token)
 *   picks up where it was; a different phone that scans now takes over.
 * - Every session that ends forgets the visitor and gets a fresh code, so an
 *   old QR photo or a stale tab can't reach the next person's session.
 */

/** Why the laptop is waiting on the linked phone. */
export type PauseWhy = "away" | "left" | "lost";

export type HostState =
  /** Asking the matchmaking server for a code. */
  | { kind: "starting" }
  /** The matchmaking server can't be reached; a retry is scheduled. */
  | { kind: "offline" }
  /** Showing the QR code, no phone yet. */
  | { kind: "waiting"; code: string }
  | { kind: "linked"; code: string; token: string; conn: string; lastSeen: number; lastActive: number }
  /** The phone stepped away. `conn` is null once its connection closed. */
  | { kind: "paused"; code: string; token: string; conn: string | null; since: number; why: PauseWhy; lastActive: number };

export type HostEvent =
  | { type: "server-open"; code: string }
  | { type: "server-failed"; idTaken: boolean }
  /** The retry timer fired while offline. */
  | { type: "retry" }
  | { type: "hello"; conn: string; token: string; now: number }
  /** New readings: proof of life and of someone using the phone. */
  | { type: "state"; conn: string; now: number }
  | { type: "ping"; conn: string; now: number }
  | { type: "away"; conn: string; why: AwayWhy; now: number }
  | { type: "back"; conn: string; now: number }
  | { type: "closed"; conn: string; now: number }
  /** The phone ended the session (Next player or Unlink on the phone). */
  | { type: "phone-ended"; conn: string }
  | { type: "tick"; now: number }
  /** Next player on the laptop. */
  | { type: "reset" };

export type HostEffect =
  | { type: "send"; conn: string; message: Message }
  /** Accept a phone: the transport adds where the session was (the last nav) to the message. */
  | { type: "welcome"; conn: string; resume: boolean }
  /** Turn a second phone away: send `busy`, then close. */
  | { type: "busy"; conn: string }
  | { type: "close"; conn: string }
  /** Drop the matchmaking connection and ask for a new code. */
  | { type: "new-code" }
  | { type: "retry-later"; ms: number }
  /** Forget the visitor: clear the phone's readings and start the game over. */
  | { type: "forget" };

export interface HostStep {
  state: HostState;
  effects: HostEffect[];
}

export const HOST_START: HostState = { kind: "starting" };

const stay = (state: HostState): HostStep => ({ state, effects: [] });

type Session = Extract<HostState, { kind: "linked" } | { kind: "paused" }>;

/** Ends a linked or paused session: tells the phone why (when it can still hear), forgets, new code. */
function endSession(session: Session, reason: EndReason | null): HostStep {
  const effects: HostEffect[] = [];
  if (session.conn) {
    if (reason) effects.push({ type: "send", conn: session.conn, message: { t: "end", reason } });
    effects.push({ type: "close", conn: session.conn });
  }
  effects.push({ type: "forget" }, { type: "new-code" });
  return { state: HOST_START, effects };
}

function linked(session: Session, conn: string, now: number, active: boolean): HostState {
  return { kind: "linked", code: session.code, token: session.token, conn, lastSeen: now, lastActive: active ? now : session.lastActive };
}

function paused(session: Session, conn: string | null, now: number, why: PauseWhy): HostState {
  return { kind: "paused", code: session.code, token: session.token, conn, since: now, why, lastActive: session.lastActive };
}

export function hostReducer(state: HostState, event: HostEvent): HostStep {
  switch (event.type) {
    case "server-open":
      return state.kind === "starting" || state.kind === "offline" ? stay({ kind: "waiting", code: event.code }) : stay(state);

    case "server-failed":
      // A live session keeps its direct line to the phone; only the next code is affected.
      if (state.kind === "linked" || state.kind === "paused") return stay(state);
      if (event.idTaken) return { state: HOST_START, effects: [{ type: "new-code" }] };
      return { state: { kind: "offline" }, effects: [{ type: "retry-later", ms: TIMING.serverRetry }] };

    case "retry":
      return state.kind === "offline" ? { state: HOST_START, effects: [{ type: "new-code" }] } : stay(state);

    case "hello": {
      const { conn, token, now } = event;
      if (state.kind === "waiting") {
        return {
          state: { kind: "linked", code: state.code, token, conn, lastSeen: now, lastActive: now },
          effects: [{ type: "welcome", conn, resume: false }],
        };
      }
      if (state.kind === "linked" || state.kind === "paused") {
        if (token === state.token) {
          // The same phone on a new line (reconnected, reloaded, came back to the game).
          const effects: HostEffect[] = [];
          if (state.conn && state.conn !== conn) effects.push({ type: "close", conn: state.conn });
          effects.push({ type: "welcome", conn, resume: true });
          return { state: linked(state, conn, now, true), effects };
        }
        if (state.kind === "linked") return { state, effects: [{ type: "busy", conn }] };
        // The linked phone is away and someone new scanned: they take over the booth screen.
        const effects: HostEffect[] = [];
        if (state.conn) {
          effects.push({ type: "send", conn: state.conn, message: { t: "end", reason: "replaced" } });
          effects.push({ type: "close", conn: state.conn });
        }
        effects.push({ type: "forget" }, { type: "welcome", conn, resume: false });
        return { state: { kind: "linked", code: state.code, token, conn, lastSeen: now, lastActive: now }, effects };
      }
      // No code yet (or offline): nobody should be able to reach us. Hang up.
      return { state, effects: [{ type: "close", conn }] };
    }

    case "state":
      if (state.kind === "linked" && state.conn === event.conn) return stay(linked(state, event.conn, event.now, true));
      // A line that came back after going quiet is live again. A phone that said it stepped away
      // only comes back with `back`: a reading or two still in flight from a locking phone isn't the visitor.
      if (state.kind === "paused" && state.conn === event.conn && state.why === "lost") return stay(linked(state, event.conn, event.now, true));
      return stay(state);

    case "ping":
      if (state.kind === "linked" && state.conn === event.conn) return stay({ ...state, lastSeen: event.now });
      // A ping proves the line works again, but not that the visitor is back: only `back` or readings say that.
      if (state.kind === "paused" && state.conn === event.conn && state.why === "lost") return stay(linked(state, event.conn, event.now, false));
      return stay(state);

    case "away": {
      const why: PauseWhy = event.why === "left" ? "left" : "away";
      if (state.kind === "linked" && state.conn === event.conn) return stay(paused(state, state.conn, event.now, why));
      if (state.kind === "paused" && state.conn === event.conn) return stay({ ...state, why });
      return stay(state);
    }

    case "back":
      if (state.kind === "paused" && state.conn === event.conn) return stay(linked(state, event.conn, event.now, true));
      if (state.kind === "linked" && state.conn === event.conn) return stay({ ...state, lastSeen: event.now });
      return stay(state);

    case "closed":
      if (state.kind === "linked" && state.conn === event.conn) return stay(paused(state, null, event.now, "lost"));
      if (state.kind === "paused" && state.conn === event.conn) return stay({ ...state, conn: null });
      return stay(state);

    case "phone-ended":
      if ((state.kind === "linked" || state.kind === "paused") && state.conn === event.conn) return endSession(state, null);
      return stay(state);

    case "tick":
      if (state.kind === "linked") {
        if (event.now - state.lastSeen > TIMING.lost) return stay(paused(state, state.conn, event.now, "lost"));
        if (event.now - state.lastActive > TIMING.idle) return endSession(state, "idle");
        return stay(state);
      }
      if (state.kind === "paused" && event.now - state.since > TIMING.grace) return endSession(state, "timeout");
      return stay(state);

    case "reset":
      if (state.kind === "linked" || state.kind === "paused") return endSession(state, "reset");
      // Nobody linked: start the game over, keep the code on screen.
      return { state, effects: [{ type: "forget" }] };
  }
}

/** The session is live or being held for the phone: the laptop follows the phone, not its own controls. */
export function hostHasSession(state: HostState): state is Session {
  return state.kind === "linked" || state.kind === "paused";
}
