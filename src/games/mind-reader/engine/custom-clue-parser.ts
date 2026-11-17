/**
 * Reads a typed question ("is it divable by 5?") and turns it into a Clue.
 * Ported from the original src/logic/customClueParser.ts: same keyword rules,
 * same order, same typo list.
 *
 * Changes from the original:
 * - The parser no longer sees the secret. It returns the question; the answer
 *   is worked out separately, so the wording can't leak anything.
 * - Answers are yes or no only. The original's "no" answers added extra facts
 *   ("it ends in 3, not 7", "it is strictly greater"), which gave away more
 *   than the visitor asked.
 * - Only real typos get a note. Synonyms ("bigger", "more than") don't need
 *   one, because the question is shown back in plain words anyway.
 * - Fixed: "1,000" was read as 1; "2 digit" was read as "ends in 2"; "evenly
 *   divisible by 3" was read as "even"; "over" matched inside other words;
 *   a lone "7" was rejected as too short.
 * - Added: cube numbers (the original fixed the spelling of "cube" but never
 *   answered it), three-digit numbers, "20 to 40" and "more 50".
 */

import { clueText, type Clue } from "./clues";

export type ParsedClue =
  | { understood: true; clue: Clue; question: string; typoNote?: string }
  | { understood: false; message: string };

export const CLUE_EXAMPLES = ["Is it even?", "Is it more than 40?", "Is it between 20 and 40?"] as const;

const TRY_THIS = `Try a question like “${CLUE_EXAMPLES[0]}”, “${CLUE_EXAMPLES[1]}” or “${CLUE_EXAMPLES[2]}”`;

interface Replacement {
  pattern: RegExp;
  canonical: string;
  /** How a typo note names the word. */
  meant: string;
  /** Correctly spelled alternatives: replaced silently. Anything else matched is a typo. */
  synonyms: readonly string[];
}

const REPLACEMENTS: readonly Replacement[] = [
  {
    pattern: /\b(divable|divisble|divisibal|divisbal|divisable|devide|devides|divaid|divaide|divsible|dividing|divided|divisior|divisor|divides?)\b/g,
    canonical: "divisible",
    meant: "divisible",
    synonyms: ["divide", "divides", "dividing", "divided", "divisor"],
  },
  {
    pattern: /\b(mutiple|multple|multipal|multipl|multpl|multible|multaple|multiples)\b/g,
    canonical: "multiple",
    meant: "multiple",
    synonyms: ["multiples"],
  },
  {
    pattern: /\b(grater|graeter|gretar|gratr|biger|bigger|biggur|biggr|hiher|higher|higer|abov|above|more then|more than|larger|largr|exceed|greate)\b/g,
    canonical: "greater",
    meant: "greater",
    synonyms: ["bigger", "higher", "above", "more than", "larger", "exceed"],
  },
  {
    pattern: /\b(les|lesser|less then|less than|smarler|smaller|smaler|lowr|lower|undar|under|bellow|below|belw|leser)\b/g,
    canonical: "less",
    meant: "less",
    synonyms: ["lesser", "less than", "smaller", "lower", "under", "below"],
  },
  { pattern: /\b(evn|eveen|eevvn|evenn|is even)\b/g, canonical: "even", meant: "even", synonyms: ["is even"] },
  { pattern: /\b(od|oddd|is odd)\b/g, canonical: "odd", meant: "odd", synonyms: ["is odd"] },
  {
    pattern: /\b(betwen|bitween|betwin|btween|b\/w|inbetween|in between)\b/g,
    canonical: "between",
    meant: "between",
    synonyms: ["b/w", "in between"],
  },
  { pattern: /\b(prme|priem|prim|is prime)\b/g, canonical: "prime", meant: "prime", synonyms: ["is prime"] },
  { pattern: /\b(squar|sqare|sqr)\b/g, canonical: "square", meant: "square", synonyms: [] },
  { pattern: /\b(cub|cubed)\b/g, canonical: "cube", meant: "cube", synonyms: ["cubed"] },
  {
    pattern: /\b(ends? with|ends? in|ending with|ending in|last digit|unit digit|units digit|ones digit)\b/g,
    canonical: "ends_in",
    meant: "ends in",
    synonyms: ["end with", "ends with", "end in", "ends in", "ending with", "ending in", "last digit", "unit digit", "units digit", "ones digit"],
  },
];

