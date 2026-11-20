"use client";

import { AnimatePresence, motion } from "motion/react";
import { Check } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { GameGlyph } from "@/components/art/game-glyph";
import { Button, ButtonLink } from "@/components/ui/button";
import { ToggleChip } from "@/components/ui/chip";
import { COMMENT_MAX, ISSUES, LOW_RATING, parseFeedback, RATINGS, type IssueId, type Rating } from "@/content/feedback";
import { GAMES, type GameSlug } from "@/content/games";
import { entrance } from "@/lib/entrance";
import { getDb } from "@/lib/firebase";
import { VisitTracker } from "@/lib/visit-tracker";
import { cn } from "@/lib/cn";

const EASE_OUT = [0.22, 1, 0.36, 1] as const;
const SEND_TIMEOUT_MS = 12_000;

/** Native radios and checkboxes, visually hidden: the label is the control people see and tap. */
const hiddenInput = "peer sr-only";

/** The one open question, asked differently depending on the rating. */
function commentCopy(rating: Rating) {
  if (rating <= LOW_RATING) return { label: "Anything else?", placeholder: "What didn't work for you?" };
  if (rating === 3) return { label: "What would make it better?", placeholder: "One thing we could change." };
  return { label: "What was the best part?", placeholder: "Or one thing we should fix." };
}

const textareaStyles =
  "min-h-24 w-full resize-y rounded-lg bg-sunken px-5 py-4 text-[1.0625rem] font-medium leading-normal text-fg shadow-ring outline-none transition-shadow duration-150 placeholder:text-fg-faint focus:shadow-[0_0_0_2px_var(--color-fg)]";

const reveal = {
  initial: { opacity: 0, height: 0 },
  animate: { opacity: 1, height: "auto", transition: { duration: 0.35, ease: EASE_OUT } },
  exit: { opacity: 0, height: 0, transition: { duration: 0.25, ease: EASE_OUT } },
} as const;

/**
 * One tap first (the rating), everything else after and optional. No name:
 * answers are anonymous. Each step is also reported to /api/track, so a
 * rating counts even when the visitor walks off before pressing Send.
 */
