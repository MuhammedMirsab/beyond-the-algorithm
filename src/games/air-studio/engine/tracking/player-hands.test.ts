import { describe, expect, it } from "bun:test";
import type { FoundHand, HandLabel, Pt } from "./hands";
import { handScale, MIN_PLAYER_SIZE, PlayerHands } from "./player-hands";

const ASPECT = 4 / 3;

/** An open hand, palm centred on (x, y), `size` frame heights from wrist to middle knuckle. */
function hand(x: number, y: number, size: number, label: HandLabel = "Right", score = 0.9): FoundHand {
  const pts: Pt[] = [];
  const sx = size / ASPECT;
  const wrist = { x, y: y + size * 0.55 };
  for (let i = 0; i < 21; i++) {
    const finger = Math.max(0, Math.floor((i - 1) / 4));
    const joint = i === 0 ? 0 : ((i - 1) % 4) + 1;
    const spread = (finger - 2) * 0.32;
    pts.push(i === 0 ? wrist : { x: wrist.x + spread * sx * (0.6 + joint * 0.15), y: wrist.y - size * (0.2 + joint * 0.3) });
  }
  return { label, pts, score };
}

/** Two frames of the same picture, so new hands are confirmed. */
function settle(p: PlayerHands, found: FoundHand[], tracked: Pt[] = []) {
  p.pick(found, ASPECT, tracked);
  return p.pick(found, ASPECT, tracked);
}

const palm = (f: FoundHand): Pt => ({
  x: [0, 5, 9, 13, 17].reduce((a, i) => a + f.pts[i].x, 0) / 5,
  y: [0, 5, 9, 13, 17].reduce((a, i) => a + f.pts[i].y, 0) / 5,
});

describe("player hands", () => {
  it("reads a hand's size the same whichever way it points", () => {
    const h = hand(0.5, 0.5, 0.12);
    expect(handScale(h.pts, ASPECT)).toBeGreaterThan(0.11);
    expect(handScale(h.pts, ASPECT)).toBeLessThan(0.2);
  });

  it("keeps the visitor's two hands and drops the small hands of the crowd behind", () => {
    const left = hand(0.3, 0.55, 0.12, "Left");
    const right = hand(0.7, 0.55, 0.12, "Right");
    const crowd = [hand(0.1, 0.2, 0.035), hand(0.85, 0.25, 0.045)];
    const picked = settle(new PlayerHands(), [crowd[0], left, crowd[1], right]);
    expect(picked).toHaveLength(2);
    expect(picked).toContain(left);
    expect(picked).toContain(right);
  });

  it("never plays with a hand too small to be a player's, even alone", () => {
    expect(settle(new PlayerHands(), [hand(0.5, 0.5, MIN_PLAYER_SIZE * 0.8)])).toHaveLength(0);
  });

  it("needs a new hand in two frames in a row, so a one-frame false find plays nothing", () => {
    const p = new PlayerHands();
    const h = hand(0.5, 0.5, 0.12);
    expect(p.pick([h], ASPECT, [])).toHaveLength(0);
    expect(p.pick([h], ASPECT, [])).toEqual([h]);
    // Somewhere else entirely in the next frame: a flicker, not a hand.
    const q = new PlayerHands();
    q.pick([hand(0.2, 0.3, 0.12)], ASPECT, []);
    expect(q.pick([hand(0.8, 0.7, 0.12)], ASPECT, [])).toHaveLength(0);
  });

  it("keeps a hand already in play at once, with no wait", () => {
    const h = hand(0.5, 0.5, 0.12);
    expect(new PlayerHands().pick([h], ASPECT, [palm(h)])).toEqual([h]);
  });

  it("keeps the hands in play when a similar-sized bystander's hand comes into view", () => {
    const left = hand(0.3, 0.55, 0.11, "Left");
    const right = hand(0.7, 0.55, 0.11, "Right");
    const bystander = hand(0.5, 0.2, 0.12);
    const picked = settle(new PlayerHands(), [bystander, left, right], [palm(left), palm(right)]);
    expect(picked).toContain(left);
    expect(picked).toContain(right);
    expect(picked).not.toContain(bystander);
  });

  it("lets the visitor's second hand, much nearer, take over from a bystander's", () => {
    const right = hand(0.7, 0.55, 0.12, "Right");
    const bystander = hand(0.2, 0.25, 0.065, "Left");
    const left = hand(0.3, 0.6, 0.12, "Left");
    const picked = settle(new PlayerHands(), [right, bystander, left], [palm(right), palm(bystander)]);
    expect(picked).toContain(right);
    expect(picked).toContain(left);
  });

  it("drops a second find of the same hand", () => {
    const h = hand(0.5, 0.5, 0.12);
    const twin = hand(0.505, 0.5, 0.115);
    expect(settle(new PlayerHands(), [h, twin])).toEqual([h]);
  });

  it("forgets waiting hands when nothing is found", () => {
    const p = new PlayerHands();
    const h = hand(0.5, 0.5, 0.12);
    p.pick([h], ASPECT, []);
    p.pick([], ASPECT, []);
    expect(p.pick([h], ASPECT, [])).toHaveLength(0);
  });
});
