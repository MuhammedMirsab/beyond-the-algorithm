import { describe, expect, test } from "bun:test";
import { HOST_START, hostReducer, type HostEffect, type HostEvent, type HostState } from "./host-machine";
import { PHONE_OFF, phoneReducer, RETRY_GAP, type PhoneEffect, type PhoneEvent, type PhoneState } from "./phone-machine";
import { isCode, isToken, linkHash, linkPath, newCode, newToken, parseLinkHash, parseMessage, TIMING } from "./protocol";

/* ── Helpers ──────────────────────────────────────────────────────── */

function host(events: HostEvent[], from: HostState = HOST_START) {
  let state = from;
  let effects: HostEffect[] = [];
  for (const event of events) {
    const step = hostReducer(state, event);
    state = step.state;
    effects = step.effects;
  }
  return { state, effects };
}

function phone(events: PhoneEvent[], from: PhoneState = PHONE_OFF) {
  let state = from;
  let effects: PhoneEffect[] = [];
  for (const event of events) {
    const step = phoneReducer(state, event);
    state = step.state;
    effects = step.effects;
  }
  return { state, effects };
}

const CODE = "edex-phone-0123456789ab";
const A = "aaaaaaaaaaaaaaaa";
const B = "bbbbbbbbbbbbbbbb";

/** A laptop showing its code. */
const waiting = (): HostState => host([{ type: "server-open", code: CODE }]).state;
/** A laptop linked to phone A on connection c1 at t = 1000. */
const linkedHost = (): HostState => host([{ type: "hello", conn: "c1", token: A, now: 1000 }], waiting()).state;

const begin = (resume = false, now = 0): PhoneEvent => ({ type: "begin", code: CODE, token: A, resume, now });
const linkedPhone = (): PhoneState => phone([begin(), { type: "welcome", resume: false, now: 500 }]).state;

const kinds = (effects: { type: string }[]) => effects.map((e) => e.type);

/* ── Protocol ─────────────────────────────────────────────────────── */

describe("protocol", () => {
  test("codes and tokens have the right shape", () => {
    const code = newCode();
    expect(code.startsWith("edex-phone-")).toBe(true);
    expect(isCode(code)).toBe(true);
    expect(isToken(newToken())).toBe(true);
    expect(newCode()).not.toBe(code);
  });

  test("codes are made from the random bytes given", () => {
    expect(newCode(() => new Uint8Array([0, 1, 2, 254, 255, 16]))).toBe("edex-phone-000102feff10");
    expect(newToken(() => new Uint8Array(8).fill(171))).toBe("abababababababab");
  });

  test("reads a fresh scan and a return with a token", () => {
    expect(parseLinkHash(`#link=${CODE}`)).toEqual({ code: CODE, token: null });
    expect(parseLinkHash(linkHash(CODE, A))).toEqual({ code: CODE, token: A });
    expect(parseLinkHash("#other=1&link=edex-phone-abc123")).toEqual({ code: "edex-phone-abc123", token: null });
  });

  test("ignores anything that isn't a link", () => {
    expect(parseLinkHash("")).toBeNull();
    expect(parseLinkHash("#link=ab")).toBeNull();
    expect(parseLinkHash("#link=<script>")).toBeNull();
    expect(parseLinkHash(`#link=${CODE}.NOT-A-TOKEN`)).toBeNull();
  });

  test("the QR path opens the phone game with the code", () => {
    expect(linkPath(CODE)).toBe(`/phone#link=${CODE}`);
  });

  test("messages are checked field by field", () => {
    expect(parseMessage({ t: "hello", token: A, v: 2 })).toEqual({ t: "hello", token: A, v: 2 });
    expect(parseMessage({ t: "hello", token: "x" })).toBeNull();
    expect(parseMessage({ t: "state", v: { nav: 1 } })).toEqual({ t: "state", v: { nav: 1 } });
    expect(parseMessage({ t: "state", v: [1] })).toBeNull();
    expect(parseMessage({ t: "away", why: "left" })).toEqual({ t: "away", why: "left" });
    expect(parseMessage({ t: "away" })).toEqual({ t: "away", why: "hidden" });
    expect(parseMessage({ t: "end", reason: "idle" })).toEqual({ t: "end", reason: "idle" });
    expect(parseMessage({ t: "end", reason: "nonsense" })).toEqual({ t: "end", reason: "reset" });
    expect(parseMessage({ t: "welcome", resume: true, nav: { visit: 3 } })).toEqual({ t: "welcome", resume: true, nav: { visit: 3 } });
    expect(parseMessage({ t: "launch-missiles" })).toBeNull();
    expect(parseMessage("ping")).toBeNull();
    expect(parseMessage(null)).toBeNull();
  });
});

