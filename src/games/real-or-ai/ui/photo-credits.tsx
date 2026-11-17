import { ChevronDown } from "lucide-react";
import type { ActiveQuestion, PhotoCredit } from "../engine/types";

/** Only what was recorded. Anything missing is said plainly, never guessed. */
export function creditLine(credit: PhotoCredit): string {
  if (!credit.source) return "Source and photographer not recorded.";
  const parts = [credit.author ?? "Photographer not recorded", credit.source];
  if (credit.file) parts.push(`"${credit.file}"`);
  parts.push(credit.license ?? "licence not recorded");
  return `${parts.join(", ")}.`;
}

export const AI_VERSION_LINE = "AI-edited from the real photo.";

/**
 * Honest credits behind a native disclosure (keyboard and screen reader
 * friendly for free). Lists the six pairs this visitor played.
 */
export function PhotoCredits({ questions }: { questions: readonly ActiveQuestion[] }) {
  return (
    <details className="group rounded-lg bg-surface shadow-ring">
      <summary
        className={
          "flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 rounded-lg px-5 py-3 [&::-webkit-details-marker]:hidden " +
          "transition-colors duration-150 ease-out hover:bg-fg/[0.03] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg"
        }
      >
        <span className="type-body font-semibold text-fg">Photo credits</span>
        <ChevronDown
          aria-hidden
          className="size-5 shrink-0 text-fg-muted transition-transform duration-150 ease-out group-open:rotate-180 motion-reduce:transition-none"
        />
      </summary>
      <div className="flex flex-col gap-3 px-5 pb-5">
        <p className="type-small max-w-[40rem] text-fg-subtle">
          Most real photos come from Wikimedia Commons. Each AI version was made from the real photo beside it.
        </p>
        <ul className="flex flex-col divide-y divide-line">
          {questions.map((q) => (
            <li key={q.pair.id} className="flex flex-col gap-1 py-3">
              <span className="type-small font-semibold text-fg">{q.pair.subject}</span>
              <span className="type-small text-fg-muted">Real photo: {creditLine(q.pair.realItem.credit)}</span>
              <span className="type-small text-fg-muted">
                AI version: {AI_VERSION_LINE}{" "}
                {q.pair.aiItem.contentCredentials
                  ? "Its Content Credentials say it was created by Google generative AI."
                  : "The tool used wasn't recorded."}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}
