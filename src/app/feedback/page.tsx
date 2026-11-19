import type { Metadata } from "next";
import Link from "next/link";
import { SpectrumMark } from "@/components/hub/spectrum-mark";
import { isGameSlug } from "@/content/feedback";
import { FeedbackForm } from "./feedback-form";

export const metadata: Metadata = {
  title: "Feedback",
  description: "One tap to tell us how the game went.",
  robots: { index: false, follow: false },
};

/** Reached from the QR code on each game's result screen: /feedback?game=<slug>. */
export default async function FeedbackPage({ searchParams }: PageProps<"/feedback">) {
  const { game } = await searchParams;
  const initialGame = isGameSlug(game) ? game : null;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex h-16 w-full max-w-[36rem] items-center px-4 pt-[env(safe-area-inset-top)] sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-3 rounded-full focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-fg"
        >
          <SpectrumMark />
          <span className="text-[0.9375rem] font-semibold tracking-[-0.01em] text-fg">Beyond the Algorithm</span>
        </Link>
      </header>
      <FeedbackForm initialGame={initialGame} />
    </div>
  );
}
