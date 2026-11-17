import { ROUNDS } from "./scoring";
import type { ActiveQuestion, AiPhoto, ComparisonPair, Difficulty, PairPhoto, RealPhoto, Side } from "./types";

/**
 * The ten photo pairs, copied from the original src/data/pairs.ts.
 *
 * Changes from the original, all deliberate:
 * - Clues were checked against the image files and rewritten in plain words.
 *   The Fuji "AI added a twig" clue was dropped: the real photo has the same
 *   twig at its bottom edge. The lighthouse now names its strongest tell: the
 *   rocks and houses are lit from the front while the sun is behind them.
 * - Invented sources and tools ("Open-Air Ethnographic Archive", "Gemini
 *   Diffusion Image-to-Image Synthesis") are gone. Real photos keep only what
 *   the original's images.ts recorded from Wikimedia Commons; unknown fields are null.
 * - Nine AI files carry signed Content Credentials (C2PA) that say "Created by
 *   Google Generative AI" and "Applied imperceptible SynthID watermark".
 *   The market photo carries none.
 * - Files are renamed (cottage-1, cottage-2...) so no URL says "ai_" or "real_".
 *   Which number is the AI one changes from pair to pair.
 */

const DIR = "/games/real-or-ai";

const real = (id: string, file: string, width: number, height: number, credit: RealPhoto["credit"]): RealPhoto => ({
  id,
  src: `${DIR}/${file}`,
  width,
  height,
  isReal: true,
  credit,
});

const ai = (
  id: string,
  file: string,
  width: number,
  height: number,
  clues: AiPhoto["clues"],
  contentCredentials: boolean,
): AiPhoto => ({ id, src: `${DIR}/${file}`, width, height, isReal: false, clues, contentCredentials });

