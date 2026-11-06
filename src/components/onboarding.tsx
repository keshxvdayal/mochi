"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Check, Send, Sparkles, Volume2 } from "lucide-react";
import { Mochi } from "@/components/character/mochi";
import { btn } from "@/components/ui";
import { api } from "@/lib/client-api";
import { setMood, setThinking } from "@/lib/companion-state";
import { canAutoplay, enqueueSpeech, flushSpeech, stopSpeaking, unlockAudio } from "@/lib/speech";
import {
  BODY_COLORS,
  FOCUS_AREAS,
  LANGUAGES,
  LIFE_STAGES,
  type BodyColor,
  type CompanionSettings,
  type FocusArea,
  type LifeStage,
  type Mood,
  type Profile,
} from "@/lib/types";

type Data = { p: Profile; c: CompanionSettings };
type Option = { value: string; label: string; swatch?: string };
type Step = {
  id: string;
  mood: Mood;
  ask: (d: Data) => string;
  kind: "chips" | "multi" | "text";
  options?: (d: Data) => Option[];
  placeholder?: (d: Data) => string;
  skippable?: boolean;
  apply: (d: Data, answer: string) => Data;
  react: (d: Data, answer: string) => { mood: Mood; text: string };
};

const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];
const first = (p: Profile) => p.name.split(" ")[0] || "friend";

const STAGE_REACTION: Record<LifeStage, string> = {
  student: "A student! Big learning energy. I'll help with exams, focus and figuring out what's next.",
  working: "Working life! I'll help you grow and still have a life outside work.",
  business: "Running a business?! That's so cool. I'll be your tiny co-founder.",
  "job-seeking": "Looking for work. That takes guts. We'll find you something great, together.",
  parent: "A parent! You deserve a helper. I'll look after you while you look after them.",
  homemaker: "Running a home is a real job. I'll help make the week feel lighter.",
  retired: "Retired! Time for all the things you never had time for.",
  other: "Something else! I like a mystery. You'll tell me more as we go.",
};