/* ── The booth laptop ─────────────────────────────────────────────── */

describe("laptop: getting a code", () => {
  test("starts by asking for a code, then waits with it", () => {
    expect(HOST_START.kind).toBe("starting");
    expect(waiting()).toEqual({ kind: "waiting", code: CODE });
  });

  test("a taken code asks for a new one straight away", () => {
    const { state, effects } = host([{ type: "server-failed", idTaken: true }]);
    expect(state.kind).toBe("starting");
    expect(kinds(effects)).toEqual(["new-code"]);
  });

  test("no matchmaking server: offline, then retries with a new code", () => {
    const failed = host([{ type: "server-failed", idTaken: false }]);
    expect(failed.state.kind).toBe("offline");
    expect(failed.effects).toEqual([{ type: "retry-later", ms: TIMING.serverRetry }]);
    const retried = host([{ type: "retry" }], failed.state);
    expect(retried.state.kind).toBe("starting");
    expect(kinds(retried.effects)).toEqual(["new-code"]);
  });

  test("losing the matchmaking server never drops a linked phone", () => {
    const { state, effects } = host([{ type: "server-failed", idTaken: false }], linkedHost());
    expect(state.kind).toBe("linked");
    expect(effects).toEqual([]);
  });

  test("nobody can link before there is a code", () => {
    const { state, effects } = host([{ type: "hello", conn: "c9", token: A, now: 0 }]);
    expect(state.kind).toBe("starting");
    expect(effects).toEqual([{ type: "close", conn: "c9" }]);
  });
});

describe("laptop: linking", () => {
  test("the first phone to say hello is welcomed as new", () => {
    const { state, effects } = host([{ type: "hello", conn: "c1", token: A, now: 1000 }], waiting());
    expect(state).toEqual({ kind: "linked", code: CODE, token: A, conn: "c1", lastSeen: 1000, lastActive: 1000 });
    expect(effects).toEqual([{ type: "welcome", conn: "c1", resume: false }]);
  });

  test("a second phone is turned away while the first is linked", () => {
    const { state, effects } = host([{ type: "hello", conn: "c2", token: B, now: 2000 }], linkedHost());
    expect(state.kind === "linked" && state.conn).toBe("c1");
    expect(effects).toEqual([{ type: "busy", conn: "c2" }]);
  });

  test("the same phone on a new line picks up where it was", () => {
    const { state, effects } = host([{ type: "hello", conn: "c2", token: A, now: 3000 }], linkedHost());
    expect(state.kind === "linked" && state.conn).toBe("c2");
    expect(effects).toEqual([
      { type: "close", conn: "c1" },
      { type: "welcome", conn: "c2", resume: true },
    ]);
  });

  test("readings keep it alive and count as activity, pings only keep it alive", () => {
    const afterPing = host([{ type: "ping", conn: "c1", now: 5000 }], linkedHost()).state;
    expect(afterPing).toMatchObject({ lastSeen: 5000, lastActive: 1000 });
    const afterState = host([{ type: "state", conn: "c1", now: 6000 }], afterPing).state;
    expect(afterState).toMatchObject({ lastSeen: 6000, lastActive: 6000 });
  });

  test("messages from a line that isn't the linked one are ignored", () => {
    const before = linkedHost();
    expect(host([{ type: "state", conn: "c7", now: 9000 }], before).state).toEqual(before);
    expect(host([{ type: "closed", conn: "c7", now: 9000 }], before).state).toEqual(before);
    expect(host([{ type: "phone-ended", conn: "c7" }], before).state).toEqual(before);
  });
});

