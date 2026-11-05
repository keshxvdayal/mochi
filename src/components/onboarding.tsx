"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Sparkles } from "lucide-react";
import { Companion } from "@/components/companion/companion";
import { btn, field } from "@/components/ui";
import { api } from "@/lib/client-api";
import { setMood } from "@/lib/companion-state";
import { enqueueSpeech, stopSpeaking } from "@/lib/speech";
import {
  ACCESSORIES,
  BODY_COLORS,
  EYE_COLORS,
  FOCUS_AREAS,
  LANGUAGES,
  LIFE_STAGES,
  type Accessory,
  type BodyColor,
  type CompanionSettings,
  type EyeColor,
  type FocusArea,
  type LifeStage,
  type Mood,
  type Profile,
} from "@/lib/types";

const STEPS: { mood: Mood; say: (p: Profile, c: CompanionSettings) => string }[] = [
  { mood: "excited", say: () => "Hiii! I'm your new companion! First, make me yours: what's my name, and how should I look?" },
  { mood: "happy", say: (_, c) => `${c.name}! I love it. Now tell me about you!` },
  { mood: "thinking", say: (p) => `What does life look like for you right now, ${p.name.split(" ")[0] || "friend"}?` },
  { mood: "love", say: () => "What should I help you with? Pick as many as you like, and tell me your dreams." },
  { mood: "proud", say: () => "Last bit: what are you great at, and what's a normal day like?" },
];

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={`flex items-center gap-2 rounded-2xl px-3 py-2 text-sm font-bold ring-2 transition ${active ? "bg-white ring-violet-400 shadow-sm" : "bg-white/60 ring-transparent hover:ring-violet-200"}`}>
      {children}
    </button>
  );
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-bold">
        {label} {hint && <span className="font-semibold text-muted">· {hint}</span>}
      </span>
      {children}
    </label>
  );
}