export const COMPARISON_PAIRS: readonly ComparisonPair[] = [
  // Easy: AI added whole objects.
  {
    id: "pair-thatched-cottage",
    subject: "A blue cottage with a straw roof",
    difficulty: "easy",
    realItem: real("real-cottage-house", "cottage-2.jpg", 1000, 667, {
      author: "Krzysztof Popławski",
      source: "Wikimedia Commons",
      file: "Skansen w Maurzycach, Łowicki Park Etnograficzny",
      license: "CC BY-SA 4.0",
    }),
    aiItem: ai(
      "ai-thatched-cottage",
      "cottage-1.jpg",
      1200,
      896,
      [
        "Wires cross the sky on the right. The real sky there is empty.",
        "Inside the open door, AI drew tools on the wall and a red cloth. The real doorway is dark.",
        "The straw roof looks combed, with bundles too neat along the top.",
      ],
      true,
    ),
  },
  {
    id: "pair-indian-thali",
    subject: "A thali plate with rice, curries and papad",
    difficulty: "easy",
    // The original credited an invented "Culinary Documentary Archive". Source not known.
    realItem: real("real-indian-thali", "thali-1.jpg", 1000, 750, {
      author: null,
      source: null,
      file: null,
      license: null,
    }),
    aiItem: ai(
      "ai-thali-platter",
      "thali-2.jpg",
      1200,
      896,
      [
        "Green coriander leaves and a whole green chilli sit on top of the curries.",
        "The small bowl on the far left turned into thick white yogurt with spice on top.",
        "Zoom in on the rice and papad: they look smooth, almost like plastic.",
      ],
      true,
    ),
  },
  {
    id: "pair-vegetable-stall",
    subject: "A vegetable stall with tomatoes, okra and pumpkins",
    difficulty: "easy",
    // The original credited an invented "Field Documentary Archive". Source not known.
    realItem: real("real-fruit-stand", "stall-2.jpg", 1000, 710, {
      author: null,
      source: null,
      file: null,
      license: null,
    }),
    aiItem: ai(
      "ai-vegetable-stall",
      "stall-1.jpg",
      1200,
      896,
      [
        "A big bunch of bananas hangs from the top of the middle post. The real post has only a few.",
        "The tomatoes and brinjals are extra bright and shiny.",
        "The banana stems blend smoothly into the wooden post.",
      ],
      true,
    ),
  },

  // Medium: AI changed colours, light and small parts.
  {
    id: "pair-fuji-sakura",
    subject: "Mount Fuji across a lake, framed by cherry blossoms",
    difficulty: "medium",
    realItem: real("real-fuji-sakura", "fuji-1.jpg", 1000, 669, {
      author: "Midori",
      source: "Wikimedia Commons",
      file: "Lake Kawaguchiko Sakura Mount Fuji 3.JPG",
      license: "CC BY 3.0",
    }),
    aiItem: ai(
      "ai-fuji-blossoms",
      "fuji-2.jpg",
      1200,
      896,
      [
        "The big hotel on the far shore has a bright green roof. In the real photo it's grey.",
        "Zoom in on the cherry blossoms: the petals smear into soft blobs.",
        "The small buildings along the shore blur together, like a painting.",
      ],
      true,
    ),
  },
  {
    id: "pair-golden-gate",
    subject: "The Golden Gate Bridge seen from an old brick fort",
    difficulty: "medium",
    realItem: real("real-golden-gate", "bridge-2.jpg", 1000, 563, {
      author: "Frank Schulenburg",
      source: "Wikimedia Commons",
      file: "The Golden Gate Bridge As Seen From Fort Point",
      license: "CC BY-SA 3.0",
    }),
    aiItem: ai(
      "ai-golden-gate",
      "bridge-1.jpg",
      1376,
      768,
      [
        "AI added a silver car at the far left, next to the fort.",
        "Zoom in under the road: the steel beams go wavy and melt into each other.",
        "The tiny people near the fort wall are only smudges.",
      ],
      true,
    ),
  },
  {
    id: "pair-coastal-lighthouse",
    subject: "A lighthouse on rocks at sunset",
    difficulty: "medium",
    realItem: real("real-coastal-lighthouse", "lighthouse-1.jpg", 1000, 564, {
      author: "Marius Lindvall",
      source: "Wikimedia Commons",
      file: "Svenner Lighthouse At Sunset",
      license: "CC0 (public domain)",
    }),
    aiItem: ai(
      "ai-sunset-lighthouse",
      "lighthouse-2.jpg",
      1376,
      768,
      [
        "The rocks facing you are lit up, but the sun is behind them. In a real photo they'd be dark shapes.",
        "The houses right of the sun have bright white walls, lit from the wrong side.",
        "The top of the sky is teal blue, like a film filter. The real sky is grey.",
      ],
      true,
    ),
  },

  // Hard: AI only smoothed tiny textures.
  {
    id: "pair-snow-fox",
    subject: "A red fox curled up asleep in the snow",
    difficulty: "hard",
    realItem: real("real-red-fox", "fox-2.jpg", 1000, 719, {
      author: "Jim Peaco, National Park Service",
      source: "Wikimedia Commons",
      file: null,
      license: "Public domain",
    }),
    aiItem: ai(
      "ai-snow-fox",
      "fox-1.jpg",
      1200,
      896,
      [
        "The fur on the fox's back blends into soft waves, like a painting.",
        "The dips in the snow have smooth shadows, as if airbrushed.",
        "The hairs at the bottom of the left ear melt into the snow.",
      ],
      true,
    ),
  },
  {
    id: "pair-sleeping-retriever",
    subject: "A golden retriever asleep on a blue pillow",
    difficulty: "hard",
    realItem: real("real-golden-retriever", "dog-1.jpg", 1000, 750, {
      author: "Barras",
      source: "Wikimedia Commons",
      file: "Golden Retriever Aik on a couch.JPG",
      license: "CC BY 3.0",
    }),
    aiItem: ai(
      "ai-sleeping-retriever",
      "dog-2.jpg",
      1200,
      896,
      [
        "The red wall and blue pillow look too clean. The real photo has fine camera grain.",
        "The whiskers fade into soft, blurry lines.",
        "The weave of the grey cushion repeats in a pattern that's too regular.",
      ],
      true,
    ),
  },
  {
    id: "pair-himalayan-glacier",
    subject: "A snowy mountain valley with a line of climbers",
    difficulty: "hard",
    realItem: real("real-himalayas", "glacier-2.jpg", 1000, 667, {
      author: "Pavel Novak",
      source: "Wikimedia Commons",
      file: "Himalayas, Nepal.jpg",
      license: "CC BY-SA 3.0",
    }),
    aiItem: ai(
      "ai-himalayan-glacier",
      "glacier-1.jpg",
      1200,
      896,
      [
        "Zoom in on the tiny climbers on the right: they turn into blobs with no arms or legs.",
        "The rock on the right-hand mountain looks brushed on, like paint.",
        "The footprints in the snow trail lose their sharp edges.",
      ],
      true,
    ),
  },
  {
    id: "pair-market-modified",
    subject: "A street market with a vegetable seller and motorbikes",
    difficulty: "hard",
    realItem: real("real-market-india", "market-1.jpg", 1000, 750, {
      author: "Biswarup Ganguly",
      source: "Wikimedia Commons",
      file: null,
      license: "CC BY 3.0",
    }),
    aiItem: ai(
      "ai-market-comparison",
      "market-2.jpg",
      1000,
      750,
      [
        "The yellow sari and the vegetables have a waxy, plastic shine.",
        "Text on the shop signs and motorbikes blurs into smooth shapes.",
        "The road and the cauliflowers lose their rough, grainy texture.",
      ],
      false,
    ),
  },
];