describe("laptop: the phone steps away", () => {
  test("a locked screen pauses, and back resumes", () => {
    const away = host([{ type: "away", conn: "c1", why: "hidden", now: 4000 }], linkedHost()).state;
    expect(away).toMatchObject({ kind: "paused", why: "away", since: 4000, conn: "c1" });
    const back = host([{ type: "back", conn: "c1", now: 9000 }], away).state;
    expect(back).toMatchObject({ kind: "linked", conn: "c1", lastSeen: 9000, lastActive: 9000 });
  });

  test("leaving the game on the phone is told apart from a locked screen", () => {
    const left = host([{ type: "away", conn: "c1", why: "left", now: 4000 }], linkedHost()).state;
    expect(left).toMatchObject({ kind: "paused", why: "left" });
  });

  test("pings or late readings from a locking phone don't count as the visitor being back", () => {
    const away = host([{ type: "away", conn: "c1", why: "hidden", now: 4000 }], linkedHost()).state;
    expect(host([{ type: "ping", conn: "c1", now: 5000 }], away).state.kind).toBe("paused");
    expect(host([{ type: "state", conn: "c1", now: 5000 }], away).state.kind).toBe("paused");
    const left = host([{ type: "away", conn: "c1", why: "left", now: 4000 }], linkedHost()).state;
    expect(host([{ type: "state", conn: "c1", now: 5000 }], left).state.kind).toBe("paused");
  });

  test("readings on a line that had gone quiet bring it back", () => {
    const lost = host([{ type: "tick", now: 1000 + TIMING.lost + 1 }], linkedHost()).state;
    expect(host([{ type: "state", conn: "c1", now: 12_000 }], lost).state).toMatchObject({ kind: "linked", lastActive: 12_000 });
  });

  test("silence pauses as lost, and the line coming back resumes", () => {
    const lost = host([{ type: "tick", now: 1000 + TIMING.lost + 1 }], linkedHost()).state;
    expect(lost).toMatchObject({ kind: "paused", why: "lost", conn: "c1" });
    const resumed = host([{ type: "ping", conn: "c1", now: 12_000 }], lost).state;
    expect(resumed).toMatchObject({ kind: "linked", lastSeen: 12_000, lastActive: 1000 });
  });

  test("a closed line pauses and waits for the same phone", () => {
    const closed = host([{ type: "closed", conn: "c1", now: 4000 }], linkedHost()).state;
    expect(closed).toMatchObject({ kind: "paused", why: "lost", conn: null });
    const { state, effects } = host([{ type: "hello", conn: "c3", token: A, now: 20_000 }], closed);
    expect(state).toMatchObject({ kind: "linked", conn: "c3" });
    expect(effects).toEqual([{ type: "welcome", conn: "c3", resume: true }]);
  });

  test("a new visitor who scans while the phone is away takes over", () => {
    const away = host([{ type: "away", conn: "c1", why: "hidden", now: 4000 }], linkedHost()).state;
    const { state, effects } = host([{ type: "hello", conn: "c4", token: B, now: 6000 }], away);
    expect(state).toEqual({ kind: "linked", code: CODE, token: B, conn: "c4", lastSeen: 6000, lastActive: 6000 });
    expect(effects).toEqual([
      { type: "send", conn: "c1", message: { t: "end", reason: "replaced" } },
      { type: "close", conn: "c1" },
      { type: "forget" },
      { type: "welcome", conn: "c4", resume: false },
    ]);
  });

  test("after the grace period the laptop forgets the visitor and gets a new code", () => {
    const away = host([{ type: "away", conn: "c1", why: "hidden", now: 4000 }], linkedHost()).state;
    expect(host([{ type: "tick", now: 4000 + TIMING.grace }], away).state.kind).toBe("paused");
    const { state, effects } = host([{ type: "tick", now: 4000 + TIMING.grace + 1 }], away);
    expect(state.kind).toBe("starting");
    expect(effects).toEqual([
      { type: "send", conn: "c1", message: { t: "end", reason: "timeout" } },
      { type: "close", conn: "c1" },
      { type: "forget" },
      { type: "new-code" },
    ]);
  });

  test("a lost phone with no line left gets nothing sent when it times out", () => {
    const closed = host([{ type: "closed", conn: "c1", now: 4000 }], linkedHost()).state;
    const { effects } = host([{ type: "tick", now: 4000 + TIMING.grace + 1 }], closed);
    expect(kinds(effects)).toEqual(["forget", "new-code"]);
  });

  test("a phone left untouched on a desk ends the session as idle", () => {
    let state = linkedHost();
    // Pings every few seconds, but no new readings.
    for (let t = 2000; t <= 1000 + TIMING.idle; t += 2000) state = host([{ type: "ping", conn: "c1", now: t }, { type: "tick", now: t }], state).state;
    expect(state.kind).toBe("linked");
    const { state: ended, effects } = host([{ type: "ping", conn: "c1", now: 1000 + TIMING.idle + 1500 }, { type: "tick", now: 1000 + TIMING.idle + 1500 }], state);
    expect(ended.kind).toBe("starting");
    expect(effects[0]).toEqual({ type: "send", conn: "c1", message: { t: "end", reason: "idle" } });
  });
});

