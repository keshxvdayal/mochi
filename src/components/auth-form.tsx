"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { Eye, EyeOff, Heart, Loader2 } from "lucide-react";
import type { AuthState } from "@/app/(auth)/actions";
import { Companion } from "@/components/companion/companion";
import { btn, field } from "@/components/ui";
import { setMood } from "@/lib/companion-state";

type Mode = "signin" | "signup";

const COPY = {
  signin: {
    hello: "Hey, you're back! I missed you. Sign in and let's pick up where we left off.",
    title: "Welcome back",
    sub: "Your companion has been waiting for you.",
    cta: "Sign in",
    switchText: "New here?",
    switchLink: "Create an account",
    switchHref: "/signup",
  },
  signup: {
    hello: "Hiii! I'm so happy you're here. Make an account and I'll be all yours.",
    title: "Make a new friend",
    sub: "A cute companion that gets to know you and helps with your life.",
    cta: "Create my account",
    switchText: "Already have an account?",
    switchLink: "Sign in",
    switchHref: "/signin",
  },
} as const;

export function AuthForm({ mode, action, next }: { mode: Mode; action: (s: AuthState, f: FormData) => Promise<AuthState>; next?: string }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [show, setShow] = useState(false);
  const copy = COPY[mode];

  useEffect(() => {
    setMood(mode === "signup" ? "excited" : "happy");
  }, [mode]);
  useEffect(() => {
    if (state?.error) setMood("worried");
  }, [state]);

  return (
    <div className="mx-auto grid min-h-screen max-w-5xl items-center gap-6 px-4 py-8 lg:grid-cols-[1fr_1fr]">
      <div className="relative h-[34vh] min-h-[260px] lg:h-[70vh]">
        <div className="absolute inset-x-4 top-2 z-10 flex justify-center">
          <p className="pop max-w-sm rounded-3xl bg-white/95 px-5 py-3 text-center text-[16px] font-bold leading-snug shadow-lg">
            {state?.error ? "Oops! Let's fix that together." : copy.hello}
          </p>
        </div>
        <div className="absolute inset-x-0 bottom-0 top-16">
          <Companion color="peach" eyeColor="violet" />
        </div>
      </div>

      <div className="glass rounded-[2rem] p-6 sm:p-8">
        <div className="mb-6 flex items-center gap-2">
          <span className="candy grid h-10 w-10 place-items-center rounded-2xl text-white shadow">
            <Heart className="h-5 w-5 fill-white" />
          </span>
          <span className="text-xl font-extrabold tracking-tight">Mochi</span>
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight">{copy.title}</h1>
        <p className="mt-1 text-muted">{copy.sub}</p>

        <form
          action={(form) => {
            // So "today", greetings and reminders follow their clock, not the server's.
            form.set("timezone", Intl.DateTimeFormat().resolvedOptions().timeZone ?? "");
            formAction(form);
          }}
          className="mt-6 space-y-4"
        >
          {next && <input type="hidden" name="next" value={next} />}
          {mode === "signup" && (
            <label className="block space-y-1.5">
              <span className="text-sm font-bold">Your name</span>
              <input name="name" className={field} defaultValue={state?.fields?.name} autoComplete="given-name" required maxLength={60} placeholder="What should your companion call you?" />
            </label>
          )}
          <label className="block space-y-1.5">
            <span className="text-sm font-bold">Email</span>
            <input name="email" type="email" className={field} defaultValue={state?.fields?.email} autoComplete="email" required placeholder="you@example.com" />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-bold">Password</span>
            <span className="relative block">
              <input
                name="password"
                type={show ? "text" : "password"}
                className={`${field} pr-12`}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                required
                minLength={mode === "signup" ? 8 : 1}
                placeholder={mode === "signup" ? "At least 8 characters" : "Your password"}
              />
              <button type="button" onClick={() => setShow(!show)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-xl p-2 text-muted hover:text-grape" aria-label={show ? "Hide password" : "Show password"}>
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </span>
          </label>

          {state?.error && <p className="pop rounded-2xl bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700" role="alert">{state.error}</p>}

          <button type="submit" disabled={pending} className={`${btn.candy} w-full py-3 text-base`}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />} {copy.cta}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-muted">
          {copy.switchText}{" "}
          <Link href={copy.switchHref + (next ? `?next=${encodeURIComponent(next)}` : "")} className="font-bold text-grape hover:underline">
            {copy.switchLink}
          </Link>
        </p>
        <p className="mt-3 text-center text-xs text-muted">Everything you share is private to your account.</p>
      </div>
    </div>
  );
}
