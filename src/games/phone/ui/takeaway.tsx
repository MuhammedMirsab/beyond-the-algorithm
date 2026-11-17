"use client";

import { Eye, LayoutGrid, LocateFixed, RotateCcw, ShieldCheck } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { HowItWorks, ResultPanel } from "@/components/game/panels";
import { Button } from "@/components/ui/button";
import { Score, Stat } from "@/components/ui/score";
import { EXPERIMENT_COUNT } from "../data/experiments";
import { QUIZ_LENGTH } from "../data/quiz";

const ADVICE: { icon: ReactNode; title: string; text: string }[] = [
  {
    icon: <ShieldCheck />,
    title: "Check your app permissions",
    text: "On iPhone: Settings, then Privacy & Security. On Android: open Settings and search for Permission manager. See which apps can use your location, camera and microphone.",
  },
  {
    icon: <LocateFixed />,
    title: "Share location only while you use an app",
    text: "Pick “While using the app” instead of “Always”, and turn off precise location for apps that don't need it.",
  },
  {
    icon: <Eye />,
    title: "Look for the dot",
    text: "A green or orange dot at the top of the screen means an app is using the camera or microphone right now.",
  },
];

export function Takeaway({
  score,
  tested,
  onNextPlayer,
  onLab,
}: {
  score: number;
  tested: number;
  onNextPlayer: () => void;
  onLab: () => void;
}) {
  const top = useRef<HTMLDivElement>(null);
  useEffect(() => {
    top.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div ref={top} tabIndex={-1} className="flex flex-1 flex-col outline-none">
      <ResultPanel
        label={`Quiz · ${QUIZ_LENGTH} questions`}
        title={score === QUIZ_LENGTH ? `All ${QUIZ_LENGTH} right` : `${score} of ${QUIZ_LENGTH} right`}
        score={<Score value={score} label="Right answers" tone="game" />}
        stats={<Stat value={`${tested} of ${EXPERIMENT_COUNT}`} label="Sensors tested" />}
        actions={
          <>
            <Button variant="game" size="lg" icon={<RotateCcw />} onClick={onNextPlayer}>
              Next player
            </Button>
            <Button variant="secondary" size="lg" icon={<LayoutGrid />} onClick={onLab}>
              Back to the lab
            </Button>
          </>
        }
      >
        <HowItWorks
          title="How your phone works you out"
          intro="It happened in every test: measurements went in, and guesses about you came out."
          steps={[
            {
              title: "Sensors measure",
              text: "Tilt in degrees, sound as a wave, light as brightness, location as a circle on a map. On their own, they're only numbers.",
            },
            {
              title: "Software turns numbers into guesses",
              text: "Regular bumps become steps. Loud sound with no pauses becomes a crowd. The place your phone spends the night becomes home.",
            },
            {
              title: "That's inference",
              text: "Working things out from patterns in data is what every AI does. Your phone does it all day, with the sensors you just tried.",
            },
          ]}
        />

        <section aria-labelledby="what-you-can-do" className="flex flex-col gap-6">
          <h2 id="what-you-can-do" className="type-title-1 text-fg">
            What you can do
          </h2>
          <ul className="grid gap-3 md:grid-cols-3">
            {ADVICE.map((item) => (
              <li key={item.title} className="flex flex-col gap-3 rounded-lg bg-surface p-5 shadow-ring">
                <span aria-hidden className="grid size-10 place-items-center rounded-full bg-game-soft text-game [&_svg]:size-5">
                  {item.icon}
                </span>
                <h3 className="type-title-3 text-fg">{item.title}</h3>
                <p className="type-body text-fg-muted">{item.text}</p>
              </li>
            ))}
          </ul>
        </section>
      </ResultPanel>
    </div>
  );
}
