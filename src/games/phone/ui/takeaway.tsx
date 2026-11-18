"use client";

import { ArrowRight, Eye, FlaskConical, LayoutGrid, LocateFixed, ShieldCheck, Smartphone } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useRef, type ReactNode } from "react";
import { PhoneSensorsLoop, SENSOR_GIVES_AWAY } from "@/components/art/sensor-art";
import { NextPlayerIcon } from "@/components/game/next-player";
import { HowItWorks, ResultPanel } from "@/components/game/panels";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Score, Stat } from "@/components/ui/score";
import { entrance } from "@/lib/entrance";
import { EXPERIMENT_COUNT, EXPERIMENTS } from "../data/experiments";
import { QUIZ_LENGTH } from "../data/quiz";
import type { Insight, Insights } from "../nav";

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

/** The sensors the visitor tried, in lab order, with what each one worked out. */
function workedOut(insights: Insights) {
  return EXPERIMENTS.flatMap((e) => {
    const insight = insights[e.id];
    return insight ? [{ experiment: e, insight }] : [];
  });
}

export function Takeaway({
  score,
  tested,
  insights,
  onNextPlayer,
  onLab,
}: {
  score: number;
  tested: number;
  insights: Insights;
  onNextPlayer: () => void;
  onLab: () => void;
}) {
  const top = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    top.current?.focus({ preventScroll: true });
  }, []);

  const items = workedOut(insights);
  const readings = items.filter((i) => i.insight.reading).slice(0, 4);
  const anyLive = items.some((i) => i.insight.live);

  return (
    <div className="flex flex-1 flex-col">
      <ResultPanel
        headingRef={top}
        label={`Quiz, ${QUIZ_LENGTH} questions`}
        title={score === QUIZ_LENGTH ? `All ${QUIZ_LENGTH} right` : `${score} of ${QUIZ_LENGTH} right`}
        score={<Score value={score} label="Right answers" tone="game" />}
        stats={<Stat value={`${tested} of ${EXPERIMENT_COUNT}`} label="Sensors tried" />}
        actions={
          <>
            <Button variant="game" size="lg" icon={<NextPlayerIcon />} onClick={onNextPlayer}>
              Next player
            </Button>
            <Button variant="secondary" size="lg" icon={<LayoutGrid />} onClick={onLab}>
              All sensors
            </Button>
          </>
        }
      >
        {items.length ? (
          <section aria-labelledby="worked-out" className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <h2 id="worked-out" className="type-title-1 text-fg">
                What it worked out about you
              </h2>
              <p className="type-body-lg max-w-[40rem] text-fg-muted">
                {anyLive
                  ? "In a few minutes, from numbers alone. An app on your phone could do this all day."
                  : "From the simulations you tried. On your own phone, an app could do this with your real readings."}
              </p>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {items.map(({ experiment, insight }, i) => (
                <WorkedOutCard key={experiment.id} name={experiment.name} sensor={experiment.id} insight={insight} order={i} />
              ))}
            </ul>
          </section>
        ) : null}

        <HowItWorks
          title="How your phone works you out"
          intro="It happened in every test: measurements went in, and guesses about you came out."
          steps={[
            {
              title: "Sensors measure",
              text: "Tilt, light, sound, touch and radio signals. Each sensor turns the world into measurements, many times a second.",
              visual: (
                <div className="h-36 p-3">
                  <PhoneSensorsLoop tone="dark" callout={false} />
                </div>
              ),
            },
            {
              title: "You become numbers",
              text: readings.length
                ? "These are some of yours. On their own they are only numbers."
                : "Degrees of tilt, loudness from 0 to 100, brightness, places on the glass. On their own they are only numbers.",
              visual: <ReadingsVisual readings={readings.map((r) => r.insight.reading ?? "")} />,
            },
            {
              title: "Patterns become guesses",
              text: "Software looks for patterns in the numbers and turns them into guesses about you. That's inference, and it's what every AI does.",
              visual: <GuessesVisual items={readings.length ? readings : items.slice(0, 3)} />,
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

function WorkedOutCard({ name, sensor, insight, order }: { name: string; sensor: keyof typeof SENSOR_GIVES_AWAY; insight: Insight; order: number }) {
  const Icon = SENSOR_GIVES_AWAY[sensor];
  return (
    <motion.li
      initial={entrance({ opacity: 0, y: 10 })}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: order < 5 ? 0.15 + order * 0.04 : 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-col gap-3 rounded-lg bg-surface p-5 shadow-ring"
    >
      <div className="flex items-center justify-between gap-3">
        <span aria-hidden className="grid size-11 place-items-center rounded-full bg-game text-game-ink">
          <Icon className="size-5" />
        </span>
        {insight.live ? (
          <Chip tone="game" icon={<Smartphone />}>
            Real sensor
          </Chip>
        ) : (
          <Chip icon={<FlaskConical />}>Simulated</Chip>
        )}
      </div>
      <span className="type-label text-fg-subtle">{name}</span>
      <p className="type-title-3 text-fg">{insight.label}</p>
      {insight.reading ? <span className="type-label tabular-nums text-fg-muted">{insight.reading}</span> : null}
    </motion.li>
  );
}

function ReadingsVisual({ readings }: { readings: string[] }) {
  return (
    <div className="flex h-36 flex-col justify-center gap-1.5 px-4" aria-hidden>
      {readings.length ? (
        readings.map((r, i) => (
          <motion.span
            key={r}
            initial={entrance({ opacity: 0, x: -6 })}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.3, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }}
            className="type-label truncate tabular-nums text-fg"
          >
            {r}
          </motion.span>
        ))
      ) : (
        <span className="type-label text-fg-subtle">Try a sensor to see your own numbers here</span>
      )}
    </div>
  );
}

function GuessesVisual({ items }: { items: { experiment: { id: string }; insight: Insight }[] }) {
  return (
    <div className="flex h-36 flex-col justify-center gap-2 px-4" aria-hidden>
      {items.length ? (
        items.slice(0, 3).map(({ experiment, insight }, i) => (
          <motion.span
            key={experiment.id}
            initial={entrance({ opacity: 0 })}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.3, delay: 0.2 + i * 0.1 }}
            className="flex min-w-0 items-center gap-2"
          >
            <ArrowRight className="size-3.5 shrink-0 text-fg-subtle" />
            <span className="truncate rounded-sm bg-game px-2 py-0.5 text-[0.875rem] font-semibold text-game-ink">{insight.label}</span>
          </motion.span>
        ))
      ) : (
        <span className="type-label text-fg-subtle">Your guesses appear here</span>
      )}
    </div>
  );
}
