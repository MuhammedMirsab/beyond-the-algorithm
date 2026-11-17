/**
 * The result is shown huge on a projector at a school exhibition. The word
 * list has no rude words, but a clearly written one still reads letter by
 * letter, so this short backstop hides it. Checked against names visitors
 * write (Nazia, Shital...) and ordinary words (grape, class...).
 */
import type { Recognition } from "./recognition/recognize";

/** Matched anywhere inside the letters, so spacing and punctuation don't hide them. */
const PARTS = [
  "fuck", "bitch", "cunt", "pussy", "bastard", "asshole", "slut", "whore", "nigg", "faggot", "retard",
  "porn", "sex", "penis", "vagina", "boob", "hitler", "bullshit", "shithead", "dickhead",
  "chutiya", "madarchod", "behenchod", "bhenchod", "bhosd",
];

/** Matched as whole words only, because they also hide inside names and ordinary words. */
const WORDS = new Set([
  "ass", "arse", "tit", "tits", "dick", "dicks", "shit", "shitty", "rape", "raped", "nazi", "nazis",
  "randi", "gandu", "lund", "fag", "fck", "fk", "wtf", "stfu", "kys",
]);

export function isRude(text: string): boolean {
  const lower = text.toLowerCase();
  const letters = lower.replace(/[^a-z]/g, "");
  if (letters && PARTS.some((part) => letters.includes(part))) return true;
  return lower.split(/[^a-z]+/).some((word) => WORDS.has(word));
}

/** Drops rude alternatives, and says whether the reading itself must stay hidden. */
export function forTheScreen(result: Recognition): { result: Recognition; hidden: boolean } {
  if (result.kind === "text" && isRude(result.text)) {
    return { result: { ...result, text: "", alternatives: [] }, hidden: true };
  }
  return { result: { ...result, alternatives: result.alternatives.filter((a) => !isRude(a)) }, hidden: false };
}

/** Compare readings and target words without case, spaces or punctuation. */
export function normaliseWord(text: string): string {
  return text.toUpperCase().replace(/[^A-Z0-9]/g, "");
}