describe("laptop: ending", () => {
  test("Next player on the laptop tells the phone, forgets and gets a new code", () => {
    const { state, effects } = host([{ type: "reset" }], linkedHost());
    expect(state.kind).toBe("starting");
    expect(effects).toEqual([
      { type: "send", conn: "c1", message: { t: "end", reason: "reset" } },
      { type: "close", conn: "c1" },
      { type: "forget" },
      { type: "new-code" },
    ]);
  });

  test("Next player with nobody linked keeps the code on screen", () => {
    const { state, effects } = host([{ type: "reset" }], waiting());
    expect(state).toEqual({ kind: "waiting", code: CODE });
    expect(effects).toEqual([{ type: "forget" }]);
  });

  test("Next player or Unlink on the phone ends it here too", () => {
    const { state, effects } = host([{ type: "phone-ended", conn: "c1" }], linkedHost());
    expect(state.kind).toBe("starting");
    expect(effects).toEqual([{ type: "close", conn: "c1" }, { type: "forget" }, { type: "new-code" }]);
  });

  test("a new code goes back to waiting", () => {
    const ended = host([{ type: "reset" }], linkedHost()).state;
    expect(host([{ type: "server-open", code: "edex-phone-ffffffffffff" }], ended).state).toEqual({
      kind: "waiting",
      code: "edex-phone-ffffffffffff",
    });
  });
});

/* ── The visitor's phone ──────────────────────────────────────────── */

describe("phone: linking after a scan", () => {
  test("a scan remembers the code and connects", () => {
    const { state, effects } = phone([begin()]);
    expect(state).toEqual({ kind: "connecting", code: CODE, token: A, resume: false, since: 0, attempt: 1 });
    expect(effects).toEqual([
      { type: "remember", code: CODE, token: A },
      { type: "connect", code: CODE, token: A },
    ]);
  });

  test("the laptop's welcome links it", () => {
    const { state, effects } = phone([begin(), { type: "welcome", resume: false, now: 500 }]);
    expect(state).toEqual({ kind: "linked", code: CODE, token: A, lastSeen: 500, hidden: false });
    expect(effects).toEqual([]);
  });

  test("an expired code says so and forgets it", () => {
    const { state, effects } = phone([begin(), { type: "unavailable" }]);
    expect(state).toMatchObject({ kind: "failed", reason: "expired" });
    expect(effects).toEqual([{ type: "disconnect" }, { type: "forget" }]);
  });

  test("a second phone hears that someone else is linked", () => {
    const { state, effects } = phone([begin(), { type: "busy" }]);
    expect(state).toMatchObject({ kind: "failed", reason: "busy" });
    expect(effects).toEqual([{ type: "disconnect" }, { type: "forget" }]);
  });

  test("no internet fails with a retry, and the retry connects again", () => {
    const failed = phone([begin(), { type: "failed", now: 900 }]);
    expect(failed.state).toMatchObject({ kind: "failed", reason: "network" });
    const retried = phone([{ type: "retry", now: 5000 }], failed.state);
    expect(retried.state).toMatchObject({ kind: "connecting", attempt: 2, since: 5000 });
    expect(retried.effects).toEqual([{ type: "connect", code: CODE, token: A }]);
  });

  test("taking too long times out", () => {
    expect(phone([begin(), { type: "tick", now: TIMING.connect }]).state.kind).toBe("connecting");
    const { state, effects } = phone([begin(), { type: "tick", now: TIMING.connect + 1 }]);
    expect(state).toMatchObject({ kind: "failed", reason: "timeout" });
    expect(effects).toEqual([{ type: "disconnect" }]);
  });

  test("an expired code or a busy screen can't be retried, only played without", () => {
    const expired = phone([begin(), { type: "unavailable" }]).state;
    expect(phone([{ type: "retry", now: 1 }], expired).state).toEqual(expired);
    const played = phone([{ type: "unlink" }], expired);
    expect(played.state).toEqual(PHONE_OFF);
  });

  test("a browser without WebRTC can't link at all", () => {
    expect(phone([begin(), { type: "failed", now: 10, unsupported: true }]).state).toMatchObject({ reason: "unsupported" });
  });

  test("a page hidden while linking starts the attempt over when it's back", () => {
    const { state, effects } = phone([begin(), { type: "visible", now: 6000, open: false }]);
    expect(state).toMatchObject({ kind: "connecting", since: 6000, attempt: 2 });
    expect(effects).toEqual([{ type: "connect", code: CODE, token: A }]);
  });
});

