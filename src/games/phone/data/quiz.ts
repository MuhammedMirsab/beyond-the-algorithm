/**
 * The five quiz questions from the original exhibit (QUIZ_QUESTIONS), rewritten
 * for DESIGN.md §9. The correct option no longer always comes first, and each
 * explanation ends on what an app can work out, the point of the game.
 */

export interface QuizOption {
  text: string;
  correct: boolean;
}

export interface QuizQuestion {
  id: number;
  scenario: string;
  question: string;
  options: QuizOption[];
  explanation: string;
}

export const QUIZ_QUESTIONS: QuizQuestion[] = [
  {
    id: 1,
    scenario: "You turn your phone sideways to watch a video, and the video turns with it.",
    question: "Which sensor noticed?",
    options: [
      { text: "Camera", correct: false },
      { text: "Motion sensors", correct: true },
      { text: "Microphone", correct: false },
    ],
    explanation:
      "Motion sensors. The accelerometer feels which way gravity pulls, so the phone knows it's on its side. The same sensor counts your steps.",
  },
  {
    id: 2,
    scenario: "You step outside into bright sunshine, and your screen gets brighter on its own.",
    question: "Which sensor made the screen change?",
    options: [
      { text: "GPS", correct: false },
      { text: "Speaker", correct: false },
      { text: "Light sensor", correct: true },
    ],
    explanation:
      "The light sensor. It measured the sunlight and turned the screen up. The same reading tells an app whether you're indoors or outside.",
  },
  {
    id: 3,
    scenario: "You hold the phone to your ear during a call, and the screen turns off.",
    question: "Which sensor stops your cheek from pressing buttons?",
    options: [
      { text: "Proximity sensor", correct: true },
      { text: "Battery", correct: false },
      { text: "Wi-Fi", correct: false },
    ],
    explanation:
      "The proximity sensor. It sends out invisible infrared light and notices when something is very close, like your cheek.",
  },
  {
    id: 4,
    scenario: "You open a map in a new city, and a blue dot shows the street corner you're on.",
    question: "What helps the phone find you?",
    options: [
      { text: "Flashlight", correct: false },
      { text: "GPS satellites", correct: true },
      { text: "Vibration motor", correct: false },
    ],
    explanation:
      "GPS. Satellites about 20,000 km up send time signals, and the phone works out where it is from them. Over a few days, a map app can also work out where you live.",
  },
  {
    id: 5,
    scenario: "You rest your finger on the phone, and it opens straight away.",
    question: "What checked that it was you?",
    options: [
      { text: "Barometer", correct: false },
      { text: "FM radio", correct: false },
      { text: "Fingerprint sensor", correct: true },
    ],
    explanation:
      "The fingerprint sensor. It reads the ridges on your fingertip and compares them with the pattern it saved. Matching patterns is exactly what AI does.",
  },
];

export const QUIZ_LENGTH = QUIZ_QUESTIONS.length;

export function correctIndex(question: QuizQuestion): number {
  return question.options.findIndex((o) => o.correct);
}

/** Number of answers that picked the correct option. `null` means not answered. */
export function quizScore(answers: readonly (number | null)[], questions: readonly QuizQuestion[] = QUIZ_QUESTIONS): number {
  return answers.reduce<number>((sum, answer, i) => {
    const q = questions[i];
    return q && answer != null && q.options[answer]?.correct ? sum + 1 : sum;
  }, 0);
}