const STEPS: Step[] = [
  {
    id: "hello",
    mood: "excited",
    ask: (d) => `Hiii ${first(d.p)}! I'm ${d.c.name}, your new companion. Can I ask you a few quick things so I actually get to know you?`,
    kind: "chips",
    options: () => [
      { value: "yes", label: "Sure, let's go!" },
      { value: "quick", label: "Okay, but quickly 😅" },
    ],
    apply: (d) => d,
    react: (_, a) => (a === "quick" ? { mood: "playful", text: "Super quick, promise!" } : { mood: "happy", text: "Yay!" }),
  },
  {
    id: "name",
    mood: "happy",
    ask: () => "First things first: what should I call you?",
    kind: "text",
    options: (d) => (d.p.name ? [{ value: first(d.p), label: first(d.p) }] : []),
    placeholder: () => "Your name or nickname",
    apply: (d, a) => ({ ...d, p: { ...d.p, name: a.slice(0, 60) } }),
    react: (_, a) => pick([{ mood: "love", text: `${a}! I love that.` }, { mood: "happy", text: `Nice to properly meet you, ${a}!` }]),
  },
  {
    id: "companion",
    mood: "playful",
    ask: (d) => `And what do you want to call me? I'm ${d.c.name} right now, but I'm open to ideas 👀`,
    kind: "text",
    options: (d) => [{ value: d.c.name, label: `${d.c.name} is perfect` }],
    placeholder: () => "A name for me",
    apply: (d, a) => ({ ...d, c: { ...d.c, name: a.slice(0, 30) } }),
    react: (d, a) => (a === "Mochi" ? { mood: "happy", text: "Mochi it is! Soft, round and sweet. Like me." } : { mood: "excited", text: `${a}! Ooh, I love it. That's me now.` }),
  },
  {
    id: "color",
    mood: "excited",
    ask: () => "Pick my colour!",
    kind: "chips",
    options: () => (Object.keys(BODY_COLORS) as BodyColor[]).map((k) => ({ value: k, label: BODY_COLORS[k].label, swatch: BODY_COLORS[k].body })),
    apply: (d, a) => ({ ...d, c: { ...d.c, color: a as BodyColor } }),
    react: (_, a) => ({ mood: "love", text: `Ooh, I look SO good in ${BODY_COLORS[a as BodyColor].label.toLowerCase()}. Great taste.` }),
  },
  {
    id: "stage",
    mood: "thinking",
    ask: (d) => `So, ${first(d.p)}, what does life look like for you right now?`,
    kind: "chips",
    options: () => (Object.keys(LIFE_STAGES) as LifeStage[]).map((k) => ({ value: k, label: `${LIFE_STAGES[k].emoji} ${LIFE_STAGES[k].label}` })),
    apply: (d, a) => ({ ...d, p: { ...d.p, lifeStage: a as LifeStage } }),
    react: (_, a) => ({ mood: "happy", text: STAGE_REACTION[a as LifeStage] }),
  },
  {
    id: "occupation",
    mood: "happy",
    ask: () => "Tell me a little more. What do you actually do day to day?",
    kind: "text",
    skippable: true,
    placeholder: (d) =>
      ({
        student: "e.g. B.Tech 2nd year at DTU",
        working: "e.g. designer at a startup",
        business: "e.g. I run a bakery",
        "job-seeking": "e.g. looking for marketing roles",
        parent: "e.g. two kids, 4 and 9",
        homemaker: "e.g. I run our home and help my mum",
        retired: "e.g. retired teacher, love gardening",
        other: "In your own words",
      })[d.p.lifeStage],
    apply: (d, a) => ({ ...d, p: { ...d.p, occupation: a.slice(0, 160) } }),
    react: () => pick([{ mood: "happy", text: "Ooh, interesting! I want to hear more about that sometime." }, { mood: "proud", text: "That sounds like a lot. Respect." }]),
  },
  {
    id: "focus",
    mood: "love",
    ask: () => "What should I help you with? Pick as many as you like.",
    kind: "multi",
    options: () => (Object.keys(FOCUS_AREAS) as FocusArea[]).map((k) => ({ value: k, label: `${FOCUS_AREAS[k].emoji} ${FOCUS_AREAS[k].label}` })),
    apply: (d, a) => ({ ...d, p: { ...d.p, focusAreas: a ? (a.split(",") as FocusArea[]) : [] } }),
    react: (_, a) => (a.split(",").length > 5 ? { mood: "excited", text: "All of it?! Okay, I love an ambitious human." } : { mood: "happy", text: "Great picks. I'll keep an eye on those." }),
  },
  {
    id: "aspirations",
    mood: "thinking",
    ask: () => "What are you working toward right now? Big or small, anything counts.",
    kind: "text",
    skippable: true,
    placeholder: () => "A promotion, a fitter body, my own home, a calmer mind…",
    apply: (d, a) => ({ ...d, p: { ...d.p, aspirations: a.slice(0, 600) } }),
    react: () => pick([{ mood: "proud", text: "That's a good one. We'll get you there, step by step." }, { mood: "excited", text: "Ooh, I'm already excited for when you get there." }]),
  },
  {
    id: "routine",
    mood: "happy",
    ask: () => "What does a normal day look like? When you wake up, work, sleep… roughly.",
    kind: "text",
    skippable: true,
    placeholder: () => "Up at 7, office 9–6, gym evenings, sleep by 12…",
    apply: (d, a) => ({ ...d, p: { ...d.p, routine: a.slice(0, 600) } }),
    react: () => ({ mood: "happy", text: "Noted! I'll plan things around that." }),
  },
  {
    id: "weaknesses",
    mood: "love",
    ask: () => "Be honest with me: what's something you'd like to get better at?",
    kind: "text",
    skippable: true,
    placeholder: () => "Procrastination, confidence, sleep, patience…",
    apply: (d, a) => ({ ...d, p: { ...d.p, weaknesses: a.slice(0, 600) } }),
    react: () => ({ mood: "love", text: "Thanks for trusting me with that. We'll work on it together, no judgement." }),
  },
  {
    id: "language",
    mood: "playful",
    ask: () => "Last one! Which language should I talk to you in?",
    kind: "chips",
    options: () => LANGUAGES.map((l) => ({ value: l, label: l })),
    apply: (d, a) => ({ ...d, p: { ...d.p, language: a } }),
    react: (_, a) => (a === "Hinglish" ? { mood: "playful", text: "Hinglish it is! Chalo, let's go." } : a === "English" ? { mood: "happy", text: "English it is!" } : { mood: "excited", text: `${a}! Perfect.` }),
  },
];

type Line = { from: "mochi" | "me"; text: string };