describe("phone: coming back after a reload or a return to the game", () => {
  test("the laptop's copy restores where the visitor was", () => {
    const { state, effects } = phone([begin(true), { type: "welcome", resume: true, now: 400 }]);
    expect(state.kind).toBe("linked");
    expect(effects).toEqual([{ type: "restore" }]);
  });

  test("nothing to restore when the laptop didn't know this phone", () => {
    expect(phone([begin(true), { type: "welcome", resume: false, now: 400 }]).effects).toEqual([]);
  });

  test("a fresh scan never takes the laptop's copy", () => {
    expect(phone([begin(false), { type: "welcome", resume: true, now: 400 }]).effects).toEqual([]);
  });

  test("a laptop that has moved on is a note, not an error", () => {
    const { state } = phone([begin(true), { type: "unavailable" }]);
    expect(state).toEqual({ kind: "off", notice: "gone" });
  });
});

describe("phone: while linked", () => {
  test("a locked screen tells the laptop, and unlocking says it's back", () => {
    const hidden = phone([{ type: "hidden", now: 1000 }], linkedPhone());
    expect(hidden.state).toMatchObject({ kind: "linked", hidden: true });
    expect(hidden.effects).toEqual([{ type: "send", message: { t: "away", why: "hidden" } }]);
    const shown = phone([{ type: "visible", now: 30_000, open: true }], hidden.state);
    expect(shown.state).toMatchObject({ kind: "linked", hidden: false, lastSeen: 30_000 });
    expect(shown.effects).toEqual([{ type: "send", message: { t: "back" } }]);
  });

  test("silence while hidden is not a lost link", () => {
    const hidden = phone([{ type: "hidden", now: 1000 }], linkedPhone()).state;
    expect(phone([{ type: "tick", now: 60_000 }], hidden).state.kind).toBe("linked");
  });

  test("a line that dropped while hidden reconnects on return", () => {
    const hidden = phone([{ type: "hidden", now: 1000 }], linkedPhone()).state;
    const { state, effects } = phone([{ type: "visible", now: 40_000, open: false }], hidden);
    expect(state).toMatchObject({ kind: "reconnecting", since: 40_000, attempt: 1 });
    expect(effects).toEqual([{ type: "connect", code: CODE, token: A }]);
  });

  test("silence while visible reconnects", () => {
    const { state, effects } = phone([{ type: "tick", now: 500 + TIMING.lost + 1 }], linkedPhone());
    expect(state.kind).toBe("reconnecting");
    expect(kinds(effects)).toEqual(["connect"]);
  });

  test("messages keep it alive", () => {
    const state = phone([{ type: "message", now: 7000 }, { type: "tick", now: 7000 + TIMING.lost }], linkedPhone()).state;
    expect(state.kind).toBe("linked");
  });

  test("the laptop ending it leaves the visitor playing, with a note", () => {
    const { state, effects } = phone([{ type: "end", reason: "reset" }], linkedPhone());
    expect(state).toEqual({ kind: "off", notice: "reset" });
    expect(effects).toEqual([{ type: "disconnect" }, { type: "forget" }]);
    expect(phone([{ type: "end", reason: "idle" }], linkedPhone()).state).toEqual({ kind: "off", notice: "idle" });
    expect(phone([{ type: "end", reason: "replaced" }], linkedPhone()).state).toEqual({ kind: "off", notice: "replaced" });
  });

  test("Unlink tells the laptop why", () => {
    const { state, effects } = phone([{ type: "unlink" }], linkedPhone());
    expect(state).toEqual({ kind: "off", notice: "unlinked" });
    expect(effects).toEqual([{ type: "send", message: { t: "end", reason: "unlinked" } }, { type: "disconnect" }, { type: "forget" }]);
  });

  test("Next player on the phone ends it on both", () => {
    const { state, effects } = phone([{ type: "next-player" }], linkedPhone());
    expect(state).toEqual(PHONE_OFF);
    expect(effects[0]).toEqual({ type: "send", message: { t: "end", reason: "next-player" } });
  });

  test("leaving the game steps away without ending, and keeps the code", () => {
    const { effects } = phone([{ type: "leave" }], linkedPhone());
    expect(effects).toEqual([{ type: "send", message: { t: "away", why: "left" } }, { type: "disconnect" }]);
    expect(kinds(effects)).not.toContain("forget");
  });

  test("a note can be dismissed", () => {
    const noted = phone([{ type: "end", reason: "reset" }], linkedPhone()).state;
    expect(phone([{ type: "dismiss" }], noted).state).toEqual(PHONE_OFF);
  });
});