/**
 * The crop box both photos of a pair share: the geometric mean of their two
 * aspect ratios, so each loses a sliver and neither keeps its own shape.
 * (The real and AI files have different shapes; showing them uncropped would give the answer away.)
 */
export function pairAspect(pair: ComparisonPair): number {
  const realRatio = pair.realItem.width / pair.realItem.height;
  const aiRatio = pair.aiItem.width / pair.aiItem.height;
  return Math.round(Math.sqrt(realRatio * aiRatio) * 1000) / 1000;
}

export const photoOn = (question: ActiveQuestion, side: Side): PairPhoto =>
  side === "A" ? question.optionA : question.optionB;

export const otherSide = (side: Side): Side => (side === "A" ? "B" : "A");

/** Every image URL a game will show, in play order. */
export const questionSources = (questions: readonly ActiveQuestion[]): string[] =>
  questions.flatMap((q) => [q.optionA.src, q.optionB.src]);

// Remembers the last game's pairs so the next player gets fresh ones first.
// Module state: only call getGameQuestions in the browser (events or effects).
let recentlyUsedPairIds: string[] = [];

/**
 * Builds a game, as in the original: with 6 questions it takes 2 easy, then 2
 * medium, then 2 hard pairs, preferring pairs the last player didn't see, and
 * puts the AI photo on a random side.
 */
export function getGameQuestions(totalQuestions: number = ROUNDS, random: () => number = Math.random): ActiveQuestion[] {
  const shuffle = <T,>(items: readonly T[]): T[] => {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };

  const pickFromTier = (tier: Difficulty, count: number): ComparisonPair[] => {
    const tierPairs = COMPARISON_PAIRS.filter((p) => p.difficulty === tier);
    const fresh = tierPairs.filter((p) => !recentlyUsedPairIds.includes(p.id));
    const seen = tierPairs.filter((p) => recentlyUsedPairIds.includes(p.id));
    return [...shuffle(fresh), ...shuffle(seen)].slice(0, count);
  };

  let selected: ComparisonPair[];
  if (totalQuestions === 6) {
    selected = [...pickFromTier("easy", 2), ...pickFromTier("medium", 2), ...pickFromTier("hard", 2)];
  } else {
    const fresh = COMPARISON_PAIRS.filter((p) => !recentlyUsedPairIds.includes(p.id));
    const pool = fresh.length >= totalQuestions ? fresh : COMPARISON_PAIRS;
    selected = shuffle(pool).slice(0, totalQuestions);
  }

  recentlyUsedPairIds = selected.map((p) => p.id);
  const sides = aiSides(selected.length, random);

  return selected.map((pair, idx) => {
    const aiIsOptionA = sides[idx] === "A";
    return {
      pair,
      questionNumber: idx + 1,
      totalQuestions: selected.length,
      optionA: aiIsOptionA ? pair.aiItem : pair.realItem,
      optionB: aiIsOptionA ? pair.realItem : pair.aiItem,
      correctOptionKey: aiIsOptionA ? "A" : "B",
    };
  });
}

/**
 * Where the AI photo goes in each round. The original's comment promised a
 * balance its code didn't enforce (all six on one side happened about 1 game
 * in 32). Coin flips, re-flipped while more than two thirds land on one side.
 */
export function aiSides(count: number, random: () => number = Math.random): Side[] {
  const limit = Math.ceil((count * 2) / 3);
  for (let attempt = 0; attempt < 64; attempt++) {
    const sides: Side[] = Array.from({ length: count }, () => (random() < 0.5 ? "A" : "B"));
    const onA = sides.filter((s) => s === "A").length;
    if (onA <= limit && count - onA <= limit) return sides;
  }
  return Array.from({ length: count }, (_, i) => (i % 2 === 0 ? "A" : "B"));
}
