"use client";

import { getImageProps } from "next/image";
import { Paintbrush, Shapes, Sun, Tag, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { evidenceFor, playedClues, type PlayedClue, type Tell } from "../engine/clues";
import { pairAspect } from "../engine/pairs";
import type { ActiveQuestion, PlayerAnswer } from "../engine/types";
import { CredentialsVisual } from "./explain-visuals";
import { OutcomeDot, outcomeOf } from "./labels";
import { countWord } from "./round-review";
import { cn } from "@/lib/cn";

/** The three kinds of slip, and the check that catches each one in any photo. */
const TELL_COPY: Record<Tell, { icon: LucideIcon; title: string; text: string; check: string }> = {
  smooth: {
    icon: Paintbrush,
    title: "Too smooth to be real",
    text: "Fur, skin, sand and food lose their fine texture and look painted or plastic. Patterns repeat too neatly.",
    check: "Zoom in on small things. Text, hands, fur and tiny people often melt into smooth blobs or patterns that repeat.",
  },
  invented: {
    icon: Shapes,
    title: "Details that don't belong",
    text: "Things appear that were never there, colours change, and writing turns into shapes that aren't letters.",
    check: "Look for things that appeared. Extra wires, objects or food that the scene doesn't need.",
  },
  light: {
    icon: Sun,
    title: "Light that doesn't add up",
    text: "Bright sides face away from the sun, skies take on a filter, or the whole scene glows like an advert.",
    check: "Check the light. Shadows, bright sides and reflections should all agree with where the light comes from.",
  },
};

const ORDER: Tell[] = ["smooth", "invented", "light"];

/** A round crop of an AI photo at a clue: the slip itself, magnified. */
function SlipCrop({ clue, size }: { clue: PlayedClue; size: number }) {
  const photo = clue.question.pair.aiItem;
  // Show a patch a fifth of the photo wide around the spot, from a 640px copy (sharp enough at this size).
  // getImageProps puts its 2x candidate in `src`: asking for 320 wide makes that the 640px copy.
  const bgW = size / 0.2;
  const bgH = (bgW * photo.height) / photo.width;
  const { x, y } = clue.note.spot;
  const { props } = getImageProps({ src: photo.src, alt: "", width: 320, height: Math.round((320 * photo.height) / photo.width) });
  return (
    <span
      aria-hidden
      className="block shrink-0 rounded-full bg-sunken bg-no-repeat shadow-ring"
      style={{
        width: size,
        height: size,
        backgroundImage: `url("${props.src}")`,
        backgroundSize: `${bgW}px ${bgH}px`,
        backgroundPosition: `${size / 2 - x * bgW}px ${size / 2 - y * bgH}px`,
      }}
    />
  );
}

/** One kind of slip, shown with the visitor's own rounds: which they caught, which got past them. */
function TellCard({ tell, evidence, rounds }: { tell: Tell; evidence: PlayedClue[]; rounds: number }) {
  const copy = TELL_COPY[tell];
  const Icon = copy.icon;
  const [picked, setPicked] = useState(0);
  const shown = evidence[Math.min(picked, evidence.length - 1)];
  const caught = evidence.filter((e) => e.answer.isCorrect).length;
  const summary =
    evidence.length === 0
      ? `None of your ${countWord(rounds)} rounds had this one.`
      : evidence.length === 1
        ? `In one of your rounds. You ${caught === 1 ? "found" : "missed"} the AI photo there.`
        : `In ${countWord(evidence.length)} of your rounds. You found the AI photo in ${countWord(caught)} of them.`;

  return (
    <li className="reveal flex flex-col gap-4 rounded-xl bg-surface p-5 shadow-ring sm:p-6">
      <div className="flex items-center gap-3">
        <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-md bg-game-soft text-game">
          <Icon className="size-5" />
        </span>
        <h3 className="type-title-3 text-fg">{copy.title}</h3>
      </div>
      <p className="type-body text-fg-muted">{copy.text}</p>

      <div className="flex flex-col gap-3 rounded-lg bg-sunken p-4">
        <p className="type-small font-semibold text-fg">{summary}</p>
        {evidence.length > 0 ? (
          <>
            <div role="group" aria-label="Your rounds with this slip" className="flex flex-wrap gap-3">
              {evidence.map((clue, i) => {
                const outcome = outcomeOf(clue.answer);
                const on = clue === shown;
                return (
                  <button
                    key={clue.round}
                    type="button"
                    aria-pressed={on}
                    aria-label={`Round ${clue.round}: ${clue.text}`}
                    onClick={() => setPicked(i)}
                    className={cn(
                      "relative rounded-full transition-[scale,box-shadow] duration-150 ease-out active:scale-[0.96]",
                      "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-fg",
                      on ? "shadow-[0_0_0_3px_var(--color-game)]" : "opacity-80 hover:opacity-100",
                    )}
                  >
                    <SlipCrop clue={clue} size={68} />
                    <OutcomeDot outcome={outcome} className="absolute -bottom-0.5 -right-0.5 ring-2 ring-sunken" />
                  </button>
                );
              })}
            </div>
            {shown ? (
              <p className="type-small text-fg-muted" aria-live="polite">
                <span className="font-semibold text-fg">Round {shown.round}.</span> {shown.text}
              </p>
            ) : null}
          </>
        ) : null}
      </div>

      <p className="type-small mt-auto text-fg-subtle">
        <span className="font-semibold text-fg-muted">Try it on any photo:</span> {copy.check}
      </p>
    </li>
  );
}

/** The fourth check: a label inside the file, and how easily it's lost. */
function CredentialsCard({ questions }: { questions: readonly ActiveQuestion[] }) {
  const aiLabelled = questions.filter((q) => q.pair.aiItem.contentCredentials).length;
  const total = questions.length;
  const labelled = aiLabelled === total ? `All ${total}` : `${aiLabelled} of the ${total}`;
  const example = questions.find((q) => q.pair.aiItem.contentCredentials) ?? questions[0];
  return (
    <li className="reveal flex flex-col gap-4 rounded-xl bg-surface p-5 shadow-ring sm:p-6">
      <div className="flex items-center gap-3">
        <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-md bg-game-soft text-game">
          <Tag className="size-5" />
        </span>
        <h3 className="type-title-3 text-fg">A label inside the file</h3>
      </div>
      <p className="type-body text-fg-muted">
        Some AI tools sign a label into the file, called Content Credentials. Apps and websites can read it and show that AI made the photo.
      </p>
      {example ? (
        <div className="overflow-hidden rounded-lg bg-sunken">
          <CredentialsVisual photo={example.pair.aiItem} ratio={pairAspect(example.pair)} alt={`An AI photo you saw: ${example.pair.subject}`} />
        </div>
      ) : null}
      {aiLabelled > 0 ? (
        <p className="type-small text-fg-muted">
          {labelled} AI photos you saw came out of Google&apos;s AI with a signed label inside the file saying so. Labels like this are lost when a
          photo is cropped or re-saved, so no label doesn&apos;t prove a photo is real.
        </p>
      ) : null}
      <p className="type-small mt-auto text-fg-subtle">
        <span className="font-semibold text-fg-muted">Try it on any photo:</span> Ask where it came from. Who took it, and where was it first
        posted? A real photo usually has a source you can check.
      </p>
    </li>
  );
}

/**
 * What gave it away: the three kinds of slip in the visitor's own rounds,
 * each with its check, and the label in the file. Replaces a plain checklist
 * with the evidence they just looked at.
 */
export function Tells({ questions, answers }: { questions: readonly ActiveQuestion[]; answers: readonly PlayerAnswer[] }) {
  const clues = playedClues(questions, answers);
  return (
    <section aria-labelledby="real-or-ai-tells" className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 id="real-or-ai-tells" className="type-title-1 text-fg">
          What gave it away
        </h2>
        <p className="type-body-lg max-w-[40rem] text-fg-muted">
          Every clue in your {countWord(answers.length)} rounds was one of three kinds of slip. Tap a photo to see the clue it came from.
        </p>
      </div>
      <ul className="grid gap-3 md:grid-cols-2">
        {ORDER.map((tell) => (
          <TellCard key={tell} tell={tell} evidence={evidenceFor(tell, clues)} rounds={answers.length} />
        ))}
        <CredentialsCard questions={questions} />
      </ul>
    </section>
  );
}
