import type { Metadata } from "next";
import { SpectrumMark } from "@/components/hub/spectrum-mark";
import { fetchAllFeedback, fetchAllVisits } from "@/lib/feedback-admin";
import { isSignedIn, signOut } from "./auth";
import { Dashboard } from "./dashboard";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Responses",
  robots: { index: false, follow: false },
};

/** Private: every visitor's feedback, behind the team password. Never linked from the site. */
export default async function ResponsesPage() {
  if (!(await isSignedIn())) return <LoginForm />;

  const [result, visits] = await Promise.all([fetchAllFeedback(), fetchAllVisits()]);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex h-16 w-full max-w-[1200px] items-center justify-between gap-4 px-4 pt-[env(safe-area-inset-top)] sm:px-6 lg:px-8">
        <span className="flex items-center gap-3">
          <SpectrumMark />
          <span className="text-[0.9375rem] font-semibold tracking-[-0.01em] text-fg">Beyond the Algorithm</span>
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

      {result.ok ? (
        <Dashboard
          entries={result.entries}
          fetchedAt={result.fetchedAt}
          visits={visits.ok ? visits.visits : null}
          visitsError={visits.ok ? undefined : visits.message}
        />
      ) : (
        <main className="mx-auto flex w-full max-w-[40rem] flex-1 flex-col gap-4 px-4 pt-16 sm:px-6">
          <span className="type-label text-danger">{"Can't read feedback"}</span>
          <h1 className="type-title-1 text-fg">
            {result.reason === "no-key" ? "The server has no Firebase key yet" : "Firestore didn't answer"}
          </h1>
          <p className="type-body text-fg-muted">
            {result.reason === "no-key"
              ? "Add the Firebase service-account JSON to Vercel as FIREBASE_SERVICE_ACCOUNT (Project settings, Environment variables), then redeploy."
              : "Reload in a moment. If it keeps happening, the service-account key may be wrong or revoked."}
          </p>
          <pre className="type-label overflow-x-auto whitespace-pre-wrap rounded-md bg-sunken p-4 text-fg-subtle shadow-ring">
            {result.message}
          </pre>
        </main>
      )}
    </div>
  );
}
