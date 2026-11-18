import type { FoundHand, Pt } from "./hands";

/**
 * Picks the visitor's own two hands out of everything the hand model found.
 *
 * At a busy booth the camera also sees the crowd: people walking past,
 * friends waving, a poster with a hand on it. The model is asked for more
 * hands than the game needs (see landmarker.ts) so a bystander can never take
 * a place the visitor's hand needs, and this keeps only the hands that belong
 * to the person playing:
 *
 *   1. Size. The visitor stands closest, so their hands are the biggest in the
 *      picture. Hands much smaller than the biggest one, or too small to be a
 *      player's at all, are someone further back.
 *   2. Continuity. A hand that is already being played with keeps its place,
 *      so a bystander passing behind never steals it; only a clearly nearer
 *      hand can take over a place.
 *   3. Confirmation. A new hand must be found in two frames in a row, near the
 *      same spot, before it counts: a one-frame false find in a cluttered
 *      background (a pattern on a shirt, a face) never plays a note.
 *
 * Pure apart from the one frame of memory, so it runs and tests without a camera.
 */

/** The smallest hand that can be a player's, in frame heights (wrist to middle knuckle; about 2.5 m from a laptop camera). */
export const MIN_PLAYER_SIZE = 0.04;
/** Hands smaller than this share of the biggest hand in view belong to someone further back. */
export const MIN_SIZE_SHARE = 0.5;
/** A found hand this close to a hand being played with (palm to palm, frame heights) is that same hand. */
export const KEEP_RADIUS = 0.2;
/** A hand already in play beats a new one unless the new one looks this many times bigger (nearer the camera). */
export const KEEP_BONUS = 1.5;
/** A new hand must be found again within this distance in the next frame to count. */
export const CONFIRM_RADIUS = 0.15;
/** At most this many hands are played with. */
export const PLAYER_HANDS = 2;

const PALM = [0, 5, 9, 13, 17];

function palmOf(pts: Pt[]): Pt {
  let x = 0;
  let y = 0;
  for (const i of PALM) {
    x += pts[i].x;
    y += pts[i].y;
  }
  return { x: x / PALM.length, y: y / PALM.length };
}

const dist = (a: Pt, b: Pt, aspect: number) => Math.hypot((a.x - b.x) * aspect, a.y - b.y);

/**
 * How big a hand looks, in frame heights. The larger of wrist to middle
 * knuckle and the knuckle width (scaled to match), so a hand pointing at the
 * camera, whose length shrinks, still reads its true size.
 */
export function handScale(pts: Pt[], aspect: number): number {
  return Math.max(dist(pts[0], pts[9], aspect), dist(pts[5], pts[17], aspect) * 1.35);
}

interface Candidate {
  hand: FoundHand;
  palm: Pt;
  size: number;
  kept: boolean;
}

export class PlayerHands {
  /** Palms of new hands found in the last frame, waiting for a second sighting. */
  private pending: Pt[] = [];

  /**
   * @param found every hand the model found this frame (mirrored, 0 to 1)
   * @param aspect camera width / height
   * @param tracked palms of the hands being played with right now
   * @returns the visitor's hands, at most two
   */
  pick(found: FoundHand[], aspect: number, tracked: Pt[]): FoundHand[] {
    if (!found.length) {
      this.pending = [];
      return [];
    }
    const all = found.filter((f) => f.pts.length >= 21).map((hand) => ({ hand, palm: palmOf(hand.pts), size: handScale(hand.pts, aspect) }));
    const biggest = all.reduce((m, c) => Math.max(m, c.size), 0);
    const sized = all.filter((c) => c.size >= MIN_PLAYER_SIZE && c.size >= biggest * MIN_SIZE_SHARE);

    // The model can find one hand twice (overlapping boxes): keep the bigger of two hands whose palms nearly meet.
    sized.sort((a, b) => b.size - a.size);
    const unique: typeof sized = [];
    for (const c of sized) if (!unique.some((u) => dist(u.palm, c.palm, aspect) < u.size * 0.5)) unique.push(c);

    const candidates: Candidate[] = unique.map((c) => ({ ...c, kept: tracked.some((p) => dist(p, c.palm, aspect) < KEEP_RADIUS) }));
    const confirmed = candidates.filter((c) => c.kept || this.pending.some((p) => dist(p, c.palm, aspect) < CONFIRM_RADIUS));
    this.pending = candidates.filter((c) => !c.kept).map((c) => c.palm);

    const rank = (c: Candidate) => c.size * (c.kept ? KEEP_BONUS : 1);
    confirmed.sort((a, b) => rank(b) - rank(a));
    return confirmed.slice(0, PLAYER_HANDS).map((c) => c.hand);
  }

  reset() {
    this.pending = [];
  }
}
