"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { HOST_START, hostHasSession, hostReducer, type HostEvent, type HostState } from "./host-machine";
import { PHONE_OFF, phoneHasSession, phoneReducer, type PhoneEvent, type PhoneState } from "./phone-machine";
import { linkHash, newToken, parseLinkHash, TIMING, type LinkTarget, type Message } from "./protocol";
import { HostTransport, PhoneTransport } from "./transport";

/**
 * Phone link: a visitor scans the booth laptop's QR code and their phone
 * drives the laptop's screen. Only what each experiment already works out
 * (tilt, taps, loudness, a coarse brightness grid) is sent. Camera pictures,
 * sound and coordinates never leave the phone.
 *
 * Nothing is written to storage on either side. While a session is on, the
 * phone keeps the laptop's code and its own token in the address bar and in
 * memory, so a reload, a discarded background tab or a trip back to the
 * arcade can rejoin; both go as soon as the session ends, and the code is
 * useless by then because the laptop takes a new one after every session.
 */

/** "host" is the booth laptop, "phone" is a touch device or one that arrived by scanning. */
export type LinkRole = "none" | "host" | "phone";

const NAV = "nav";
export const NAV_KEY = NAV;

/** Keys are "nav" or "<visit>/<name>". Anything from an earlier screen is dropped. */
function inScope(key: string, visit: unknown) {
  return key === NAV || key.startsWith(`${String(visit)}/`);
}

function navVisit(value: unknown): unknown {
  return typeof value === "object" && value !== null ? (value as { visit?: unknown }).visit : undefined;
}

/** The latest values from the phone, in memory only. */
export class Values {
  private map = new Map<string, unknown>();
  private listeners = new Set<() => void>();
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  get = (key: string) => this.map.get(key);
  apply(values: Record<string, unknown>) {
    if (NAV in values) {
      const visit = navVisit(values[NAV]);
      for (const key of [...this.map.keys()]) if (!inScope(key, visit)) this.map.delete(key);
    }
    for (const [key, value] of Object.entries(values)) this.map.set(key, value);
    this.emit();
  }
  clear() {
    if (this.map.size === 0) return;
    this.map.clear();
    this.emit();
  }
  private emit() {
    for (const fn of this.listeners) fn();
  }
}

/* ── Which device is this? ────────────────────────────────────────── */

interface Detected {
  role: "host" | "phone";
  target: (LinkTarget & { token: string; resume: boolean }) | null;
}

/** The session this phone is in, kept while the visitor is away from the game. Memory only. */
let remembered: { code: string; token: string } | null = null;
let detection: { key: string; value: Detected } | null = null;

function detect(parsed: LinkTarget | null): Detected {
  if (parsed) return { role: "phone", target: { code: parsed.code, token: parsed.token ?? newToken(), resume: parsed.token != null } };
  if (remembered) return { role: "phone", target: { ...remembered, resume: true } };
  // A mouse or trackpad means the booth laptop. Everything else plays as a phone.
  return { role: window.matchMedia("(pointer: fine)").matches ? "host" : "phone", target: null };
}

/** Read once per session: writing the token into the address bar doesn't count as a new scan. */
function getDetection(): Detected {
  const parsed = parseLinkHash(window.location.hash);
  const key = parsed?.code ?? remembered?.code ?? "";
  if (detection?.key !== key) detection = { key, value: detect(parsed) };
  return detection.value;
}

const subscribeNever = () => () => {};

/** What the laptop's screen shows about the link: a change here is worth a render, a newer `lastSeen` isn't. */
function hostView(state: HostState): string {
  switch (state.kind) {
    case "waiting":
      return `waiting:${state.code}`;
    case "linked":
      return `linked:${state.code}:${state.conn}`;
    case "paused":
      return `paused:${state.code}:${state.why}:${state.since}:${state.conn ?? ""}`;
    default:
      return state.kind;
  }
}