describe("phone: reconnecting", () => {
  const dropped = () => phone([{ type: "closed", now: 10_000 }], linkedPhone()).state;

  test("a dropped line reconnects as the same phone", () => {
    const { state, effects } = phone([{ type: "closed", now: 10_000 }], linkedPhone());
    expect(state).toMatchObject({ kind: "reconnecting", since: 10_000 });
    expect(effects).toEqual([{ type: "connect", code: CODE, token: A }]);
  });

  test("the laptop's welcome links it again, without restoring anything", () => {
    const { state, effects } = phone([{ type: "welcome", resume: true, now: 12_000 }], dropped());
    expect(state).toMatchObject({ kind: "linked", lastSeen: 12_000 });
    expect(effects).toEqual([]);
  });

  test("a failed attempt tries again shortly, a hanging one after a while", () => {
    const failed = phone([{ type: "failed", now: 11_000 }], dropped()).state;
    expect(phone([{ type: "tick", now: 11_000 + RETRY_GAP - 1 }], failed).effects).toEqual([]);
    const retry = phone([{ type: "tick", now: 11_000 + RETRY_GAP }], failed);
    expect(retry.state).toMatchObject({ attempt: 2 });
    expect(kinds(retry.effects)).toEqual(["connect"]);
    const hanging = phone([{ type: "tick", now: 10_000 + TIMING.attempt }], dropped());
    expect(kinds(hanging.effects)).toEqual(["connect"]);
  });

  test("someone else linked in the meantime", () => {
    expect(phone([{ type: "busy" }], dropped()).state).toEqual({ kind: "off", notice: "replaced" });
  });

  test("the laptop moved on", () => {
    expect(phone([{ type: "unavailable" }], dropped()).state).toEqual({ kind: "off", notice: "gone" });
  });

  test("gives up after the grace period", () => {
    const { state, effects } = phone([{ type: "tick", now: 10_000 + TIMING.grace + 1 }], dropped());
    expect(state).toEqual({ kind: "off", notice: "lost" });
    expect(effects).toEqual([{ type: "disconnect" }, { type: "forget" }]);
  });

  test("doesn't try while the page is hidden, then tries at once when it's back", () => {
    const hidden = phone([{ type: "hidden", now: 11_000 }], dropped()).state;
    expect(phone([{ type: "tick", now: 30_000 }], hidden).effects).toEqual([]);
    const back = phone([{ type: "visible", now: 31_000, open: false }], hidden);
    expect(back.state).toMatchObject({ kind: "reconnecting", hidden: false });
    expect(kinds(back.effects)).toEqual(["connect"]);
  });

  test("a line that drops while hidden waits for the page to come back", () => {
    const hidden = phone([{ type: "hidden", now: 1000 }], linkedPhone()).state;
    const { state, effects } = phone([{ type: "closed", now: 2000 }], hidden);
    expect(state).toMatchObject({ kind: "reconnecting", hidden: true, attempt: 0 });
    expect(effects).toEqual([]);
  });

  test("Unlink while reconnecting still says goodbye if it can", () => {
    const { state, effects } = phone([{ type: "unlink" }], dropped());
    expect(state).toEqual({ kind: "off", notice: "unlinked" });
    expect(kinds(effects)).toEqual(["send", "disconnect", "forget"]);
  });
});

