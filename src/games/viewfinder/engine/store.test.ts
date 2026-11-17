import { describe, expect, test } from "bun:test";
import { EngineStore, INITIAL_SNAPSHOT } from "./store";

describe("EngineStore", () => {
  test("only notifies on real changes, with a new snapshot object", () => {
    const store = new EngineStore();
    let calls = 0;
    store.subscribe(() => calls++);
    const before = store.getSnapshot();
    store.update({ lens: 0, locked: false });
    expect(calls).toBe(0);
    expect(store.getSnapshot()).toBe(before);
    store.update({ lens: 3 });
    expect(calls).toBe(1);
    expect(store.getSnapshot()).not.toBe(before);
    expect(store.getSnapshot().lens).toBe(3);
  });

  test("End session resets the hints and counters (the original kept them)", () => {
    const store = new EngineStore();
    store.update({
      lens: 4,
      mirror: false,
      skeleton: true,
      locked: true,
      everLocked: true,
      pinches: 3,
      hands: 2,
      framesTracked: 900,
      handsFound: 1700,
      locks: 2,
      lensesTried: 3,
    });
    store.resetSession();
    const s = store.getSnapshot();
    expect(s.everLocked).toBe(false);
    expect(s.pinches).toBe(0);
    expect(s.locked).toBe(false);
    expect(s.hands).toBe(0);
    expect(s.framesTracked).toBe(0);
    expect(s.handsFound).toBe(0);
    expect(s.locks).toBe(0);
    expect(s.lensesTried).toBe(0);
    // A visitor who plays again keeps their lens and view settings.
    expect(s.lens).toBe(4);
    expect(s.mirror).toBe(false);
    expect(s.skeleton).toBe(true);
  });

  test("Next player goes back to the very first state", () => {
    const store = new EngineStore();
    store.update({ lens: 7, skeleton: true, pinches: 2, delegate: "GPU" });
    store.reset();
    expect(store.getSnapshot()).toEqual(INITIAL_SNAPSHOT);
  });

  test("unsubscribe", () => {
    const store = new EngineStore();
    let calls = 0;
    const off = store.subscribe(() => calls++);
    off();
    store.update({ lens: 1 });
    expect(calls).toBe(0);
  });
});
