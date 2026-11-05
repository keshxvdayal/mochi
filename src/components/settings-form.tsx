"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Check, Play, Save } from "lucide-react";
import { Companion } from "@/components/companion/companion";
import { btn, Card, field, Title } from "@/components/ui";
import { api } from "@/lib/client-api";
import { setMood } from "@/lib/companion-state";
import { speak, unlockAudio, voices } from "@/lib/speech";
import { ACCESSORIES, BODY_COLORS, EYE_COLORS, GEMINI_VOICES, MOODS, type Accessory, type BodyColor, type CompanionSettings, type EyeColor } from "@/lib/types";

function subscribeVoices(cb: () => void) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return () => {};
  window.speechSynthesis.addEventListener("voiceschanged", cb);
  return () => window.speechSynthesis.removeEventListener("voiceschanged", cb);
}
let voiceKey = "";
let voiceCache: { name: string; lang: string }[] = [];
function voiceSnapshot() {
  const v = voices().filter((x) => /^en|^hi/i.test(x.lang));
  const key = v.map((x) => x.name).join("|");
  if (key !== voiceKey) {
    voiceKey = key;
    voiceCache = v.map((x) => ({ name: x.name, lang: x.lang }));
  }
  return voiceCache;
}
const noVoices: { name: string; lang: string }[] = [];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-sm font-extrabold">{title}</p>
      {children}
    </div>
  );
}

const pick = (on: boolean) => `rounded-2xl px-3 py-2 text-sm font-bold ring-2 transition ${on ? "bg-white ring-violet-400 shadow-sm" : "bg-white/60 ring-transparent hover:ring-violet-200"}`;