/* ── Both sides together ──────────────────────────────────────────── */

describe("laptop and phone together", () => {
  /** Delivers phone effects to the laptop and back, the way the transport does. */
  function wire() {
    let laptop: HostState = waiting();
    let mobile: PhoneState = PHONE_OFF;
    let conn = 0;
    let line: string | null = null;
    const laptopLog: HostEffect[] = [];

    const toLaptop = (event: HostEvent) => {
      const step = hostReducer(laptop, event);
      laptop = step.state;
      laptopLog.push(...step.effects);
      for (const effect of step.effects) {
        if (effect.type === "welcome" && effect.conn === line) toPhone({ type: "welcome", resume: effect.resume, now: 0 });
        if (effect.type === "busy" && effect.conn === line) toPhone({ type: "busy" });
        if (effect.type === "send" && effect.conn === line && effect.message.t === "end") toPhone({ type: "end", reason: effect.message.reason });
      }
    };
    const toPhone = (event: PhoneEvent) => {
      const step = phoneReducer(mobile, event);
      mobile = step.state;
      for (const effect of step.effects) {
        if (effect.type === "connect") {
          conn += 1;
          line = `c${conn}`;
          toLaptop({ type: "hello", conn: line, token: effect.token, now: 0 });
        }
        if (effect.type === "send" && line) {
          const m = effect.message;
          if (m.t === "away") toLaptop({ type: "away", conn: line, why: m.why, now: 0 });
          if (m.t === "back") toLaptop({ type: "back", conn: line, now: 0 });
          if (m.t === "end") toLaptop({ type: "phone-ended", conn: line });
        }
      }
    };
    return {
      toLaptop,
      toPhone,
      get laptop() {
        return laptop;
      },
      get mobile() {
        return mobile;
      },
      laptopLog,
    };
  }

  test("scan, lock the screen, unlock, carry on", () => {
    const w = wire();
    w.toPhone(begin());
    expect(w.laptop.kind).toBe("linked");
    expect(w.mobile.kind).toBe("linked");
    w.toPhone({ type: "hidden", now: 1 });
    expect(w.laptop).toMatchObject({ kind: "paused", why: "away" });
    w.toPhone({ type: "visible", now: 2, open: true });
    expect(w.laptop.kind).toBe("linked");
  });

  test("Next player on the laptop unlinks the phone with a note", () => {
    const w = wire();
    w.toPhone(begin());
    w.toLaptop({ type: "reset" });
    expect(w.laptop.kind).toBe("starting");
    expect(w.mobile).toEqual({ kind: "off", notice: "reset" });
  });

  test("Next player on the phone resets the laptop too", () => {
    const w = wire();
    w.toPhone(begin());
    w.toPhone({ type: "next-player" });
    expect(w.mobile).toEqual(PHONE_OFF);
    expect(w.laptop.kind).toBe("starting");
    expect(kinds(w.laptopLog)).toContain("forget");
  });

  test("a dropped line comes back as the same phone", () => {
    const w = wire();
    w.toPhone(begin());
    w.toLaptop({ type: "closed", conn: "c1", now: 0 });
    w.toPhone({ type: "closed", now: 0 });
    expect(w.mobile.kind).toBe("linked");
    expect(w.laptop).toMatchObject({ kind: "linked", conn: "c2", token: A });
  });
});
