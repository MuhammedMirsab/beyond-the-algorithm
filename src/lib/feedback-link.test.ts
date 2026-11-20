import { describe, expect, test } from "bun:test";
import { GAMES } from "@/content/games";
import { FEEDBACK_CODES, feedbackPathForCode, feedbackQrUrl } from "./feedback-link";

describe("feedback QR short link", () => {
  test("every game has its own code and round-trips to /feedback?game=", () => {
    const codes = GAMES.map((g) => FEEDBACK_CODES[g.slug]);
    expect(new Set(codes).size).toBe(GAMES.length);
    for (const g of GAMES) expect(feedbackPathForCode(FEEDBACK_CODES[g.slug])).toBe(`/feedback?game=${g.slug}`);
  });

  test("unknown codes still reach the form", () => {
    expect(feedbackPathForCode("0")).toBe("/feedback");
    expect(feedbackPathForCode("zz")).toBe("/feedback");
  });

  test("the link is upper case, so the QR uses its compact mode", () => {
    const url = feedbackQrUrl("https://beyond-the-algorithm-xi.vercel.app", "face-control");
    expect(url).toBe("HTTPS://BEYOND-THE-ALGORITHM-XI.VERCEL.APP/F/3");
    expect(/^[0-9A-Z $%*+\-./:]+$/.test(url)).toBe(true);
  });
});
