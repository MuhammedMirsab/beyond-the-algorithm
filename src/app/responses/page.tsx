import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Gamepad2, MessageSquareText } from "lucide-react";
import { SpectrumMark } from "@/components/hub/spectrum-mark";
import { fetchAllFeedback, fetchAllPlays, fetchAllVisits } from "@/lib/feedback-admin";
import { cn } from "@/lib/cn";
import { isSignedIn, signOut } from "./auth";
import { Dashboard } from "./dashboard";
import { LoginForm } from "./login-form";
import { PlaysDashboard } from "./plays-dashboard";

export const metadata: Metadata = {
  title: "Responses",
  robots: { index: false, follow: false },
};

type Tab = "games" | "feedback";

/**
 * Private: how people played and what they said, behind the team password.
 * Never linked from the site. Each tab reads only its own collections, so a
 * look at one doesn't spend Firestore reads on the other.
 */
export default async function ResponsesPage({ searchParams }: PageProps<"/responses">) {
  if (!(await isSignedIn())) return <LoginForm />;

  const { tab: raw } = await searchParams;
  const tab: Tab = raw === "feedback" ? "feedback" : "games";

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex h-16 w-full max-w-[1200px] items-center justify-between gap-4 px-4 pt-[env(safe-area-inset-top)] sm:px-6 lg:px-8">
        <span className="flex min-w-0 items-center gap-3">
          <SpectrumMark />
          <span className="truncate text-[0.9375rem] font-semibold tracking-[-0.01em] text-fg">Beyond the Algorithm</span>
          <span className="type-label hidden text-fg-subtle sm:inline">· responses</span>
        </span>
        <form action={signOut}>
          <button
            type="submit"
            className="h-9 rounded-full px-4 text-[0.875rem] font-semibold text-fg-muted transition-colors duration-150 hover:bg-fg/[0.06] hover:text-fg focus-visible:outline-2 focus-visible:outline-fg"
          >
            Sign out
          </button>
        </form>
      </header>

      <nav aria-label="Sections" className="mx-auto w-full max-w-[1200px] px-4 pt-2 sm:px-6 lg:px-8">
        <div className="inline-flex h-12 items-center gap-1 rounded-full bg-surface p-1 shadow-ring">
          <TabLink href="/responses" active={tab === "games"} icon={<Gamepad2 />}>
            Game analytics
          </TabLink>
          <TabLink href="/responses?tab=feedback" active={tab === "feedback"} icon={<MessageSquareText />}>
            Feedback
          </TabLink>
        </div>
      </nav>

      {tab === "games" ? <GamesTab /> : <FeedbackTab />}
    </div>
  );
}

function TabLink({ href, active, icon, children }: { href: string; active: boolean; icon: ReactNode; children: ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-full px-4 text-[0.9375rem] font-semibold transition-colors duration-150 [&_svg]:size-4",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg",
        active ? "bg-fg text-canvas" : "text-fg-muted hover:text-fg",
      )}
    >
      {icon}
      {children}
    </Link>
  );
}

async function GamesTab() {
  const plays = await fetchAllPlays();
  if (!plays.ok) return <ReadError reason={plays.reason} message={plays.message} what="game analytics" />;
  return <PlaysDashboard sessions={plays.sessions} docs={plays.docs} fetchedAt={plays.fetchedAt} />;
}

async function FeedbackTab() {
  const [result, visits] = await Promise.all([fetchAllFeedback(), fetchAllVisits()]);
  if (!result.ok) return <ReadError reason={result.reason} message={result.message} what="feedback" />;
  return (
    <Dashboard
      entries={result.entries}
      fetchedAt={result.fetchedAt}
      visits={visits.ok ? visits.visits : null}
      visitsError={visits.ok ? undefined : visits.message}
    />
  );
}

function ReadError({ reason, message, what }: { reason: "no-key" | "error"; message: string; what: string }) {
  return (
    <main className="mx-auto flex w-full max-w-[40rem] flex-1 flex-col gap-4 px-4 pt-16 sm:px-6">
      <span className="type-label text-danger">{`Can't read ${what}`}</span>
      <h1 className="type-title-1 text-fg">{reason === "no-key" ? "The server has no Firebase key yet" : "Firestore didn't answer"}</h1>
      <p className="type-body text-fg-muted">
        {reason === "no-key"
          ? "Add the Firebase service-account JSON to Vercel as FIREBASE_SERVICE_ACCOUNT (Project settings, Environment variables), then redeploy."
          : "Reload in a moment. If it keeps happening, the service-account key may be wrong or revoked."}
      </p>
      <pre className="type-label overflow-x-auto whitespace-pre-wrap rounded-md bg-sunken p-4 text-fg-subtle shadow-ring">{message}</pre>
    </main>
  );
}
