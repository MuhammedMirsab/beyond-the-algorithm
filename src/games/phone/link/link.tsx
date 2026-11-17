"use client";

import type { DataConnection, Peer } from "peerjs";
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

/**
 * Phone link: a visitor scans the booth laptop's QR code and their phone
 * drives the laptop's screen. Only what each experiment already works out
 * (tilt, taps, loudness, a coarse brightness grid) is sent. Camera pictures
 * and sound never leave the phone.
 *
 * The two browsers talk over a WebRTC data channel, which is encrypted and
 * goes straight from phone to laptop. The PeerJS server only introduces them
 * to each other. Nothing is written to storage on either side: values live in
 * memory, and ending the session (Next player on either device, the phone
 * going quiet, leaving the page) drops them and gives the laptop a new code.
 */

/** "host" is the booth laptop, "phone" is the visitor's phone that scanned it. */
export type LinkRole = "off" | "host" | "phone";
export type LinkPhase = "idle" | "waiting" | "connecting" | "connected" | "failed" | "ended";

type Message = { t: "state"; v: Record<string, unknown> } | { t: "ping" } | { t: "end" } | { t: "busy" };

const ID_PREFIX = "edex-phone-";
const HEARTBEAT_MS = 2000;
/** No message for this long and the other side is gone (screen locked, tab closed, out of range). */
const LOST_AFTER_MS = 20_000;
const CONNECT_TIMEOUT_MS = 15_000;
/** The laptop tries the matchmaking server again after this long. */
const RETRY_MS = 10_000;
/** Readings go out at most 25 times a second. */
const FLUSH_MS = 40;
const NAV = "nav";

function iceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun.cloudflare.com:3478"] }];
  // Optional relay for networks that block direct connections (set in Vercel).
  const turn = process.env.NEXT_PUBLIC_TURN_URL;
  if (turn) {
    servers.push({
      urls: turn.split(",").map((u) => u.trim()),
      username: process.env.NEXT_PUBLIC_TURN_USERNAME,
      credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL,
    });
  }
  return servers;
}

/** 48 random bits: unguessable for the few minutes a code is on screen. */
function newId() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return ID_PREFIX + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function isMessage(data: unknown): data is Message {
  return typeof data === "object" && data !== null && typeof (data as { t?: unknown }).t === "string";
}

/** Keys are "nav" or "<visit>/<name>". Anything from an earlier screen is dropped. */
function inScope(key: string, visit: unknown) {
  return key === NAV || key.startsWith(`${String(visit)}/`);
}

