import type { GameSlug } from "@/content/games";

/**
 * The feedback QR on each result screen encodes a short, upper-case link
 * (HTTPS://HOST/F/3) instead of /feedback?game=face-control. Upper case
 * letters, digits and / : . - fit QR's compact alphanumeric mode, so the code
 * drops from 37x37 to 25x25 squares at the same size on screen: each square is
 * about half as big again, which phones need in the dark booth, from a big
 * monitor or the projector. src/app/F/[code]/route.ts sends it on.
 *
 * Codes are fixed: change none of them while the exhibition is on.
 */
export const FEEDBACK_CODES: Record<GameSlug, string> = {
  "mind-reader": "1",
  "rock-paper-scissors": "2",
  "face-control": "3",
  airwrite: "4",
  viewfinder: "5",
  "train-the-machine": "6",
  "how-ai-learns": "7",
  "real-or-ai": "8",
  phone: "9",
};

/** Where /F/<code> leads: the form, with the game ticked when the code is known. */
export function feedbackPathForCode(code: string): string {
  const entry = Object.entries(FEEDBACK_CODES).find(([, c]) => c === code);
  return entry ? `/feedback?game=${entry[0]}` : "/feedback";
}

/** The QR's link: all upper case (host names ignore case; the /F route is upper case). */
export function feedbackQrUrl(origin: string, slug: GameSlug | null): string {
  return `${origin}/F/${slug ? FEEDBACK_CODES[slug] : "0"}`.toUpperCase();
}
