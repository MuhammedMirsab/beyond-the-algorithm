"use client";

import type { DataConnection, Peer, PeerError } from "peerjs";
import type { HostEffect, HostEvent } from "./host-machine";
import type { PhoneEffect, PhoneEvent } from "./phone-machine";
import { newCode, parseMessage, PROTOCOL_VERSION, type Message } from "./protocol";

/**
 * PeerJS glue for the two state machines. Each class turns WebRTC and
 * matchmaking events into machine events and carries out the machines'
 * effects; none of the rules live here.
 *
 * The browsers talk over a WebRTC data channel, which is encrypted and goes
 * straight from phone to laptop. The PeerJS server only introduces them.
 */

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

/** A moment for a goodbye to go out before the line closes. */
const GOODBYE_MS = 200;

function trySend(conn: DataConnection | null | undefined, message: Message) {
  if (!conn?.open) return;
  try {
    void conn.send(message);
  } catch {
    // Closing already.
  }
}

function destroyLater(peer: Peer | null) {
  if (!peer) return;
  window.setTimeout(() => {
    try {
      peer.destroy();
    } catch {
      // Already gone.
    }
  }, GOODBYE_MS);
}

/* ── The booth laptop ─────────────────────────────────────────────── */

export interface HostCallbacks {
  dispatch: (event: HostEvent) => void;
  /** Readings from the linked phone. Only called for the line the machine says is linked. */
  onState: (values: Record<string, unknown>) => void;
  /** Which line the machine has linked right now. */
  activeConn: () => string | null;
  /** The phone's last known screen, for a phone that comes back. */
  lastNav: () => unknown;
  /** Clear the phone's readings and start the game over. */
  forget: () => void;
}

export class HostTransport {
  private peer: Peer | null = null;
  private generation = 0;
  private conns = new Map<string, DataConnection>();
  private timers = new Set<number>();
  private disposed = false;

  constructor(private readonly cb: HostCallbacks) {}

  start() {
    this.newPeer();
  }

  /** Leaving the page: the phone hears that the booth screen started over. */
  dispose() {
    this.disposed = true;
    this.generation += 1;
    for (const conn of this.conns.values()) {
      trySend(conn, { t: "end", reason: "reset" });
    }
    for (const id of this.timers) window.clearTimeout(id);
    this.timers.clear();
    const peer = this.peer;
    this.peer = null;
    this.conns.clear();
    destroyLater(peer);
  }

  /** Sends to the linked line (heartbeat). */
  ping(conn: string) {
    trySend(this.conns.get(conn), { t: "ping" });
  }

  execute(effect: HostEffect) {
    switch (effect.type) {
      case "send":
        trySend(this.conns.get(effect.conn), effect.message);
        break;
      case "welcome":
        trySend(this.conns.get(effect.conn), { t: "welcome", resume: effect.resume, nav: effect.resume ? (this.cb.lastNav() ?? null) : null });
        break;
      case "busy": {
        const conn = this.conns.get(effect.conn);
        trySend(conn, { t: "busy" });
        this.later(() => conn?.close(), GOODBYE_MS);
        break;
      }
      case "close": {
        const conn = this.conns.get(effect.conn);
        this.conns.delete(effect.conn);
        // Let anything queued just before (an `end`) go out first.
        this.later(() => conn?.close(), GOODBYE_MS);
        break;
      }
      case "new-code":
        this.newPeer();
        break;
      case "retry-later":
        this.later(() => this.cb.dispatch({ type: "retry" }), effect.ms);
        break;
      case "forget":
        this.cb.forget();
        break;
    }
  }

  private later(fn: () => void, ms: number) {
    const id = window.setTimeout(() => {
      this.timers.delete(id);
      if (!this.disposed) fn();
    }, ms);
    this.timers.add(id);
  }

  private newPeer() {
    this.generation += 1;
    const generation = this.generation;
    const old = this.peer;
    this.peer = null;
    for (const conn of this.conns.values()) this.later(() => conn.close(), GOODBYE_MS);
    this.conns.clear();
    destroyLater(old);

    void import("peerjs")
      .then(({ Peer: PeerCtor }) => {
        if (this.disposed || generation !== this.generation) return;
        const code = newCode();
        const peer = new PeerCtor(code, { config: { iceServers: iceServers() }, debug: 0 });
        this.peer = peer;
        const current = () => !this.disposed && generation === this.generation;
        peer.on("open", () => {
          if (current()) this.cb.dispatch({ type: "server-open", code });
        });
        peer.on("connection", (conn) => {
          if (current()) this.accept(conn, current);
          else conn.close();
        });
        peer.on("disconnected", () => {
          // Lost the matchmaking server; a linked phone keeps its direct line. Get back on it for the next one.
          if (!current() || peer.destroyed) return;
          this.later(() => {
            if (!current() || peer.destroyed || !peer.disconnected) return;
            try {
              peer.reconnect();
            } catch {
              // It will report an error, which the machine handles.
            }
          }, 1000);
        });
        peer.on("error", (error: PeerError<string>) => {
          if (!current()) return;
          // A phone that went away mid-handshake is not a server problem.
          if (error.type === "peer-unavailable" || error.type === "webrtc" || error.type === "disconnected") return;
          this.cb.dispatch({ type: "server-failed", idTaken: error.type === "unavailable-id" });
        });
      })
      .catch(() => {
        if (!this.disposed && generation === this.generation) this.cb.dispatch({ type: "server-failed", idTaken: false });
      });
  }