export function FeedbackForm({ initialGame }: { initialGame: GameSlug | null }) {
  const id = useId();
  // The game whose QR code was scanned starts picked; visitors add any others they played.
  const [games, setGames] = useState<GameSlug[]>(initialGame ? [initialGame] : []);
  const [rating, setRating] = useState<Rating | null>(null);
  const [issues, setIssues] = useState<IssueId[]>([]);
  const [comment, setComment] = useState("");
  const [trap, setTrap] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const tracker = useRef<VisitTracker | null>(null);
  const typedLength = useRef(0);

  useEffect(() => {
    const t = new VisitTracker(initialGame ?? "");
    tracker.current = t;
    return () => {
      t.stop();
      if (tracker.current === t) tracker.current = null;
    };
  }, [initialGame]);

  const low = rating !== null && rating <= LOW_RATING;
  const ratingWord = rating ? RATINGS.find((r) => r.value === rating)?.word : null;
  const scanned = initialGame ? GAMES.find((g) => g.slug === initialGame) : undefined;
  // With a scanned game, the others are optional extras; without one, the visitor must say which.
  const otherGames = scanned ? GAMES.filter((g) => g.slug !== scanned.slug) : GAMES;
  // The page takes the colour of the first game picked (the scanned one, when there is one).
  const accent = games[0];

  const pickRating = (value: Rating) => {
    setRating(value);
    if (error) setError(null);
    const t = tracker.current;
    if (t) {
      t.update({ rating: value, ratedMs: t.summary.ratedMs ?? t.now() });
      t.event("rate", value);
    }
  };

  const toggleGame = (slug: GameSlug) => {
    const next = games.includes(slug) ? games.filter((g) => g !== slug) : [...games, slug];
    setGames(next);
    if (error) setError(null);
    tracker.current?.update({ games: next });
    tracker.current?.event("game", slug);
  };

  const toggleIssue = (issue: IssueId) => {
    const next = issues.includes(issue) ? issues.filter((i) => i !== issue) : [...issues, issue];
    setIssues(next);
    tracker.current?.update({ issues: next });
    tracker.current?.event("issue", issue);
  };

  const commentBlur = () => {
    const length = comment.trim().length;
    if (length === typedLength.current) return;
    typedLength.current = length;
    tracker.current?.event("type", length);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (sending) return;
    const t = tracker.current;
    if (games.length === 0 || !rating) {
      setError(!rating ? "Tap a number from 1 to 5 first." : "Tick the game you played.");
      t?.event("invalid", !rating ? "rating" : "games");
      return;
    }
    setError(null);
    // A hidden field people never see: anything in it is a bot, so pretend it worked.
    if (trap) {
      setSent(true);
      return;
    }
    // `name` stays in the record (always empty now) so the Firestore rules and older answers line up.
    const input = parseFeedback({ name: "", games, from: initialGame ?? "", rating, issues, comment });
    if (!input) {
      setError("Tap a rating and tick a game.");
      return;
    }
    setSending(true);
    try {
      const [db, fs] = await Promise.all([getDb(), import("firebase/firestore")]);
      // Pick the id first, so the tracking can point at this answer.
      const ref = fs.doc(fs.collection(db, "feedback"));
      if (t) {
        t.update({ commentLen: input.comment.length, issues: input.issues, games: input.games, sendMs: t.now() });
        t.event("send", ref.id, true);
      }
      const write = fs.setDoc(ref, { ...input, at: fs.serverTimestamp() });
      // Firestore waits for the server; on no signal, say so instead of spinning forever.
      await Promise.race([
        write,
        new Promise((_, reject) => window.setTimeout(() => reject(new Error("timeout")), SEND_TIMEOUT_MS)),
      ]);
      t?.sent(ref.id);
      setSent(true);
    } catch (err) {
      if (t) {
        t.update({ fails: t.summary.fails + 1 });
        t.event("fail", err instanceof Error && err.message === "timeout" ? "timeout" : "error", true);
      }
      setError("It didn't send. Check your internet and try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <main data-game={accent} className="mx-auto flex w-full max-w-[36rem] flex-1 flex-col px-4 pb-[calc(3rem+env(safe-area-inset-bottom))] pt-6 sm:px-6 sm:pt-10">
      <AnimatePresence mode="wait" initial={false}>
        {sent ? (
          <ThankYou key="thanks" low={low} onAgain={() => tracker.current?.event("again", undefined, true)} />
        ) : (
          <motion.form
            key="form"
            onSubmit={submit}
            noValidate
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
            className="flex flex-col gap-10"
          >
            {/* 1. The one tap. */}
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-3">
                <span className="type-label enter text-fg-subtle">Feedback</span>
                <h1 id={`${id}-q`} className="type-display-2 enter text-fg [--enter-delay:60ms]">
                  {scanned ? `How was ${scanned.short}?` : "How was it?"}
                </h1>
                <p className="type-body-lg enter text-fg-muted [--enter-delay:120ms]">Tap a number. Be honest, we can take it.</p>
              </div>
              <fieldset aria-labelledby={`${id}-q`} className="enter [--enter-delay:180ms]">
                <div className="grid grid-cols-5 gap-2">
                  {RATINGS.map((r) => (
                    <label key={r.value} className="relative cursor-pointer">
                      <input
                        type="radio"
                        name={`${id}-rating`}
                        value={r.value}
                        checked={rating === r.value}
                        onChange={() => pickRating(r.value)}
                        aria-label={`${r.value} of 5, ${r.word.toLowerCase()}`}
                        className={hiddenInput}
                      />
                      <span
                        className={cn(
                          "grid h-20 place-items-center rounded-lg bg-surface text-[1.75rem] font-bold tabular-nums text-fg-muted shadow-ring sm:h-24",
                          "transition-[background-color,color,box-shadow,scale] duration-150 ease-out active:scale-[0.94]",
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
            </div>

            {/* 2. Everything else, once they've tapped. */}
            <AnimatePresence initial={false}>
              {rating !== null ? (
                <motion.div key="more" {...reveal} className="-mt-6 overflow-hidden">
                  <div className="flex flex-col gap-10 pt-1">
                    {/* Without a scanned game we need to know which one; ask that first. */}
                    {!scanned ? (
                      <GamePicker
                        id={id}
                        label="Which game did you play?"
                        hint="Tick every one you tried."
                        options={otherGames}
                        picked={games}
                        onToggle={toggleGame}
                      />
                    ) : null}

                    <AnimatePresence initial={false}>
                      {low ? (
                        <motion.fieldset key="issues" {...reveal} className="-mt-4 flex flex-col overflow-hidden">
                          <legend className="mb-3 flex flex-col gap-1 pt-4">
                            <span className="type-title-3 text-fg">What went wrong?</span>
                            <span className="type-small text-fg-subtle">Tap any that fit.</span>
                          </legend>
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
                        </motion.fieldset>
                      ) : null}
                    </AnimatePresence>

                    <div className="flex flex-col gap-2">
                      <label htmlFor={`${id}-comment`} className="type-title-3 text-fg">
                        {commentCopy(rating).label} <span className="font-medium text-fg-subtle">(optional)</span>
                      </label>
                      <textarea
                        id={`${id}-comment`}
                        value={comment}
                        onChange={(e) => {
                          setComment(e.target.value);
                          tracker.current?.update({ commentLen: e.target.value.trim().length });
                        }}
                        onBlur={commentBlur}
                        maxLength={COMMENT_MAX}
                        rows={3}
                        placeholder={commentCopy(rating).placeholder}
                        className={textareaStyles}
                      />
                    </div>

                    {scanned ? (
                      <GamePicker
                        id={id}
                        label="Played any others?"
                        hint="Optional. Tick them and this counts for those too."
                        options={otherGames}
                        picked={games}
                        onToggle={toggleGame}
                      />
                    ) : null}

                    <div className="flex flex-col gap-3">
                      <Button type="submit" variant="game" size="lg" arrow loading={sending} className="w-full sm:w-auto sm:self-start">
                        Send
                      </Button>
                      <p role="alert" className="type-small min-h-[1.45em] font-medium text-danger">
                        {error}
                      </p>
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
          </motion.form>
        )}
      </AnimatePresence>
    </main>
  );
}

function GamePicker({
  id,
  label,
  hint,
  options,
  picked,
  onToggle,
}: {
  id: string;
  label: string;
  hint: string;
  options: readonly (typeof GAMES)[number][];
  picked: GameSlug[];
  onToggle: (slug: GameSlug) => void;
}) {
  return (
    <fieldset className="flex flex-col">
      <legend className="mb-3 flex flex-col gap-1">
        <span className="type-title-3 text-fg">{label}</span>
        <span className="type-small text-fg-subtle">{hint}</span>
      </legend>
      <div className="grid grid-cols-2 gap-2 max-[359px]:grid-cols-1">
        {options.map((g) => {
          const on = picked.includes(g.slug);
          return (
            <label key={g.slug} data-game={g.slug} className="relative cursor-pointer">
              <input type="checkbox" name={`${id}-games`} value={g.slug} checked={on} onChange={() => onToggle(g.slug)} className={hiddenInput} />
              <span
                className={cn(
                  "flex h-full min-h-14 items-center gap-3 rounded-md bg-surface px-3.5 py-2.5 text-left shadow-ring",
                  "transition-[background-color,box-shadow,scale] duration-150 ease-out active:scale-[0.98]",
                  "hover:bg-raised peer-checked:bg-game-soft peer-checked:shadow-[inset_0_0_0_2px_var(--color-game)]",
                  "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-fg",
                )}
              >
                <GameGlyph slug={g.slug} className="size-5 shrink-0 text-game" />
                <span className="min-w-0 flex-1 text-[0.9375rem] font-semibold leading-tight text-fg">{g.short}</span>
              </span>
              {/* A tick on the corner, so several picks read as several picks without costing width. */}
              {on ? (
                <span
                  aria-hidden
                  className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-game text-game-ink ring-[3px] ring-canvas"
                >
                  <Check strokeWidth={3} className="size-3" />
                </span>
              ) : null}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function ThankYou({ low, onAgain }: { low: boolean; onAgain: () => void }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus({ preventScroll: true }), []);

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
        Thank you.
      </h1>
      <p className="type-body-lg max-w-[30rem] text-fg-muted">
        {low
          ? "Sorry it didn't land. We read every answer, and yours tells us what to fix first."
          : "We read every answer. It helps us make the games better for the next person in line."}
      </p>
      <ButtonLink href="/" variant="game" size="lg" arrow onClick={onAgain} className="mt-2 max-sm:w-full">
        Try the other games
      </ButtonLink>
    </motion.section>
  );
}