function understood(clue: Clue, typoNote: string | undefined): ParsedClue {
  return typoNote ? { understood: true, clue, question: clueText(clue), typoNote } : { understood: true, clue, question: clueText(clue) };
}

export function parseCustomClue(rawInput: string): ParsedClue {
  // "1,000" is one number, not 1 and 000.
  let q = rawInput.trim().toLowerCase().replace(/(\d),(?=\d{3}\b)/g, "$1");

  if (q.length === 0) {
    return { understood: false, message: `Type a question first. ${TRY_THIS}.` };
  }

  const typos: string[] = [];
  for (const item of REPLACEMENTS) {
    for (const match of q.match(item.pattern) ?? []) {
      const note = `“${match}” as “${item.meant}”`;
      if (match !== item.canonical && !item.synonyms.includes(match) && !typos.includes(note)) typos.push(note);
    }
    q = q.replace(item.pattern, item.canonical);
  }
  const typoNote = typos.length > 0 ? `Read ${typos.join(" and ")}.` : undefined;

  const numbers = q.match(/\d+/g)?.map(Number) ?? [];

  // 1. A range: "between 20 and 40", "from 10 to 50", "20 to 40".
  if ((q.includes("between") || q.includes("from") || q.includes("range") || /\bto\b/.test(q)) && numbers.length >= 2) {
    const low = Math.min(numbers[0], numbers[1]);
    const high = Math.max(numbers[0], numbers[1]);
    return understood({ kind: "between", low, high }, typoNote);
  }

  // 2. Greater than, more, above, over, >.
  if ((q.includes("greater") || /\b(more|over)\b/.test(q) || q.includes(">")) && numbers.length >= 1) {
    return understood({ kind: "more-than", value: numbers[0] }, typoNote);
  }

  // 3. Less than, under, below, <.
  if ((q.includes("less") || q.includes("<")) && numbers.length >= 1) {
    return understood({ kind: "less-than", value: numbers[0] }, typoNote);
  }

  // 4. Even or odd. Both words ("even or odd?") reads as "is it even?".
  if (/\beven\b/.test(q)) return understood({ kind: "even" }, typoNote);
  if (/\bodd\b/.test(q)) return understood({ kind: "odd" }, typoNote);

  // 5. Divisible by, multiple of, factor.
  if ((q.includes("divisible") || q.includes("multiple") || q.includes("factor")) && numbers.length >= 1) {
    if (numbers[0] === 0) return { understood: false, message: "Pick a number above 0 to divide by." };
    return understood({ kind: "multiple-of", divisor: numbers[0] }, typoNote);
  }

  // 6. How many digits. Checked before "ends in", which also looks for "digit".
  if (/\b(single|one|1)[ -]?digit/.test(q)) return understood({ kind: "digits", count: 1 }, typoNote);
  if (/\b(double|two|2)[ -]?digit/.test(q)) return understood({ kind: "digits", count: 2 }, typoNote);
  if (/\b(triple|three|3)[ -]?digit/.test(q)) return understood({ kind: "digits", count: 3 }, typoNote);

  // 7. Last digit.
  if ((q.includes("ends_in") || q.includes("end") || q.includes("digit")) && numbers.length >= 1) {
    return understood({ kind: "ends-in", digit: numbers[0] % 10 }, typoNote);
  }

  // 8. Prime, square and cube numbers.
  if (q.includes("prime")) return understood({ kind: "prime" }, typoNote);
  if (q.includes("square")) return understood({ kind: "square" }, typoNote);
  if (q.includes("cube")) return understood({ kind: "cube" }, typoNote);

  // 9. One number asked directly: "is it 42", "equal to 25", "42?".
  if (
    numbers.length === 1 &&
    (q.includes("is it") || q.includes("equal") || q.includes("could it be") || q.startsWith("is") || q.length <= 6)
  ) {
    return understood({ kind: "equals", value: numbers[0] }, typoNote);
  }

  // 10. One number and no keyword: compare with it.
  if (numbers.length === 1) {
    return understood({ kind: "more-than", value: numbers[0] }, typoNote);
  }

  return { understood: false, message: `${TRY_THIS}.` };
}