  private accept(conn: DataConnection, current: () => boolean) {
    const id = conn.connectionId;
    this.conns.set(id, conn);
    let greeted = false;
    // A line that never says hello is dropped.
    this.later(() => {
      if (!greeted && this.conns.get(id) === conn) {
        this.conns.delete(id);
        conn.close();
      }
    }, 5000);

    conn.on("data", (data) => {
      if (!current()) return;
      const message = parseMessage(data);
      if (!message) return;
      const now = Date.now();
      switch (message.t) {
        case "hello":
          greeted = true;
          this.cb.dispatch({ type: "hello", conn: id, token: message.token, now });
          break;
        case "state":
          if (this.cb.activeConn() === id) this.cb.onState(message.v);
          this.cb.dispatch({ type: "state", conn: id, now });
          break;
        case "away":
          this.cb.dispatch({ type: "away", conn: id, why: message.why, now });
          break;
        case "back":
          this.cb.dispatch({ type: "back", conn: id, now });
          break;
        case "end":
          this.cb.dispatch({ type: "phone-ended", conn: id });
          break;
        default:
          this.cb.dispatch({ type: "ping", conn: id, now });
      }
    });
    const closed = () => {
      if (this.conns.get(id) === conn) this.conns.delete(id);
      if (current()) this.cb.dispatch({ type: "closed", conn: id, now: Date.now() });
    };
    conn.on("close", closed);
    conn.on("error", closed);
  }
}

/* ── The visitor's phone ──────────────────────────────────────────── */

export interface PhoneCallbacks {
  dispatch: (event: PhoneEvent) => void;
  /** The laptop accepted: send it everything it hasn't got. */
  onWelcome: (nav: unknown) => void;
}

export class PhoneTransport {
  private peer: Peer | null = null;
  private conn: DataConnection | null = null;
  private generation = 0;
  private disposed = false;

  constructor(private readonly cb: PhoneCallbacks) {}

  /** The line to the laptop is open right now. */
  get open(): boolean {
    return this.conn?.open === true;
  }

  send(message: Message) {
    trySend(this.conn, message);
  }

  dispose() {
    this.disposed = true;
    this.drop();
  }

  execute(effect: PhoneEffect) {
    switch (effect.type) {
      case "connect":
        this.connect(effect.code, effect.token);
        break;
      case "send":
        this.send(effect.message);
        break;
      case "disconnect":
        this.drop();
        break;
      // restore, remember and forget are about the page, not the line: the provider handles them.
      default:
        break;
    }
  }

  private drop() {
    this.generation += 1;
    const peer = this.peer;
    this.peer = null;
    this.conn = null;
    destroyLater(peer);
  }

  private connect(code: string, token: string) {
    this.drop();
    const generation = this.generation;
    const current = () => !this.disposed && generation === this.generation;
    const fail = (unsupported = false) => {
      if (current()) this.cb.dispatch({ type: "failed", now: Date.now(), unsupported });
    };

    void import("peerjs")
      .then(({ Peer: PeerCtor }) => {
        if (!current()) return;
        const peer = new PeerCtor({ config: { iceServers: iceServers() }, debug: 0 });
        this.peer = peer;
        peer.on("open", () => {
          if (!current()) return;
          const conn = peer.connect(code, { reliable: true, serialization: "json" });
          if (!conn) {
            fail();
            return;
          }
          let opened = false;
          conn.on("open", () => {
            if (!current()) return;
            opened = true;
            this.conn = conn;
            trySend(conn, { t: "hello", token, v: PROTOCOL_VERSION });
          });
          conn.on("data", (data) => {
            if (!current()) return;
            const message = parseMessage(data);
            if (!message) return;
            const now = Date.now();
            if (message.t === "welcome") {
              this.cb.onWelcome(message.nav);
              this.cb.dispatch({ type: "welcome", resume: message.resume, now });
            } else if (message.t === "busy") this.cb.dispatch({ type: "busy" });
            else if (message.t === "end") this.cb.dispatch({ type: "end", reason: message.reason });
            else this.cb.dispatch({ type: "message", now });
          });
          const closed = () => {
            if (!current()) return;
            this.conn = null;
            if (opened) this.cb.dispatch({ type: "closed", now: Date.now() });
            else fail();
          };
          conn.on("close", closed);
          conn.on("error", closed);
        });
        peer.on("error", (error: PeerError<string>) => {
          if (!current()) return;
          if (error.type === "peer-unavailable") this.cb.dispatch({ type: "unavailable" });
          else fail(error.type === "browser-incompatible");
        });
      })
      .catch(() => fail());
  }
}
