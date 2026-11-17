import { describe, expect, test } from "bun:test";
import { createProgressHub } from "./progress";

describe("progress hub", () => {
  test("a listener hears every value", () => {
    const hub = createProgressHub<number>();
    const seen: number[] = [];
    hub.subscribe((v) => seen.push(v));
    hub.emit(1);
    hub.emit(2);
    expect(seen).toEqual([1, 2]);
  });

  test("a caller who joins a load in flight gets the latest value at once, then the rest", () => {
    const hub = createProgressHub<number>();
    const first: number[] = [];
    const late: number[] = [];
    hub.subscribe((v) => first.push(v));
    hub.emit(0.4);
    hub.subscribe((v) => late.push(v));
    expect(late).toEqual([0.4]);
    hub.emit(0.9);
    expect(first).toEqual([0.4, 0.9]);
    expect(late).toEqual([0.4, 0.9]);
  });

  test("unsubscribe stops updates", () => {
    const hub = createProgressHub<number>();
    const seen: number[] = [];
    const off = hub.subscribe((v) => seen.push(v));
    off();
    hub.emit(1);
    expect(seen).toEqual([]);
    expect(hub.size).toBe(0);
  });

  test("reset forgets the latest value, so a finished load replays nothing", () => {
    const hub = createProgressHub<number>();
    hub.emit(1);
    hub.reset();
    const seen: number[] = [];
    hub.subscribe((v) => seen.push(v));
    expect(seen).toEqual([]);
  });

  test("a listener that unsubscribes while being called doesn't break the others", () => {
    const hub = createProgressHub<number>();
    const seen: string[] = [];
    const off = hub.subscribe(() => {
      seen.push("a");
      off();
    });
    hub.subscribe(() => seen.push("b"));
    hub.emit(1);
    hub.emit(2);
    expect(seen).toEqual(["a", "b", "b"]);
  });
});
