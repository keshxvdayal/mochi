import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Brain, CalendarCheck, Footprints, Heart, LineChart, Lock, Mic, Sparkles, Target } from "lucide-react";
import { LandingHero } from "@/components/landing-hero";
import { btn } from "@/components/ui";
import { currentUserId } from "@/lib/session";
import { LIFE_STAGES } from "@/lib/types";

export const metadata: Metadata = {
  title: "Mochi · a cute companion that gets to know you",
  description: "Talk to Mochi out loud. It remembers your life, plans your day, keeps your habits going and cheers you on.",
};

const FEATURES = [
  { icon: Mic, title: "Talk out loud", text: "Hold the mic and just talk. Mochi answers in a warm, natural voice that matches how it feels." },
  { icon: Brain, title: "Remembers you", text: "Your goals, your people, what's coming up. It follows up like a friend would: “how did the interview go?”" },
  { icon: Footprints, title: "Always by your side", text: "A tiny Mochi hops along every page, notices what you're doing and cheers you on as you go." },
  { icon: CalendarCheck, title: "Plans your day", text: "Time-blocked plans around your routine, tasks with steps, and challenges that earn XP." },
  { icon: Target, title: "Goals & habits", text: "Daily habits with streaks, goals with milestones, and a nudge when something slips." },
  { icon: LineChart, title: "Honest insights", text: "What you're doing right, what needs attention, and your mood across the week." },
];

const STEPS = [
  { n: "1", title: "Make an account", text: "Just a name, email and password. Free." },
  { n: "2", title: "Mochi gets to know you", text: "It asks you a few questions, one at a time, like a new friend would." },
  { n: "3", title: "Talk, plan, grow", text: "Chat or talk out loud. Mochi plans, reminds, celebrates and remembers." },
];

const FAQ = [
  { q: "Is it free?", a: "Yes. Make an account and start talking." },
  { q: "Is my data private?", a: "Everything you share stays in your own account. Your messages are sent to Google's Gemini AI to write Mochi's replies." },
  { q: "Do I need to install anything?", a: "No. It runs in your browser, on phones and computers. Voice input works in Chrome, Edge and Safari." },
  { q: "Is it a therapist?", a: "No. Mochi is a friendly companion. If you're ever in danger, it will point you to people who can help right away." },
];

export default async function Landing() {
  const signedIn = Boolean(await currentUserId());
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 px-3 pt-3 sm:px-6">
        <nav className="glass mx-auto flex max-w-6xl items-center gap-3 rounded-3xl px-4 py-2.5">
          <Link href="/" className="flex items-center gap-2">
            <span className="candy grid h-9 w-9 place-items-center rounded-2xl text-white shadow">
              <Heart className="h-4 w-4 fill-white" />
            </span>
            <span className="text-lg font-extrabold tracking-tight">Mochi</span>
          </Link>
          <div className="ml-4 hidden gap-1 sm:flex">
            <a href="#features" className={btn.ghost}>Features</a>
            <a href="#how" className={btn.ghost}>How it works</a>
            <a href="#faq" className={btn.ghost}>FAQ</a>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {signedIn ? (
              <Link href="/home" className={btn.candy}>
                Open Mochi <ArrowRight className="h-4 w-4" />
              </Link>
            ) : (
              <>
                <Link href="/signin" className={btn.ghost}>Sign in</Link>
                <Link href="/signup" className={btn.candy}>Sign up</Link>
              </>
            )}
          </div>
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-4 sm:px-6">
        <section className="grid items-center gap-8 py-10 lg:grid-cols-[1.1fr_1fr] lg:py-16">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-extrabold text-violet-700 shadow-sm ring-1 ring-violet-100">
              <Sparkles className="h-3.5 w-3.5" /> Your new tiny best friend
            </span>
            <h1 className="mt-4 text-4xl font-extrabold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
              A cute companion that <span className="candy-text">actually gets to know you.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg text-muted">
              Mochi lives in your browser. Talk to it out loud and it remembers your life, plans your day, keeps your habits going and cheers you on, like a best friend
              who&apos;s also great at getting things done.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href={signedIn ? "/home" : "/signup"} className={`${btn.candy} px-6 py-3 text-base`}>
                {signedIn ? "Open Mochi" : "Meet your Mochi"} <ArrowRight className="h-4 w-4" />
              </Link>
              {!signedIn && (
                <Link href="/signin" className={`${btn.soft} px-6 py-3 text-base`}>
                  I already have one
                </Link>
              )}
            </div>
            <p className="mt-4 text-sm text-muted">Free · works on your phone · for students, workers, parents, founders and everyone in between</p>
          </div>
          <div className="glass rounded-[2.5rem] p-4 pb-6">
            <LandingHero />
          </div>
        </section>

        <section id="features" className="scroll-mt-24 py-12">
          <h2 className="text-center text-3xl font-extrabold tracking-tight">What Mochi does for you</h2>
          <p className="mx-auto mt-2 max-w-xl text-center text-muted">Part best friend, part coach. It feels things, it shows it, and it&apos;s always on your side.</p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <div key={title} className="glass rounded-3xl p-6">
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-violet-50 text-violet-600">
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="mt-4 text-lg font-extrabold">{title}</h3>
                <p className="mt-1 text-[15px] text-muted">{text}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="how" className="scroll-mt-24 py-12">
          <h2 className="text-center text-3xl font-extrabold tracking-tight">How it works</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.n} className="glass rounded-3xl p-6">
                <span className="candy grid h-10 w-10 place-items-center rounded-2xl text-lg font-extrabold text-white">{s.n}</span>
                <h3 className="mt-4 text-lg font-extrabold">{s.title}</h3>
                <p className="mt-1 text-[15px] text-muted">{s.text}</p>
              </div>
            ))}
          </div>
          <div className="mt-8 flex flex-wrap justify-center gap-2">
            {Object.values(LIFE_STAGES).map((l) => (
              <span key={l.label} className="rounded-full bg-white px-3 py-1.5 text-sm font-bold shadow-sm ring-1 ring-line">
                {l.emoji} {l.label}
              </span>
            ))}
          </div>
        </section>

        <section id="faq" className="scroll-mt-24 py-12">
          <h2 className="text-center text-3xl font-extrabold tracking-tight">Questions</h2>
          <div className="mx-auto mt-8 grid max-w-4xl gap-4 md:grid-cols-2">
            {FAQ.map((f) => (
              <div key={f.q} className="glass rounded-3xl p-6">
                <h3 className="font-extrabold">{f.q}</h3>
                <p className="mt-1 text-[15px] text-muted">{f.a}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="py-12">
          <div className="candy rounded-[2.5rem] px-6 py-12 text-center text-white shadow-[0_20px_50px_-20px_rgba(122,92,240,0.8)]">
            <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Mochi is waiting to meet you</h2>
            <p className="mx-auto mt-2 max-w-md text-white/90">It takes a minute. Mochi will ask the rest.</p>
            <Link href={signedIn ? "/home" : "/signup"} className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-white px-6 py-3 font-extrabold text-violet-700 shadow transition hover:scale-[1.02]">
              {signedIn ? "Open Mochi" : "Create my free account"} <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </main>

      <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-6 pb-10 text-sm text-muted">
        <span className="flex items-center gap-1.5">
          <Lock className="h-3.5 w-3.5" /> Your data stays in your account.
        </span>
        <span>Made with 💜 · Mochi</span>
      </footer>
    </div>
  );
}