export function Onboarding({ companion, profile }: { companion: CompanionSettings; profile: Profile }) {
  const router = useRouter();
  const [data, setData] = useState<Data>({ p: profile, c: companion });
  const [lines, setLines] = useState<Line[]>([]);
  const [step, setStep] = useState(0);
  const [typing, setTyping] = useState(true);
  const [text, setText] = useState("");
  const [multi, setMulti] = useState<string[]>(profile.focusAreas);
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const audioOk = useRef(false);
  const lastLine = useRef<{ text: string; mood: Mood } | null>(null);
  const [needTap, setNeedTap] = useState(false);
  const cur = STEPS[step];

  const voice = { ...data.c, voiceOn: data.c.voiceOn };

  /** Mochi "types" for a moment, then says the line (out loud once audio is allowed). */
  function mochiSays(textToSay: string, mood: Mood, then?: () => void) {
    setTyping(true);
    setThinking(true);
    setTimeout(
      () => {
        setThinking(false);
        setTyping(false);
        setMood(mood);
        setLines((ls) => [...ls, { from: "mochi", text: textToSay }]);
        lastLine.current = { text: textToSay, mood };
        // Queue, don't interrupt: the reaction and the next question play one after the other.
        enqueueSpeech(textToSay, { ...voice, voiceOn: voice.voiceOn && audioOk.current });
        flushSpeech();
        then?.();
      },
      450 + Math.min(900, textToSay.length * 12),
    );
  }

  // First question.
  useEffect(() => {
    // Speak right away if the browser already allows sound (they just clicked "Create my account");
    // otherwise show a "tap to hear me" button.
    const t = setTimeout(() => {
      if (canAutoplay()) {
        audioOk.current = true;
        unlockAudio();
      } else setNeedTap(true);
      mochiSays(STEPS[0].ask(data), STEPS[0].mood);
    }, 0);
    return () => {
      clearTimeout(t);
      stopSpeaking();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [lines, typing]);

  function answer(value: string, shown: string) {
    if (typing || done) return;
    audioOk.current = true;
    setNeedTap(false);
    unlockAudio();
    stopSpeaking();
    const next = cur.apply(data, value);
    setData(next);
    setLines((ls) => [...ls, { from: "me", text: shown }]);
    setText("");
    // Save as we go, so leaving halfway doesn't lose anything.
    void api("/api/profile", "PUT", { profile: next.p, companion: next.c }).catch(() => {});
    const r = cur.react(next, value);
    const isLast = step === STEPS.length - 1;
    mochiSays(r.text, r.mood, () => {
      if (isLast) {
        mochiSays(`Yay, I feel like I know you a little now, ${first(next.p)}! I'll learn the rest as we talk. Ready?`, "excited", () => setDone(true));
      } else {
        const n = STEPS[step + 1];
        setStep(step + 1);
        setTimeout(() => mochiSays(n.ask(next), n.mood), 250);
      }
    });
  }

  async function finish() {
    setSaving(true);
    unlockAudio();
    await api("/api/profile", "PUT", { profile: data.p, companion: data.c, onboarded: true, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone });
    setMood("excited");
    router.push("/home");
    router.refresh();
  }

  const options = cur.options?.(data) ?? [];

  return (
    <div className="mx-auto grid min-h-screen max-w-6xl items-center gap-4 px-4 py-6 lg:grid-cols-[1fr_1.1fr]">
      <div className="mx-auto h-[34vh] min-h-[240px] w-full max-w-md lg:h-[72vh]">
        <Mochi color={data.c.color} eyeColor={data.c.eyeColor} accessory={data.c.accessory} />
      </div>

      <div className="glass flex h-[60vh] flex-col overflow-hidden rounded-[2rem] lg:h-[80vh]">
        <div className="flex items-center gap-2 border-b border-line px-5 py-3">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-400" />
          <p className="font-extrabold">{data.c.name}</p>
          <p className="text-sm text-muted">· getting to know you</p>
          <div className="ml-auto flex gap-1">
            {STEPS.map((s, i) => (
              <span key={s.id} className={`h-1.5 w-3 rounded-full ${i < step || done ? "candy" : i === step ? "bg-violet-300" : "bg-violet-100"}`} />
            ))}
          </div>
        </div>

        <div ref={scroller} className="flex-1 space-y-2.5 overflow-y-auto px-4 py-4">
          {lines.map((l, i) => (
            <div key={i} className={`pop flex ${l.from === "me" ? "justify-end" : "justify-start"}`}>
              <p className={`max-w-[85%] rounded-3xl px-4 py-2.5 text-[15px] leading-snug ${l.from === "me" ? "candy rounded-br-lg text-white" : "rounded-bl-lg bg-white font-semibold shadow-sm"}`}>{l.text}</p>
            </div>
          ))}
          {needTap && !typing && (
            <button
              onClick={() => {
                audioOk.current = true;
                setNeedTap(false);
                unlockAudio();
                stopSpeaking();
                if (lastLine.current) {
                  setMood(lastLine.current.mood);
                  enqueueSpeech(lastLine.current.text, data.c);
                  flushSpeech();
                }
              }}
              className="pop ml-1 inline-flex items-center gap-1.5 rounded-full bg-violet-600 px-3 py-1.5 text-xs font-extrabold text-white shadow animate-pulse"
            >
              <Volume2 className="h-3.5 w-3.5" /> Tap to hear me
            </button>
          )}
          {typing && (
            <div className="flex">
              <p className="typing rounded-3xl rounded-bl-lg bg-white px-4 py-3 shadow-sm">
                <span>•</span>
                <span>•</span>
                <span>•</span>
              </p>
            </div>
          )}
        </div>

        <div className="border-t border-line bg-white/60 p-3">
          {done ? (
            <button onClick={finish} disabled={saving} className={`${btn.candy} w-full py-3 text-base`}>
              <Sparkles className="h-4 w-4" /> Let&apos;s go!
            </button>
          ) : typing ? (
            <p className="py-3 text-center text-sm text-muted">{data.c.name} is typing…</p>
          ) : (
            <div className="pop space-y-2">
              {cur.kind !== "text" && (
                <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto">
                  {options.map((o) => {
                    const on = cur.kind === "multi" && multi.includes(o.value);
                    return (
                      <button
                        key={o.value}
                        onClick={() => (cur.kind === "multi" ? setMulti((m) => (m.includes(o.value) ? m.filter((x) => x !== o.value) : [...m, o.value])) : answer(o.value, o.label))}
                        className={`flex items-center gap-2 rounded-2xl px-3 py-2 text-sm font-bold ring-2 transition ${on ? "bg-violet-50 ring-violet-400" : "bg-white ring-transparent hover:ring-violet-200"}`}
                      >
                        {o.swatch && <span className="h-4 w-4 rounded-full shadow-inner" style={{ background: o.swatch }} />}
                        {o.label}
                        {on && <Check className="h-3.5 w-3.5 text-violet-600" />}
                      </button>
                    );
                  })}
                </div>
              )}
              {cur.kind === "multi" && (
                <button
                  onClick={() => answer(multi.join(","), multi.length ? multi.map((m) => FOCUS_AREAS[m as FocusArea].label).join(", ") : "Not sure yet")}
                  className={`${btn.candy} w-full`}
                >
                  {multi.length ? `Done (${multi.length})` : "Not sure yet"}
                </button>
              )}
              {cur.kind === "text" && (
                <>
                  {options.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {options.map((o) => (
                        <button key={o.value} onClick={() => answer(o.value, o.label.replace(/ is perfect$/, ""))} className="rounded-2xl bg-white px-3 py-2 text-sm font-bold ring-2 ring-transparent transition hover:ring-violet-200">
                          {o.label}
                        </button>
                      ))}
                    </div>
                  )}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (text.trim()) answer(text.trim(), text.trim());
                    }}
                    className="flex items-center gap-2 rounded-2xl bg-white p-1.5 ring-1 ring-line"
                  >
                    <input
                      autoFocus
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      placeholder={cur.placeholder?.(data) ?? "Type here…"}
                      className="min-w-0 flex-1 bg-transparent px-3 py-2 text-[15px] outline-none placeholder:text-muted/60"
                    />
                    {cur.skippable && (
                      <button type="button" onClick={() => answer("", "Skip for now")} className={btn.ghost}>
                        Skip
                      </button>
                    )}
                    <button disabled={!text.trim()} className="candy grid h-10 w-10 place-items-center rounded-xl text-white disabled:opacity-40" aria-label="Send">
                      <Send className="h-4 w-4" />
                    </button>
                  </form>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
