import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[1200px] flex-col justify-center gap-6 px-6">
      <h1 className="type-display-1">Beyond the Algorithm</h1>
      <Link href="/design" className="type-body text-fg-muted underline underline-offset-4">
        Design system
      </Link>
    </main>
  );
}