export function SettingsForm({ companion }: { companion: CompanionSettings }) {
  const router = useRouter();
  const [c, setC] = useState(companion);
  const [saved, setSaved] = useState(false);
  const list = useSyncExternalStore(subscribeVoices, voiceSnapshot, () => noVoices);
  useEffect(() => {
    setMood("happy");
  }, []);
  const dirty = JSON.stringify(c) !== JSON.stringify(companion);

  async function save() {
    await api("/api/profile", "PUT", { companion: c });
    setSaved(true);
    setMood("love");
    setTimeout(() => setSaved(false), 1500);
    router.refresh();
  }

  function test() {
    unlockAudio();
    setMood("happy");
    speak(`Hi! I'm ${c.name}. This is how I sound. Do you like it?`, c);
  }

  return (
    <div>
      <Title emoji="🎀" title="Settings" subtitle="Make your companion yours." />
      <div className="grid gap-5 lg:grid-cols-[1fr_1.1fr]">
        <Card className="relative h-[520px] overflow-hidden lg:sticky lg:top-24">
          <div className="absolute inset-0 bg-gradient-to-b from-pink-50/70 to-violet-100/60" />
          <div className="absolute inset-x-0 bottom-12 top-0">
            <Companion color={c.color} eyeColor={c.eyeColor} accessory={c.accessory} />
          </div>
          <div className="absolute inset-x-3 bottom-3 flex flex-wrap justify-center gap-1.5">
            {MOODS.map((m) => (
              <button key={m} onClick={() => setMood(m)} className="rounded-full bg-white/90 px-2.5 py-1 text-xs font-bold capitalize text-muted shadow-sm hover:text-grape">
                {m}
              </button>
            ))}
          </div>
        </Card>

        <Card className="space-y-6 p-6">
          <label className="block space-y-1.5">
            <span className="text-sm font-extrabold">Name</span>
            <input className={field} value={c.name} onChange={(e) => setC({ ...c, name: e.target.value.slice(0, 30) })} />
          </label>
          <Section title="Colour">
            <div className="flex flex-wrap gap-2">
              {(Object.keys(BODY_COLORS) as BodyColor[]).map((k) => (
                <button key={k} onClick={() => setC({ ...c, color: k })} className={`flex items-center gap-2 ${pick(c.color === k)}`}>
                  <span className="h-5 w-5 rounded-full" style={{ background: BODY_COLORS[k].body }} /> {BODY_COLORS[k].label}
                </button>
              ))}
            </div>
          </Section>
          <Section title="Eyes">
            <div className="flex flex-wrap gap-2.5">
              {(Object.keys(EYE_COLORS) as EyeColor[]).map((k) => (
                <button key={k} onClick={() => setC({ ...c, eyeColor: k })} title={k} className={`h-9 w-9 rounded-full ring-2 ring-offset-2 transition ${c.eyeColor === k ? "ring-violet-400" : "ring-transparent"}`} style={{ background: `radial-gradient(circle at 50% 65%, ${EYE_COLORS[k]} 0%, #1a0f2e 75%)` }} />
              ))}
            </div>
          </Section>
          <Section title="Accessory">
            <div className="flex flex-wrap gap-2">
              {(Object.keys(ACCESSORIES) as Accessory[]).map((k) => (
                <button key={k} onClick={() => setC({ ...c, accessory: k })} className={pick(c.accessory === k)}>
                  {ACCESSORIES[k].emoji} {ACCESSORIES[k].label}
                </button>
              ))}
            </div>
          </Section>
          <Section title="Coaching style">
            <div className="grid grid-cols-3 gap-2">
              {([
                ["gentle", "🌸 Gentle", "Lots of encouragement"],
                ["balanced", "⚖️ Balanced", "Warm but honest"],
                ["tough-love", "🔥 Tough love", "Calls out excuses"],
              ] as const).map(([k, label, sub]) => (
                <button key={k} onClick={() => setC({ ...c, style: k })} className={`text-left ${pick(c.style === k)} p-3`}>
                  <p className="text-sm font-extrabold">{label}</p>
                  <p className="text-xs font-semibold text-muted">{sub}</p>
                </button>
              ))}
            </div>
          </Section>

          <div className="space-y-4 rounded-3xl bg-violet-50/70 p-4">
            <label className="flex items-center justify-between">
              <span className="text-sm font-extrabold">Speak out loud</span>
              <input type="checkbox" checked={c.voiceOn} onChange={(e) => setC({ ...c, voiceOn: e.target.checked })} className="h-5 w-5 accent-violet-500" />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setC({ ...c, voiceEngine: "natural" })} className={`text-left ${pick(c.voiceEngine === "natural")} p-3`}>
                <p className="text-sm font-extrabold">✨ Natural voice</p>
                <p className="text-xs font-semibold text-muted">Expressive, changes with mood</p>
              </button>
              <button onClick={() => setC({ ...c, voiceEngine: "browser" })} className={`text-left ${pick(c.voiceEngine === "browser")} p-3`}>
                <p className="text-sm font-extrabold">⚡ Instant voice</p>
                <p className="text-xs font-semibold text-muted">Built into your browser, no delay</p>
              </button>
            </div>
            {c.voiceEngine === "natural" ? (
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(GEMINI_VOICES).map(([name, vibe]) => (
                  <button key={name} onClick={() => setC({ ...c, geminiVoice: name })} className={`rounded-full px-3 py-1.5 text-xs font-bold ring-2 transition ${c.geminiVoice === name ? "bg-white ring-violet-400" : "bg-white/60 ring-transparent hover:ring-violet-200"}`}>
                    {name} <span className="font-semibold text-muted">· {vibe}</span>
                  </button>
                ))}
              </div>
            ) : (
              <>
                <select className={field} value={c.voiceName} onChange={(e) => setC({ ...c, voiceName: e.target.value })}>
                  <option value="">Automatic (cutest available)</option>
                  {list.map((v) => (
                    <option key={v.name} value={v.name}>
                      {v.name} ({v.lang})
                    </option>
                  ))}
                </select>
                <label className="block text-sm font-bold">
                  Pitch {c.pitch.toFixed(2)}
                  <input type="range" min={0.5} max={2} step={0.05} value={c.pitch} onChange={(e) => setC({ ...c, pitch: Number(e.target.value) })} className="w-full accent-violet-500" />
                </label>
                <label className="block text-sm font-bold">
                  Speed {c.rate.toFixed(2)}
                  <input type="range" min={0.5} max={1.6} step={0.05} value={c.rate} onChange={(e) => setC({ ...c, rate: Number(e.target.value) })} className="w-full accent-violet-500" />
                </label>
              </>
            )}
            <button onClick={test} className={btn.soft}>
              <Play className="h-4 w-4" /> Test voice
            </button>
          </div>

          <button onClick={save} disabled={!dirty && !saved} className={`${btn.candy} w-full`}>
            {saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />} {saved ? "Saved!" : "Save changes"}
          </button>
        </Card>
      </div>
    </div>
  );
}
