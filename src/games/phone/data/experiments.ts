import type { SensorId } from "@/components/art/sensor-art";

/**
 * The eight sensor experiments, in lab order. Copied from the original
 * exhibit's data/experiments.js and rewritten for DESIGN.md §9: plain words,
 * sentence case, no invented numbers. Every inference is something real apps
 * do with that sensor.
 */

export interface Inference {
  title: string;
  text: string;
}

export interface Experiment {
  id: SensorId;
  /** Short name for cards and headings. */
  name: string;
  /** One line on the lab card. */
  line: string;
  /** The question the experiment answers. */
  question: string;
  /** The hardware, in the machine voice. */
  tech: string;
  /** The answer to the question, shown once the sensor has been tried. */
  answer: string;
  /** "What an app can work out": 2 or 3 concrete inferences. */
  inferences: Inference[];
}

export const EXPERIMENTS: Experiment[] = [
  {
    id: "motion",
    name: "Motion",
    line: "Tilt it, shake it, take a few steps.",
    question: "How does your phone know it moved?",
    tech: "Accelerometer and gyroscope",
    answer:
      "An accelerometer feels gravity and every bump. A gyroscope feels the phone turn. Together they measure its tilt many times a second.",
    inferences: [
      { title: "Your steps", text: "Each step gives the phone a small bump. Count the bumps and you have a step counter." },
      {
        title: "Walking, running or in a car",
        text: "Gentle bumps mean walking, hard fast ones mean running. Smooth speeding up and slowing down means a car.",
      },
      { title: "When you go to sleep", text: "A phone that lies still all night tells an app when you went to bed." },
    ],
  },
  {
    id: "gps",
    name: "GPS",
    line: "See how closely it can find you.",
    question: "How does your phone know where you are?",
    tech: "GPS, Wi-Fi and phone towers",
    answer:
      "Satellites about 20,000 km up send out time signals. Your phone compares when each one arrives to work out where it is. Indoors it also uses nearby Wi-Fi.",
    inferences: [
      { title: "Where you live", text: "The place your phone spends the night is almost always home." },
      { title: "Where you study", text: "The same building every weekday morning is your school." },
      {
        title: "How you spend your evenings",
        text: "Regular evening visits give away your sport, your friends' houses and your favourite shops.",
      },
    ],
  },
  {
    id: "camera",
    name: "Camera",
    line: "Turn light into numbers.",
    question: "What does your camera really see?",
    tech: "Image sensor",
    answer:
      "A camera is a grid of tiny light sensors. Each one gives a number for how much light reached it. To the phone, a photo is just those numbers.",
    inferences: [
      {
        title: "Your face, to open your phone",
        text: "Face recognition measures the shape of your face and compares it with the one it saved.",
      },
      { title: "Text in your photos", text: "Signs, menus and homework in your photos can be read and searched." },
      { title: "Where a photo was taken", text: "Landmarks and shop signs in the background give the place away." },
    ],
  },
  {
    id: "microphone",
    name: "Microphone",
    line: "Watch your voice become a wave.",
    question: "How does your phone hear you?",
    tech: "MEMS microphone",
    answer:
      "Sound pushes a tiny plate back and forth. The phone measures where the plate is tens of thousands of times a second and gets a wave of numbers.",
    inferences: [
      { title: "The song that's playing", text: "Song-finder apps match a few seconds of sound against millions of songs." },
      {
        title: "Whether you're somewhere crowded",
        text: "Loud sound that never stops means a crowd. Quiet with short bursts means a few people talking.",
      },
      { title: "Who is speaking", text: "Voice assistants learn the sound of your voice, so they answer you and not someone else." },
    ],
  },
  {
    id: "light",
    name: "Light",
    line: "Watch the screen dim and brighten.",
    question: "How does your screen know it's dark?",
    tech: "Ambient light sensor",
    answer:
      "A small light sensor near the top of the screen measures how bright it is around you. The phone dims the screen in the dark and turns it up in the sun.",
    inferences: [
      { title: "Indoors or outside", text: "Sunlight is hundreds of times brighter than a classroom, so the difference is easy to spot." },
      { title: "Day or night", text: "Dark at 2 PM means the phone is in a bag or a pocket. Dark at 11 PM means bedtime." },
      { title: "Phone use in bed", text: "A bright screen in a dark room late at night is easy to notice." },
    ],
  },
  {
    id: "touch",
    name: "Touch",
    line: "Tap with one finger, then three.",
    question: "How does your phone know where you tapped?",
    tech: "Capacitive touchscreen",
    answer:
      "Under the glass is a grid of see-through wires carrying a tiny charge. Your finger changes the charge where it touches, so the phone knows exactly where you tapped.",
    inferences: [
      {
        title: "Whether it's you holding the phone",
        text: "Everyone taps and types with their own rhythm. Some banking apps check it to spot a stranger.",
      },
      { title: "Which hand you use", text: "Taps that land on one side of the screen give away your thumb." },
      { title: "What you'll type next", text: "Your keyboard learns the words you use, so it can suggest the next one." },
    ],
  },
  {
    id: "battery",
    name: "Battery",
    line: "Find out what drains it fastest.",
    question: "What does your battery say about your day?",
    tech: "Lithium-ion battery",
    answer:
      "The phone keeps track of how full the battery is and when it's charging. The screen, the processor and the radios use the most power.",
    inferences: [
      { title: "Your daily routine", text: "Plugged in at 11 PM and unplugged at 6:30 AM. That's when you sleep." },
      { title: "The apps you use most", text: "Your phone keeps a list of which apps used the most battery today." },
      { title: "When you're away from home", text: "A phone that hasn't charged all day is probably out with you." },
    ],
  },
  {
    id: "connection",
    name: "Connection",
    line: "Wi-Fi, mobile data and Bluetooth.",
    question: "What do your phone's radios give away?",
    tech: "Wi-Fi, mobile and Bluetooth radios",
    answer:
      "Your phone has radios for Wi-Fi, mobile networks and Bluetooth. Each one notices the signals around you, even when you aren't using it.",
    inferences: [
      {
        title: "Where you are, from Wi-Fi names",
        text: "Location services keep a map of Wi-Fi networks, so the ones around you give away the building, even without GPS.",
      },
      { title: "When you get home", text: "Your phone joins your home Wi-Fi as soon as you walk in." },
      { title: "Who you spend time with", text: "Phones that keep seeing each other's Bluetooth often belong to friends or family." },
    ],
  },
];

export const EXPERIMENT_COUNT = EXPERIMENTS.length;

export function experimentById(id: SensorId): Experiment {
  const found = EXPERIMENTS.find((e) => e.id === id);
  if (!found) throw new Error(`Unknown sensor: ${id}`);
  return found;
}

export function experimentIndex(id: SensorId): number {
  return EXPERIMENTS.findIndex((e) => e.id === id);
}