/** The latest values from the phone, in memory only. */
class Values {
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
      const visit = (values[NAV] as { visit?: unknown } | null)?.visit;
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

interface Detected {
  role: LinkRole;
  target: string | null;
}

const OFF: Detected = { role: "off", target: null };
let detected: Detected | null = null;

/** Read once per visit to the page: a #link= code means this is the visitor's phone. */
function detect(): Detected {
  if (detected) return detected;
  const match = /[#&]link=([A-Za-z0-9_-]{6,64})/.exec(window.location.hash);
  if (match) detected = { role: "phone", target: match[1] };
  else if (window.matchMedia("(pointer: fine)").matches) detected = { role: "host", target: null };
  else detected = OFF;
  return detected;
}
const subscribeNever = () => () => {};

export interface LinkApi {
  role: LinkRole;
  phase: LinkPhase;
  /** A phone is connected right now. */
  linked: boolean;
  /** Laptop only: the code its QR carries, once the matchmaking server has it. */
  hostId: string | null;
  values: Values;
  publish: (key: string, value: unknown) => void;
  /** Ends the session on both sides and forgets everything. `notify` also resets the game. */
  end: (options?: { notify?: boolean }) => void;
  /** Phone: hides the "unlinked" or "couldn't connect" notice. */
  dismiss: () => void;
}

const NOOP_VALUES = new Values();
const LinkContext = createContext<LinkApi>({
  role: "off",
  phase: "idle",
  linked: false,
  hostId: null,
  values: NOOP_VALUES,
  publish: () => {},
  end: () => {},
  dismiss: () => {},
});

export function useLink() {
  return useContext(LinkContext);
}

/** Which screen the values belong to (the phone's visit counter). */
const ScopeContext = createContext("0");
export const LinkScope = ScopeContext.Provider;

export function LinkProvider({ children, onEnded }: { children: ReactNode; onEnded: () => void }) {
  const found = useSyncExternalStore(subscribeNever, detect, () => OFF);
  // The phone's code is used once: after the session it reads as a plain phone.
  const [spent, setSpent] = useState(false);
  const role: LinkRole = found.role === "phone" && spent ? "off" : found.role;
  const target = role === "phone" ? found.target : null;

  const [phase, setPhase] = useState<LinkPhase>("idle");
  const [hostId, setHostId] = useState<string | null>(null);
  const [session, setSession] = useState(0);
  const values = useMemo(() => new Values(), []);

  const conn = useRef<DataConnection | null>(null);
  const finishRef = useRef<(notify: boolean) => void>(() => {});
  const ended = useRef(onEnded);
  useEffect(() => {
    ended.current = onEnded;
  });

  // Phone side: what to send, and what the laptop already has.
  const latest = useRef(new Map<string, { json: string; value: unknown }>());
  const sent = useRef(new Map<string, string>());
  const flushTimer = useRef(0);

  const flush = useCallback(() => {
    flushTimer.current = 0;
    const c = conn.current;
    if (!c?.open) return;
    const v: Record<string, unknown> = {};
    let any = false;
    for (const [key, entry] of latest.current) {
      if (sent.current.get(key) === entry.json) continue;
      sent.current.set(key, entry.json);
      v[key] = entry.value;
      any = true;
    }
    if (any) c.send({ t: "state", v } satisfies Message);
  }, []);

  const publish = useCallback(
    (key: string, value: unknown) => {
      if (role !== "phone") return;
      const json = JSON.stringify(value) ?? "null";
      if (latest.current.get(key)?.json === json) return;
      latest.current.set(key, { json, value });
      if (key === NAV) {
        const visit = (value as { visit?: unknown } | null)?.visit;
        for (const k of [...latest.current.keys()]) {
          if (!inScope(k, visit)) {
            latest.current.delete(k);
            sent.current.delete(k);
          }
        }
      }
      if (!flushTimer.current) flushTimer.current = window.setTimeout(flush, FLUSH_MS);
    },
    [role, flush],
  );

  // The code leaves the address bar straight away, so it isn't in the phone's history or a shared link.
  useEffect(() => {
    if (found.role !== "phone") return;
    const { pathname, search } = window.location;
    window.history.replaceState(window.history.state, "", pathname + search);
  }, [found.role]);

  // Forget the detection when the game unmounts, so a later visit reads the address afresh.
  useEffect(
    () => () => {
      detected = null;
    },
    [],
  );

  // Laptop: open a code, wait for one phone, keep it alive, start over when it ends.
  useEffect(() => {
    if (role !== "host") return;
    let cancelled = false;
    let peer: Peer | null = null;
    let active: DataConnection | null = null;
    let beat = 0;
    let retry = 0;
    let lastSeen = 0;
    let done = false;

    const teardown = () => {
      window.clearInterval(beat);
      window.clearTimeout(retry);
      if (active?.open) {
        try {
          active.send({ t: "end" } satisfies Message);
        } catch {
          // Already closing.
        }
      }
      const p = peer;
      // A moment for the goodbye to go out before the line closes.
      window.setTimeout(() => p?.destroy(), 150);
      conn.current = null;
      values.clear();
    };

    const finish = (notify: boolean) => {
      if (done) return;
      done = true;
      teardown();
      setHostId(null);
      setPhase("idle");
      setSession((s) => s + 1);
      if (notify) ended.current();
    };
    finishRef.current = finish;

    void import("peerjs")
      .then(({ Peer: PeerCtor }) => {
        if (cancelled) return;
        const id = newId();
        const p = new PeerCtor(id, { config: { iceServers: iceServers() }, debug: 0 });
        peer = p;
        p.on("open", () => {
          if (cancelled) return;
          setHostId(id);
          setPhase("waiting");
        });
        p.on("connection", (incoming) => {
          if (active) {
            // One phone per visitor. Anyone else who scans gets turned away.
            incoming.on("open", () => {
              incoming.send({ t: "busy" } satisfies Message);
              window.setTimeout(() => incoming.close(), 200);
            });
            return;
          }
          active = incoming;
          incoming.on("open", () => {
            if (cancelled) return;
            lastSeen = Date.now();
            conn.current = incoming;
            setPhase("connected");
            beat = window.setInterval(() => {
              if (Date.now() - lastSeen > LOST_AFTER_MS) finish(true);
              else if (incoming.open) incoming.send({ t: "ping" } satisfies Message);
            }, HEARTBEAT_MS);
          });
          incoming.on("data", (data) => {
            lastSeen = Date.now();
            if (!isMessage(data)) return;
            if (data.t === "state" && data.v && typeof data.v === "object") values.apply(data.v);
            else if (data.t === "end") finish(true);
          });
          incoming.on("close", () => finish(true));
          incoming.on("error", () => finish(true));
        });
        p.on("disconnected", () => {
          // Lost the matchmaking server; a linked phone keeps its direct line.
          if (!cancelled && !p.destroyed) p.reconnect();
        });
        p.on("error", (error) => {
          if (cancelled || active) return;
          setHostId(null);
          setPhase("failed");
          // A taken code or a network blip: try again with a fresh code.
          retry = window.setTimeout(
            () => {
              if (!cancelled) finish(false);
            },
            error.type === "unavailable-id" ? 0 : RETRY_MS,
          );
        });
      })
      .catch(() => {
        if (!cancelled) setPhase("failed");
      });

    return () => {
      cancelled = true;
      if (!done) {
        done = true;
        teardown();
      }
    };
  }, [role, session, values]);

  // Phone: connect to the laptop's code and send readings until either side ends it.
  useEffect(() => {
    if (role !== "phone" || !target) return;
    let cancelled = false;
    let peer: Peer | null = null;
    let beat = 0;
    let lastSeen = 0;
    let done = false;
    const latestMap = latest.current;
    const sentMap = sent.current;

    const teardown = () => {
      window.clearInterval(beat);
      window.clearTimeout(timeout);
      window.clearTimeout(flushTimer.current);
      flushTimer.current = 0;
      const c = conn.current;
      if (c?.open) {
        try {
          c.send({ t: "end" } satisfies Message);
        } catch {
          // Already closing.
        }
      }
      conn.current = null;
      latestMap.clear();
      sentMap.clear();
      const p = peer;
      window.setTimeout(() => p?.destroy(), 150);
    };

    const finish = (next: LinkPhase, notify: boolean) => {
      if (done) return;
      done = true;
      teardown();
      setSpent(true);
      setPhase(next);
      if (notify) ended.current();
    };
    finishRef.current = (notify) => finish("ended", notify);

    const timeout = window.setTimeout(() => {
      if (!conn.current) finish("failed", false);
    }, CONNECT_TIMEOUT_MS);

    void import("peerjs")
      .then(({ Peer: PeerCtor }) => {
        if (cancelled) return;
        // setPhase here runs after the import resolves, not in the effect body.
        setPhase("connecting");
        const p = new PeerCtor({ config: { iceServers: iceServers() }, debug: 0 });
        peer = p;
        p.on("open", () => {
          if (cancelled) return;
          const c = p.connect(target, { reliable: true, serialization: "json" });
          c.on("open", () => {
            if (cancelled) return;
            window.clearTimeout(timeout);
            lastSeen = Date.now();
            conn.current = c;
            sentMap.clear();
            setPhase("connected");
            flush();
            beat = window.setInterval(() => {
              if (Date.now() - lastSeen > LOST_AFTER_MS) finish("ended", true);
              else if (c.open) c.send({ t: "ping" } satisfies Message);
            }, HEARTBEAT_MS);
          });
          c.on("data", (data) => {
            lastSeen = Date.now();
            if (!isMessage(data)) return;
            if (data.t === "end") finish("ended", true);
            else if (data.t === "busy") finish("failed", false);
          });
          c.on("close", () => finish(conn.current ? "ended" : "failed", conn.current != null));
          c.on("error", () => finish(conn.current ? "ended" : "failed", conn.current != null));
        });
        p.on("error", () => {
          if (cancelled) return;
          finish(conn.current ? "ended" : "failed", conn.current != null);
        });
      })
      .catch(() => {
        if (!cancelled) finish("failed", false);
      });

    return () => {
      cancelled = true;
      if (!done) {
        done = true;
        teardown();
      }
    };
  }, [role, target, flush]);

  const end = useCallback((options?: { notify?: boolean }) => {
    finishRef.current(options?.notify ?? true);
  }, []);

  const dismiss = useCallback(() => setPhase("idle"), []);

  const api = useMemo<LinkApi>(
    () => ({ role, phase, linked: phase === "connected", hostId, values, publish, end, dismiss }),
    [role, phase, hostId, values, publish, end, dismiss],
  );

  return <LinkContext.Provider value={api}>{children}</LinkContext.Provider>;
}

/** The laptop follows the linked phone's value; the phone sends its own. */
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
  return role === "host" && link.linked && remote !== undefined ? (remote as T) : local;
}

/** Laptop: the screen the linked phone is on. */
export function useRemoteValue<T>(key: string): T | undefined {
  const link = useLink();
  const value = useSyncExternalStore(
    link.values.subscribe,
    () => link.values.get(key),
    () => undefined,
  );
  return link.role === "host" && link.linked ? (value as T | undefined) : undefined;
}

export const NAV_KEY = NAV;
