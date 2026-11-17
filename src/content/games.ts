/**
 * Single source of truth for the arcade: every game, its group, copy and needs.
 * The hub, the game shells, metadata and QR codes all read from here.
 */

export type GameSlug =
  | "mind-reader"
  | "rock-paper-scissors"
  | "face-control"
  | "airwrite"
  | "viewfinder"
  | "train-the-machine"
  | "how-ai-learns"
  | "real-or-ai"
  | "phone";

export type GroupId = "predicts" | "sees" | "learns" | "around";

export type Need = "camera" | "microphone" | "motion" | "internet";

export type CuratorId = "mirsab" | "dilshaan";

export interface Curator {
  id: CuratorId;
  name: string;
  grade: string;
}

export interface Game {
  slug: GameSlug;
  /** Full title, sentence case. */
  title: string;
  /** Short name for tight spaces (tabs, breadcrumbs). */
  short: string;
  /** One sentence for the tile: what you do. */
  hook: string;
  /** The AI idea it demonstrates, in plain words. Shown in the machine voice. */
  skill: string;
  group: GroupId;
  minutes: number;
  needs: Need[];
  /** Where it plays best. "phone" games get a QR code on the booth laptop. */
  bestOn: "laptop" | "phone" | "any";
  curator: CuratorId;
}

export const CURATORS: Record<CuratorId, Curator> = {
  mirsab: { id: "mirsab", name: "Mirsab", grade: "Grade 10" },
  dilshaan: { id: "dilshaan", name: "Dilshaan", grade: "Grade 9" },
};

export interface Group {
  id: GroupId;
  title: string;
  line: string;
}

export const GROUPS: Group[] = [
  {
    id: "predicts",
    title: "It predicts you",
    line: "People are less random than they think. These two games find the pattern in your choices.",
  },
  {
    id: "sees",
    title: "It sees you",
    line: "A camera only gives a computer coloured pixels. These games turn them into your face and hands, about 30 times a second.",
  },
  {
    id: "learns",
    title: "It learns from you",
    line: "Nobody writes the rules here. You show it examples, and the model works out what they have in common.",
  },
  {
    id: "around",
    title: "It's already around you",
    line: "Photos that no camera took, and the sensors in your pocket. You meet both every day.",
  },
];

export const GAMES: Game[] = [
  {
    slug: "mind-reader",
    title: "Can AI read your mind?",
    short: "Mind reader",
    hook: "Think of a number. Answer a few yes or no questions, and it names your number.",
    skill: "Binary search",
    group: "predicts",
    minutes: 2,
    needs: [],
    bestOn: "any",
    curator: "mirsab",
  },
  {
    slug: "rock-paper-scissors",
    title: "Rock, paper, scissors",
    short: "Rock paper scissors",
    hook: "Play with your hand against an AI that studies your habits and locks in its move before you throw.",
    skill: "Pattern prediction",
    group: "predicts",
    minutes: 2,
    needs: ["camera"],
    bestOn: "laptop",
    curator: "dilshaan",
  },
  {
    slug: "face-control",
    title: "Face Control",
    short: "Face Control",
    hook: "Tilt your head to roll the ball. Open your mouth to jump. No keyboard, no mouse.",
    skill: "Face tracking, 478 points",
    group: "sees",
    minutes: 3,
    needs: ["camera"],
    bestOn: "laptop",
    curator: "mirsab",
  },
  {
    slug: "airwrite",
    title: "AirWrite",
    short: "AirWrite",
    hook: "Write a word in the air with one finger, then watch the computer read your handwriting.",
    skill: "Hand tracking, 21 points",
    group: "sees",
    minutes: 2,
    needs: ["camera"],
    bestOn: "laptop",
    curator: "mirsab",
  },
  {
    slug: "viewfinder",
    title: "Viewfinder",
    short: "Viewfinder",
    hook: "Frame the world with both hands. Whatever you frame changes style, live.",
    skill: "Two-hand tracking",
    group: "sees",
    minutes: 2,
    needs: ["camera"],
    bestOn: "laptop",
    curator: "mirsab",
  },
  {
    slug: "train-the-machine",
    title: "Train the machine",
    short: "Train the machine",
    hook: "Teach it two moves with your webcam, like a wave and a fist. Then try to fool it.",
    skill: "Pose classification",
    group: "learns",
    minutes: 4,
    needs: ["camera"],
    bestOn: "laptop",
    curator: "dilshaan",
  },
  {
    slug: "how-ai-learns",
    title: "See how AI learns",
    short: "How AI learns",
    hook: "Give a model photos of pens and cups, train it in seconds, and test it on new ones.",
    skill: "Image classification",
    group: "learns",
    minutes: 4,
    needs: [],
    bestOn: "laptop",
    curator: "dilshaan",
  },
  {
    slug: "real-or-ai",
    title: "Real or AI?",
    short: "Real or AI",
    hook: "Six pairs of photos. In each pair, one was never taken by a camera. Find it.",
    skill: "Image generation",
    group: "around",
    minutes: 3,
    needs: [],
    bestOn: "any",
    curator: "mirsab",
  },
  {
    slug: "phone",
    title: "Your phone knows more than you think",
    short: "Your phone",
    hook: "Eight sensors are hiding in your phone. Test each one and see what it tells apps about you.",
    skill: "Sensors and inference",
    group: "around",
    minutes: 4,
    needs: ["motion", "microphone"],
    bestOn: "phone",
    curator: "dilshaan",
  },
];

export const gameBySlug = (slug: GameSlug): Game => {
  const game = GAMES.find((g) => g.slug === slug);
  if (!game) throw new Error(`Unknown game: ${slug}`);
  return game;
};

export const gamesInGroup = (group: GroupId): Game[] => GAMES.filter((g) => g.group === group);

export const gamePath = (slug: GameSlug) => `/${slug}`;
