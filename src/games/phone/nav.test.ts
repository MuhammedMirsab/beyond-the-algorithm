import { describe, expect, test } from "bun:test";
import { isSensorId, parseNav, parseScreen, readHistoryEntry, type Nav } from "./nav";

describe("screens from another device", () => {
  test("known screens pass, unknown ones don't", () => {
    expect(parseScreen({ name: "intro" })).toEqual({ name: "intro" });
    expect(parseScreen({ name: "experiment", id: "camera" })).toEqual({ name: "experiment", id: "camera" });
    expect(parseScreen({ name: "experiment", id: "x-ray" })).toBeNull();
    expect(parseScreen({ name: "takeaway", score: 4 })).toEqual({ name: "takeaway", score: 4 });
    expect(parseScreen({ name: "takeaway", score: -1 })).toBeNull();
    expect(parseScreen({ name: "takeaway", score: "lots" })).toBeNull();
    expect(parseScreen({ name: "admin" })).toBeNull();
    expect(parseScreen("intro")).toBeNull();
    expect(parseScreen(null)).toBeNull();
  });

  test("sensor ids", () => {
    expect(isSensorId("motion")).toBe(true);
    expect(isSensorId("Motion")).toBe(false);
    expect(isSensorId(7)).toBe(false);
  });
});

describe("where the visitor is", () => {
  test("a full nav comes through as sent", () => {
    const nav: Nav = {
      screen: { name: "experiment", id: "touch" },
      tested: ["motion", "camera"],
      visit: 6,
      insights: { motion: { label: "In your hand", reading: "forward 3°", live: true } },
    };
    expect(parseNav(nav)).toEqual(nav);
  });

  test("bad parts are dropped, not trusted", () => {
    const parsed = parseNav({
      screen: { name: "lab" },
      tested: ["motion", "motion", "teleport", 3],
      visit: -5,
      insights: {
        camera: { label: "x".repeat(200), live: "yes" },
        nonsense: { label: "Hi", live: true },
        light: "bright",
      },
    });
    expect(parsed).toEqual({
      screen: { name: "lab" },
      tested: ["motion"],
      visit: 0,
      insights: { camera: { label: "x".repeat(80), reading: null, live: false } },
    });
  });

  test("no screen, no nav", () => {
    expect(parseNav({ tested: [] })).toBeNull();
    expect(parseNav([])).toBeNull();
  });
});

describe("history entries", () => {
  test("only the game's own entries are read back", () => {
    expect(readHistoryEntry({ phoneGame: { id: "abc", screen: { name: "quiz" } } })).toEqual({ id: "abc", screen: { name: "quiz" } });
    expect(readHistoryEntry({ __NA: true })).toBeNull();
    expect(readHistoryEntry({ phoneGame: { id: 1, screen: { name: "quiz" } } })).toBeNull();
    expect(readHistoryEntry(null)).toBeNull();
  });
});
