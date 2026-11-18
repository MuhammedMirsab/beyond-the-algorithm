"use client";

import { AnimatePresence, motion } from "motion/react";
import { Check } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { GameGlyph } from "@/components/art/game-glyph";
import { Button, ButtonLink } from "@/components/ui/button";
import { ToggleChip } from "@/components/ui/chip";
import { COMMENT_MAX, ISSUES, LOW_RATING, NAME_MAX, RATINGS, type IssueId, type Rating } from "@/content/feedback";
import { GAMES, type GameSlug } from "@/content/games";
import { entrance } from "@/lib/entrance";
import { cn } from "@/lib/cn";

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

/** Native radios, visually hidden: the label is the control people see and tap. */
const hiddenRadio = "peer sr-only";

export function FeedbackForm({ initialGame }: { initialGame: GameSlug | null }) {
  const id = useId();
  const [name, setName] = useState("");
  const [game, setGame] = useState<GameSlug | null>(initialGame);
  const [rating, setRating] = useState<Rating | null>(null);
  const [issues, setIssues] = useState<IssueId[]>([]);
  const [comment, setComment] = useState("");
  const [trap, setTrap] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const low = rating !== null && rating <= LOW_RATING;
  const ratingWord = rating ? RATINGS.find((r) => r.value === rating)?.word : null;

  const toggleIssue = (issue: IssueId) =>
    setIssues((list) => (list.includes(issue) ? list.filter((i) => i !== issue) : [...list, issue]));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (sending) return;
    if (!game || !rating) {
      setError(!game ? "Pick the game you played." : "Pick a rating from 1 to 5.");
      return;
    }
    setError(null);
    setSending(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, game, rating, issues: low ? issues : [], comment: low ? comment : "", website: trap }),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !data?.ok) throw new Error(data?.error ?? "It didn't send. Try again in a moment.");
      setSent(true);
    } catch (err) {
      setError(err instanceof Error && err.message !== "Failed to fetch" ? err.message : "No connection. Check your internet and try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <main data-game={game ?? undefined} className="mx-auto flex w-full max-w-[36rem] flex-1 flex-col px-4 pb-[calc(3rem+env(safe-area-inset-bottom))] pt-6 sm:px-6 sm:pt-10">
      <AnimatePresence mode="wait" initial={false}>
        {sent ? (
          <ThankYou key="thanks" name={name.trim()} low={low} />
        ) : (
          <motion.form
            key="form"
            onSubmit={submit}
            noValidate
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
            className="flex flex-col gap-10"
          >
            <div className="flex flex-col gap-3">
              <span className="type-label enter text-fg-subtle">Feedback · 3 questions</span>
              <h1 className="type-display-2 enter text-fg [--enter-delay:60ms]">How did it go?</h1>
              <p className="type-body-lg enter max-w-[30rem] text-fg-muted [--enter-delay:120ms]">
                Tell the two students who made these games. It takes about 20 seconds.
              </p>
            </div>

            {/* 1. Name */}
            <div className="enter flex flex-col gap-3 [--enter-delay:180ms]">
              <label htmlFor={`${id}-name`} className="type-title-3 text-fg">
                Your name <span className="font-medium text-fg-subtle">(optional)</span>
              </label>
              <input
                id={`${id}-name`}
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={NAME_MAX}
                autoComplete="given-name"
                autoCapitalize="words"
                spellCheck={false}
                enterKeyHint="next"
                placeholder="e.g. Aisha K."
                className="h-14 w-full min-w-0 rounded-full bg-sunken px-6 text-[1.0625rem] font-medium text-fg shadow-ring outline-none transition-shadow duration-150 placeholder:text-fg-faint focus:shadow-[0_0_0_2px_var(--color-fg)]"
              />
            </div>

            {/* 2. Game */}
            <fieldset className="enter flex flex-col gap-3 [--enter-delay:240ms]">
              <legend className="type-title-3 mb-3 text-fg">Which game did you play?</legend>
              <div className="grid grid-cols-2 gap-2 max-[359px]:grid-cols-1">
                {GAMES.map((g) => (
                  <label key={g.slug} data-game={g.slug} className="relative cursor-pointer">
                    <input
                      type="radio"
                      name={`${id}-game`}
                      value={g.slug}
                      checked={game === g.slug}
                      onChange={() => {
                        setGame(g.slug);
                        if (error) setError(null);
                      }}
                      className={hiddenRadio}
                    />
                    <span
                      className={cn(
                        "flex min-h-14 items-center gap-3 rounded-md bg-surface px-3.5 py-2.5 text-left shadow-ring",
                        "transition-[background-color,box-shadow,scale] duration-150 ease-out active:scale-[0.98]",
                        "hover:bg-raised peer-checked:bg-game-soft peer-checked:shadow-[inset_0_0_0_2px_var(--color-game)]",
                        "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-fg",
                      )}
                    >
                      <GameGlyph slug={g.slug} className="size-5 shrink-0 text-game" />
                      <span className="text-[0.9375rem] font-semibold leading-tight text-fg">{g.short}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            {/* 3. Rating */}
            <fieldset className="enter flex flex-col [--enter-delay:300ms]">
              <legend className="mb-3 flex w-full items-baseline justify-between gap-4">
                <span className="type-title-3 text-fg">How was it?</span>
              </legend>
              <div className="grid grid-cols-5 gap-2">
                {RATINGS.map((r) => (
                  <label key={r.value} className="relative cursor-pointer">
                    <input
                      type="radio"
                      name={`${id}-rating`}
                      value={r.value}
                      checked={rating === r.value}
                      onChange={() => {
                        setRating(r.value);
                        if (error) setError(null);
                      }}
                      aria-label={`${r.value} of 5, ${r.word.toLowerCase()}`}
                      className={hiddenRadio}
                    />
                    <span
                      className={cn(
                        "grid h-16 place-items-center rounded-md bg-surface text-[1.5rem] font-bold tabular-nums text-fg-muted shadow-ring sm:h-[4.5rem]",
                        "transition-[background-color,color,box-shadow,scale] duration-150 ease-out active:scale-[0.96]",
                        "hover:bg-raised hover:text-fg peer-checked:bg-game peer-checked:text-game-ink peer-checked:shadow-none",
                        "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-fg",
                      )}
                    >
                      {r.value}
                    </span>
                  </label>
                ))}
              </div>
              <div className="type-caption mt-2.5 flex justify-between gap-4 text-fg-subtle">
                <span>Not for me</span>
                <span>Loved it</span>
              </div>
              <p aria-live="polite" className="type-body mt-3 min-h-[1.55em] font-semibold text-game">
                {ratingWord}
              </p>
            </fieldset>

            {/* Only when it went badly: what to fix. */}
            <AnimatePresence initial={false}>
              {low ? (
                <motion.div
                  key="improve"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto", transition: { duration: 0.35, ease: EASE_OUT } }}
                  exit={{ opacity: 0, height: 0, transition: { duration: 0.25, ease: EASE_OUT } }}
                  className="-mt-6 overflow-hidden"
                >
                  <div className="flex flex-col gap-5 rounded-xl bg-surface p-5 shadow-ring sm:p-6">
                    <div className="flex flex-col gap-1">
                      <h2 className="type-title-3 text-fg">What should we fix?</h2>
                      <p className="type-small text-fg-subtle">Pick any that fit.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {ISSUES.map((issue) => (
                        <ToggleChip
                          key={issue.id}
                          pressed={issues.includes(issue.id)}
                          onClick={() => toggleIssue(issue.id)}
                          className="whitespace-normal text-left max-sm:h-auto max-sm:min-h-10 max-sm:py-2"
                        >
                          {issue.label}
                        </ToggleChip>
                      ))}
                    </div>
                    <div className="flex flex-col gap-2">
                      <label htmlFor={`${id}-comment`} className="type-body font-semibold text-fg">
                        Anything else? <span className="font-medium text-fg-subtle">(optional)</span>
                      </label>
                      <textarea
                        id={`${id}-comment`}
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        maxLength={COMMENT_MAX}
                        rows={3}
                        placeholder="What didn't work for you?"
                        className="min-h-24 w-full resize-y rounded-lg bg-sunken px-5 py-4 text-[1.0625rem] font-medium leading-normal text-fg shadow-ring outline-none transition-shadow duration-150 placeholder:text-fg-faint focus:shadow-[0_0_0_2px_var(--color-fg)]"
                      />
                    </div>
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>

            {/* Hidden from people; bots fill it in. */}
            <input
              type="text"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden
              value={trap}
              onChange={(e) => setTrap(e.target.value)}
              className="absolute -left-[9999px] size-px opacity-0"
            />

            <div className="flex flex-col gap-3">
              <Button type="submit" variant="game" size="lg" arrow loading={sending} className="w-full sm:w-auto sm:self-start">
                Send feedback
              </Button>
              <p role="alert" className="type-small min-h-[1.45em] font-medium text-danger">
                {error}
              </p>
            </div>
          </motion.form>
        )}
      </AnimatePresence>
    </main>
  );
}

function ThankYou({ name, low }: { name: string; low: boolean }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus({ preventScroll: true }), []);
  const first = name.split(" ")[0];

  return (
    <motion.section
      initial={entrance({ opacity: 0, y: 12 })}
      animate={{ opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE_OUT } }}
      className="flex flex-1 flex-col items-start gap-6 pt-[8vh]"
    >
      <motion.span
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", duration: 0.5, bounce: 0.25, delay: 0.1 }}
        className="grid size-16 place-items-center rounded-full bg-game text-game-ink"
      >
        <Check aria-hidden strokeWidth={2.5} className="size-7" />
      </motion.span>
      <h1 ref={heading} tabIndex={-1} className="type-display-2 text-fg outline-none">
        {first ? `Thank you, ${first}.` : "Thank you."}
      </h1>
      <p className="type-body-lg max-w-[30rem] text-fg-muted">
        {low
          ? "Sorry it didn't land. We read every answer, and yours tells us what to fix first."
          : "We read every answer. It helps us make the games better for the next person in line."}
      </p>
      <ButtonLink href="/" variant="secondary" size="lg" className="mt-2">
        Back to the arcade
      </ButtonLink>
    </motion.section>
  );
}
