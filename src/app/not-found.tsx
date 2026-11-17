import { ButtonLink } from "@/components/ui/button";
import { SpectrumMark } from "@/components/hub/spectrum-mark";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[40rem] flex-col items-start justify-center gap-6 px-4 sm:px-6">
      <SpectrumMark size={36} />
      <span className="type-label text-fg-subtle">404 · Page not found</span>
      <h1 className="type-display-2 text-fg">This game isn&apos;t in the arcade.</h1>
      <p className="type-body-lg text-fg-muted">The link may be mistyped, or the game has moved. All nine games are on the home screen.</p>
      <ButtonLink href="/" size="lg" arrow>
        Back to the arcade
      </ButtonLink>
    </main>
  );
}