function setAddress(hash: string) {
  const { pathname, search } = window.location;
  // Keep the game's own entry for the back gesture; leave out the router's internals so the
  // Next.js router copies its own state back in and learns the new address.
  const state: unknown = window.history.state;
  const phoneGame = typeof state === "object" && state !== null ? (state as { phoneGame?: unknown }).phoneGame : undefined;
  window.history.replaceState(phoneGame ? { phoneGame } : null, "", pathname + search + hash);
}

function rememberSession(code: string, token: string) {
  remembered = { code, token };
  setAddress(linkHash(code, token));
}

function forgetSession() {
  remembered = null;
  if (parseLinkHash(window.location.hash)) setAddress("");
}

/* ── The API ──────────────────────────────────────────────────────── */

export interface Restore {
  seq: number;
  nav: unknown;
}

export interface LinkApi {
  role: LinkRole;
  host: HostState;
  phone: PhoneState;
  /** Laptop: a phone is linked or on its way back. The screen shows the phone's game, not its own. */
  following: boolean;
  /** A phone is linked right now (either side). */
  linked: boolean;
  /** Phone: this phone drives the booth screen (or is trying to). */
  controller: boolean;
  values: Values;
  publish: (key: string, value: unknown) => void;
  /** Next player: ends any link on both sides and starts this device's game over. */
  nextPlayer: () => void;
  /** Phone: stop driving the booth screen and keep playing here. */
  unlink: () => void;
  /** Phone: try linking again after a failure. */
  retry: () => void;
  /** Phone: close a failure or a note. */
  dismiss: () => void;
  /** Phone: where the laptop last saw this visitor, after a reload or a return to the game. */
  restore: Restore | null;
}

const NOOP_VALUES = new Values();
const LinkContext = createContext<LinkApi>({
  role: "none",
  host: HOST_START,
  phone: PHONE_OFF,
  following: false,
  linked: false,
  controller: false,
  values: NOOP_VALUES,
  publish: () => {},
  nextPlayer: () => {},
  unlink: () => {},
  retry: () => {},
  dismiss: () => {},
  restore: null,
});

export function useLink() {
  return useContext(LinkContext);
}

/** Which screen the values belong to (the phone's visit counter). */
const ScopeContext = createContext("0");
export const LinkScope = ScopeContext.Provider;

