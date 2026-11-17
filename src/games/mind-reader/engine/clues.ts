import { formatNumber } from "./ranges";

/**
 * A yes or no question about a number. Clue cards, typed questions and the
 * machine's own questions all use this one shape, so a question's wording is
 * built from the question alone and never from the secret number. The answer
 * comes from `evaluateClue` only once the question is actually asked.
 */
export type Clue =
  | { kind: "more-than"; value: number }
  | { kind: "less-than"; value: number }
  | { kind: "between"; low: number; high: number }
  | { kind: "even" }
  | { kind: "odd" }
  | { kind: "multiple-of"; divisor: number }
  | { kind: "ends-in"; digit: number }
  | { kind: "prime" }
  | { kind: "square" }
  | { kind: "cube" }
  | { kind: "equals"; value: number }
  | { kind: "digits"; count: 1 | 2 | 3 };

const DIGIT_WORDS = { 1: "one digit", 2: "two digits", 3: "three digits" } as const;

/** How the question reads to a visitor: "Is it more than 50?" */
export function clueText(clue: Clue): string {
  switch (clue.kind) {
    case "more-than":
      return `Is it more than ${formatNumber(clue.value)}?`;
    case "less-than":
      return `Is it less than ${formatNumber(clue.value)}?`;
    case "between":
      return `Is it between ${formatNumber(clue.low)} and ${formatNumber(clue.high)}?`;
    case "even":
      return "Is it even?";
    case "odd":
      return "Is it odd?";
    case "multiple-of":
      return `Is it a multiple of ${formatNumber(clue.divisor)}?`;
    case "ends-in":
      return `Does it end in ${clue.digit}?`;
    case "prime":
      return "Is it a prime number?";
    case "square":
      return "Is it a square number?";
    case "cube":
      return "Is it a cube number?";
    case "equals":
      return `Is it ${formatNumber(clue.value)}?`;
    case "digits":
      return `Does it have ${DIGIT_WORDS[clue.count]}?`;
  }
}

/** A stable identity, so the same question asked twice is recognised. */
export function clueKey(clue: Clue): string {
  switch (clue.kind) {
    case "more-than":
    case "less-than":
    case "equals":
      return `${clue.kind}:${clue.value}`;
    case "between":
      return `between:${clue.low}:${clue.high}`;
    case "multiple-of":
      return `multiple-of:${clue.divisor}`;
    case "ends-in":
      return `ends-in:${clue.digit}`;
    case "digits":
      return `digits:${clue.count}`;
    default:
      return clue.kind;
  }
}

export function isPrime(n: number): boolean {
  if (n <= 1) return false;
  for (let i = 2; i * i <= n; i++) {
    if (n % i === 0) return false;
  }
  return true;
}

export function isSquare(n: number): boolean {
  const root = Math.round(Math.sqrt(n));
  return root * root === n;
}

export function isCube(n: number): boolean {
  const root = Math.round(Math.cbrt(n));
  return root * root * root === n;
}

/** The true answer for `n`. True means "yes". */
export function evaluateClue(clue: Clue, n: number): boolean {
  switch (clue.kind) {
    case "more-than":
      return n > clue.value;
    case "less-than":
      return n < clue.value;
    case "between":
      return n >= clue.low && n <= clue.high;
    case "even":
      return n % 2 === 0;
    case "odd":
      return n % 2 !== 0;
    case "multiple-of":
      return n % clue.divisor === 0;
    case "ends-in":
      return n % 10 === clue.digit;
    case "prime":
      return isPrime(n);
    case "square":
      return isSquare(n);
    case "cube":
      return isCube(n);
    case "equals":
      return n === clue.value;
    case "digits":
      return String(n).length === clue.count;
  }
}