export function Onboarding({ companion: initialC, profile: initialP }: { companion: CompanionSettings; profile: Profile }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [c, setC] = useState(initialC);
  const [p, setP] = useState(initialP);
  const [busy, setBusy] = useState(false);
  const up = (k: keyof Profile) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setP({ ...p, [k]: e.target.value });
  const stage = LIFE_STAGES[p.lifeStage];

  useEffect(() => {
    setMood(STEPS[step].mood);
    stopSpeaking();
    enqueueSpeech(STEPS[step].say(p, c), { ...c, voiceOn: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  async function finish() {
    setBusy(true);
    await api("/api/profile", "PUT", { profile: p, companion: c, onboarded: true, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone });
    setMood("excited");
    router.push("/");
    router.refresh();
  }

  const toggleFocus = (f: FocusArea) => setP({ ...p, focusAreas: p.focusAreas.includes(f) ? p.focusAreas.filter((x) => x !== f) : [...p.focusAreas, f] });
  const canNext = step === 0 ? c.name.trim().length > 0 : step === 1 ? p.name.trim().length > 0 : true;

  return (
    <div className="mx-auto grid min-h-screen max-w-6xl items-center gap-6 px-4 py-8 lg:grid-cols-[1fr_1.05fr]">
      <div className="relative h-[42vh] min-h-[320px] lg:h-[80vh]">
        <div className="absolute inset-x-6 top-2 z-10 flex justify-center">
          <p key={step} className="pop max-w-md rounded-3xl bg-white/95 px-5 py-3 text-center text-[17px] font-bold leading-snug shadow-lg">{STEPS[step].say(p, c)}</p>
        </div>
        <div className="absolute inset-x-0 bottom-0 top-14">
          <Companion color={c.color} eyeColor={c.eyeColor} accessory={c.accessory} />
        </div>
      </div>

      <div className="glass rounded-[2rem] p-6 sm:p-8">
        <div className="mb-6 flex gap-1.5">
          {STEPS.map((_, i) => (
            <span key={i} className={`h-2 flex-1 rounded-full transition ${i <= step ? "candy" : "bg-violet-100"}`} />
          ))}
        </div>

        {step === 0 && (
          <div className="pop space-y-5">
            <h1 className="text-3xl font-extrabold tracking-tight">Meet your <span className="candy-text">companion</span></h1>
            <Field label="Name">
              <input className={field} value={c.name} onChange={(e) => setC({ ...c, name: e.target.value.slice(0, 30) })} placeholder="Mochi" />
            </Field>
            <div>
              <p className="mb-2 text-sm font-bold">Colour</p>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(BODY_COLORS) as BodyColor[]).map((k) => (
                  <Chip key={k} active={c.color === k} onClick={() => setC({ ...c, color: k })}>
                    <span className="h-5 w-5 rounded-full shadow-inner" style={{ background: BODY_COLORS[k].body }} /> {BODY_COLORS[k].label}
                  </Chip>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-sm font-bold">Eyes</p>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(EYE_COLORS) as EyeColor[]).map((k) => (
                  <button key={k} onClick={() => setC({ ...c, eyeColor: k })} title={k} className={`h-9 w-9 rounded-full ring-2 ring-offset-2 transition ${c.eyeColor === k ? "ring-violet-400" : "ring-transparent"}`} style={{ background: `radial-gradient(circle at 50% 65%, ${EYE_COLORS[k]} 0%, #1a0f2e 75%)` }} />
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-sm font-bold">Accessory</p>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(ACCESSORIES) as Accessory[]).map((k) => (
                  <Chip key={k} active={c.accessory === k} onClick={() => setC({ ...c, accessory: k })}>
                    {ACCESSORIES[k].emoji} {ACCESSORIES[k].label}
                  </Chip>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="pop space-y-4">
            <h2 className="text-2xl font-extrabold">About you</h2>
            <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
              <Field label="Your name"><input className={field} value={p.name} onChange={up("name")} autoFocus /></Field>
              <Field label="Age"><input className={field} value={p.age} onChange={up("age")} inputMode="numeric" /></Field>
            </div>
            <Field label="City"><input className={field} value={p.city} onChange={up("city")} /></Field>
            <Field label="Talk to me in">
              <select className={field} value={p.language} onChange={up("language")}>
                {LANGUAGES.map((l) => <option key={l}>{l}</option>)}
              </select>
            </Field>
          </div>
        )}

        {step === 2 && (
          <div className="pop space-y-4">
            <h2 className="text-2xl font-extrabold">Your life right now</h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(Object.keys(LIFE_STAGES) as LifeStage[]).map((k) => (
                <button key={k} onClick={() => setP({ ...p, lifeStage: k })} className={`rounded-2xl p-3 text-left ring-2 transition ${p.lifeStage === k ? "bg-white ring-violet-400 shadow-sm" : "bg-white/60 ring-transparent hover:ring-violet-200"}`}>
                  <span className="text-2xl">{LIFE_STAGES[k].emoji}</span>
                  <span className="mt-1 block text-[13px] font-extrabold leading-tight">{LIFE_STAGES[k].label}</span>
                </button>
              ))}
            </div>
            <Field label="In your words, what do you do?"><input className={field} value={p.occupation} onChange={up("occupation")} placeholder="e.g. I run a bakery · I teach maths · I'm raising two kids · I study law" /></Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={stage.org} hint="optional"><input className={field} value={p.organization} onChange={up("organization")} /></Field>
              <Field label={stage.role} hint="optional"><input className={field} value={p.role} onChange={up("role")} /></Field>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="pop space-y-4">
            <h2 className="text-2xl font-extrabold">What should I help with?</h2>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(FOCUS_AREAS) as FocusArea[]).map((k) => (
                <Chip key={k} active={p.focusAreas.includes(k)} onClick={() => toggleFocus(k)}>
                  {FOCUS_AREAS[k].emoji} {FOCUS_AREAS[k].label}
                </Chip>
              ))}
            </div>
            <Field label="What are you working toward?"><input className={field} value={p.aspirations} onChange={up("aspirations")} placeholder="A promotion, a fitter body, my own home, a calmer mind…" /></Field>
            <Field label="Who do you dream of becoming?"><textarea className={`${field} min-h-24`} value={p.dream} onChange={up("dream")} placeholder="Dream big, I won't laugh!" /></Field>
          </div>
        )}

        {step === 4 && (
          <div className="pop space-y-4">
            <h2 className="text-2xl font-extrabold">The real you</h2>
            <Field label="What you're good at"><input className={field} value={p.strengths} onChange={up("strengths")} /></Field>
            <Field label="What you want to get better at"><input className={field} value={p.weaknesses} onChange={up("weaknesses")} placeholder="procrastination, confidence, patience…" /></Field>
            <Field label="A normal day" hint="optional"><input className={field} value={p.routine} onChange={up("routine")} placeholder="Up at 7, office 9–6, gym evenings…" /></Field>
            <Field label="Anything about your health I should keep in mind?" hint="optional"><input className={field} value={p.health} onChange={up("health")} /></Field>
          </div>
        )}

        <div className="mt-8 flex justify-between">
          <button onClick={() => setStep(step - 1)} disabled={step === 0} className={`${btn.ghost} ${step === 0 ? "invisible" : ""}`}>
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          {step < STEPS.length - 1 ? (
            <button onClick={() => setStep(step + 1)} disabled={!canNext} className={btn.candy}>
              Next <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <button onClick={finish} disabled={busy} className={btn.candy}>
              <Sparkles className="h-4 w-4" /> Let&apos;s start!
            </button>
          )}
        </div>
        <p className="mt-4 text-center text-xs text-muted">Your info is private to your account. Change anything later in About me.</p>
      </div>
    </div>
  );
}