export function LinkProvider({ children, onReset }: { children: ReactNode; onReset: () => void }) {
  const detected = useSyncExternalStore(subscribeNever, getDetection, () => null);
  const role: LinkRole = detected?.role ?? "none";
  const target = detected?.target ?? null;
  const values = useMemo(() => new Values(), []);

  const [host, setHost] = useState<HostState>(HOST_START);
  const [phone, setPhone] = useState<PhoneState>(PHONE_OFF);
  const [restore, setRestore] = useState<Restore | null>(null);

  const reset = useRef(onReset);
  useEffect(() => {
    reset.current = onReset;
  });

  const hostDispatch = useRef<((event: HostEvent) => void) | null>(null);
  const phoneDispatch = useRef<((event: PhoneEvent) => void) | null>(null);
  const phoneTransport = useRef<PhoneTransport | null>(null);
  const phoneLinked = useRef(false);

  // Phone side: what to send, and what the laptop already has.
  const latest = useRef(new Map<string, { json: string; value: unknown }>());
  const sent = useRef(new Map<string, string>());
  const flushTimer = useRef(0);

  const flush = useCallback(() => {
    flushTimer.current = 0;
    const transport = phoneTransport.current;
    // Nothing goes out while the page is hidden: the visitor isn't looking, and the booth screen is told so.
    if (!transport?.open || !phoneLinked.current || document.hidden) return;
    const v: Record<string, unknown> = {};
    let any = false;
    for (const [key, entry] of latest.current) {
      if (sent.current.get(key) === entry.json) continue;
      sent.current.set(key, entry.json);
      v[key] = entry.value;
      any = true;
    }
    if (any) transport.send({ t: "state", v } satisfies Message);
  }, []);

  const scheduleFlush = useCallback(() => {
    if (!flushTimer.current) flushTimer.current = window.setTimeout(flush, TIMING.flush);
  }, [flush]);

  const publish = useCallback(
    (key: string, value: unknown) => {
      if (role !== "phone") return;
      const json = JSON.stringify(value) ?? "null";
      if (latest.current.get(key)?.json === json) return;
      latest.current.set(key, { json, value });
      if (key === NAV) {
        const visit = navVisit(value);
        for (const k of [...latest.current.keys()]) {
          if (!inScope(k, visit)) {
            latest.current.delete(k);
            sent.current.delete(k);
          }
        }
      }
      scheduleFlush();
    },
    [role, scheduleFlush],
  );

  // Laptop: hold a code, take one phone, keep it alive, forget it when the session ends.
  useEffect(() => {
    if (role !== "host") return;
    let machine: HostState = HOST_START;
    const activeConn = () => (hostHasSession(machine) ? machine.conn : null);
    const transport = new HostTransport({
      dispatch: (event) => dispatch(event),
      onState: (v) => values.apply(v),
      activeConn,
      lastNav: () => values.get(NAV),
      forget: () => {
        values.clear();
        reset.current();
      },
    });
    function dispatch(event: HostEvent) {
      const step = hostReducer(machine, event);
      const before = machine;
      machine = step.state;
      // Readings arrive 25 times a second and only move `lastSeen`: the screen needs to know about real changes only.
      if (hostView(before) !== hostView(machine)) setHost(machine);
      for (const effect of step.effects) transport.execute(effect);
    }
    hostDispatch.current = dispatch;
    transport.start();
    const tick = window.setInterval(() => dispatch({ type: "tick", now: Date.now() }), 1000);
    const beat = window.setInterval(() => {
      const conn = activeConn();
      if (conn) transport.ping(conn);
    }, TIMING.heartbeat);
    return () => {
      window.clearInterval(tick);
      window.clearInterval(beat);
      hostDispatch.current = null;
      transport.dispose();
      values.clear();
      setHost(HOST_START);
    };
  }, [role, values]);

  // Phone: link to the laptop's code, and keep the link through locks, reloads and drops.
  const code = target?.code ?? null;
  const token = target?.token ?? null;
  const resume = target?.resume ?? false;
  useEffect(() => {
    if (role !== "phone" || !code || !token) return;
    let machine: PhoneState = PHONE_OFF;
    let welcomeNav: unknown = null;
    let seq = 0;
    const latestMap = latest.current;
    const sentMap = sent.current;
    const transport = new PhoneTransport({
      dispatch: (event) => dispatch(event),
      onWelcome: (nav) => {
        welcomeNav = nav;
      },
    });
    phoneTransport.current = transport;

    function dispatch(event: PhoneEvent) {
      const wasLinked = machine.kind === "linked";
      const step = phoneReducer(machine, event);
      machine = step.state;
      phoneLinked.current = machine.kind === "linked";
      setPhone(machine);
      for (const effect of step.effects) {
        if (effect.type === "remember") rememberSession(effect.code, effect.token);
        else if (effect.type === "forget") forgetSession();
        else if (effect.type === "restore") {
          seq += 1;
          setRestore({ seq, nav: welcomeNav });
        } else transport.execute(effect);
      }
      // Newly linked (or back after a drop): the laptop gets everything again.
      if (!wasLinked && machine.kind === "linked") {
        sentMap.clear();
        scheduleFlush();
      }
    }
    phoneDispatch.current = dispatch;

    const start = window.setTimeout(() => dispatch({ type: "begin", code, token, resume, now: Date.now() }), 0);
    const tick = window.setInterval(() => dispatch({ type: "tick", now: Date.now() }), 1000);
    const beat = window.setInterval(() => {
      if (machine.kind === "linked" && !machine.hidden) transport.send({ t: "ping" });
    }, TIMING.heartbeat);
    const onVisibility = () => {
      if (document.hidden) dispatch({ type: "hidden", now: Date.now() });
      else {
        dispatch({ type: "visible", now: Date.now(), open: transport.open });
        // Whatever changed while hidden goes out now.
        scheduleFlush();
      }
    };
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) dispatch({ type: "visible", now: Date.now(), open: transport.open });
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", onPageShow);
    // Pull to refresh would drop the link mid-tilt: the page doesn't scroll past its ends while linked.
    const root = document.documentElement;
    const overscroll = root.style.overscrollBehaviorY;
    root.style.overscrollBehaviorY = "contain";

    return () => {
      window.clearTimeout(start);
      window.clearInterval(tick);
      window.clearInterval(beat);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", onPageShow);
      root.style.overscrollBehaviorY = overscroll;
      // Leaving the game steps away without ending: coming back rejoins.
      dispatch({ type: "leave" });
      phoneDispatch.current = null;
      phoneTransport.current = null;
      phoneLinked.current = false;
      transport.dispose();
      window.clearTimeout(flushTimer.current);
      flushTimer.current = 0;
      sentMap.clear();
      latestMap.clear();
    };
  }, [role, code, token, resume, scheduleFlush]);

  // Read the address afresh next time the game opens.
  useEffect(
    () => () => {
      detection = null;
    },
    [],
  );

  const nextPlayer = useCallback(() => {
    if (role === "host") {
      // The machine forgets the visitor and resets the game through its effects.
      if (hostDispatch.current) hostDispatch.current({ type: "reset" });
      else reset.current();
      return;
    }
    if (phoneDispatch.current) phoneDispatch.current({ type: "next-player" });
    else setPhone(PHONE_OFF);
    setRestore(null);
    reset.current();
  }, [role]);

  const phoneEvent = useCallback((event: PhoneEvent) => {
    if (phoneDispatch.current) phoneDispatch.current(event);
    else setPhone((state) => phoneReducer(state, event).state);
  }, []);

  const unlink = useCallback(() => phoneEvent({ type: "unlink" }), [phoneEvent]);
  const retry = useCallback(() => phoneEvent({ type: "retry", now: Date.now() }), [phoneEvent]);
  const dismiss = useCallback(() => phoneEvent({ type: "dismiss" }), [phoneEvent]);

  const api = useMemo<LinkApi>(() => {
    const following = role === "host" && hostHasSession(host);
    return {
      role,
      host,
      phone,
      following,
      linked: role === "host" ? host.kind === "linked" : role === "phone" && phone.kind === "linked",
      controller: role === "phone" && phoneHasSession(phone),
      values,
      publish,
      nextPlayer,
      unlink,
      retry,
      dismiss,
      restore,
    };
  }, [role, host, phone, values, publish, nextPlayer, unlink, retry, dismiss, restore]);

  return <LinkContext.Provider value={api}>{children}</LinkContext.Provider>;
}

/** The laptop shows the linked phone's value; the phone sends its own. */
export function useShared<T>(name: string, local: T): T {
  const link = useLink();
  const scope = useContext(ScopeContext);
  const key = `${scope}/${name}`;
  const remote = useSyncExternalStore(
    link.values.subscribe,
    () => link.values.get(key),
    () => undefined,
  );
  const { role, publish } = link;
  useEffect(() => {
    if (role === "phone") publish(key, local);
  });
  return link.following && remote !== undefined ? (remote as T) : local;
}

/** Laptop: a value the linked phone sent outside any screen (its nav). */
export function useRemoteValue<T>(key: string): T | undefined {
  const link = useLink();
  const value = useSyncExternalStore(
    link.values.subscribe,
    () => link.values.get(key),
    () => undefined,
  );
  return link.following ? (value as T | undefined) : undefined;
}
