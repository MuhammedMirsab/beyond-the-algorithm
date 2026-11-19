"use client";

import { LockKeyhole } from "lucide-react";
import { useActionState } from "react";
import { SpectrumMark } from "@/components/hub/spectrum-mark";
import { Button } from "@/components/ui/button";
import { signIn } from "./auth";

export function LoginForm() {
  const [state, action, pending] = useActionState(signIn, { error: null });

  return (
    <main className="grid min-h-dvh place-items-center px-4 py-12">
      <form action={action} className="flex w-full max-w-[24rem] flex-col gap-8">
        <div className="flex flex-col items-start gap-5">
          <span className="grid size-14 place-items-center rounded-full bg-surface shadow-ring">
            <SpectrumMark size={26} />
          </span>
          <div className="flex flex-col gap-2">
            <span className="type-label enter text-fg-subtle">Team only</span>
            <h1 className="type-title-1 enter text-fg [--enter-delay:60ms]">Visitor feedback</h1>
            <p className="type-body enter text-fg-muted [--enter-delay:120ms]">
              Every answer from the feedback form at EDEX. Enter the team password to read them.
            </p>
          </div>
        </div>

        <div className="enter flex flex-col gap-3 [--enter-delay:180ms]">
          <label htmlFor="password" className="type-body font-semibold text-fg">
            Password
          </label>
          <div className="relative">
            <LockKeyhole aria-hidden className="pointer-events-none absolute left-5 top-1/2 size-[18px] -translate-y-1/2 text-fg-subtle" />
            <input
              id="password"
              name="password"
              type="password"
              required
              autoFocus
              autoComplete="current-password"
              aria-invalid={state.error ? true : undefined}
              aria-describedby="password-error"
              className="h-14 w-full min-w-0 rounded-full bg-sunken pl-12 pr-6 text-[1.0625rem] font-medium text-fg shadow-ring outline-none transition-shadow duration-150 placeholder:text-fg-faint focus:shadow-[0_0_0_2px_var(--color-fg)]"
            />
          </div>
          <p id="password-error" role="alert" className="type-small min-h-[1.45em] font-medium text-danger">
            {state.error}
          </p>
        </div>

        <Button type="submit" size="lg" arrow loading={pending} className="enter w-full [--enter-delay:240ms]">
          Open responses
        </Button>
      </form>
    </main>
  );
}
