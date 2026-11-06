"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Brain, Check, MessageCircle, Phone, Plus, Save, Trash2, UserPlus } from "lucide-react";
import { btn, Card, Empty, field, fieldBase, Pill, Title } from "@/components/ui";
import { api } from "@/lib/client-api";
import { FOCUS_AREAS, LANGUAGES, LIFE_STAGES, type FocusArea, type LifeStage, type Memory, type Person, type Profile } from "@/lib/types";

type FieldDef = [keyof Profile, string, boolean?];
function groups(stage: LifeStage): { title: string; emoji: string; fields: FieldDef[] }[] {
  const st = LIFE_STAGES[stage];
  return [
    { title: "Basics", emoji: "🙋", fields: [["name", "Name"], ["age", "Age"], ["city", "City"]] },
    { title: "Your life right now", emoji: st.emoji, fields: [["occupation", "What you do, in your words", true], ["organization", st.org], ["role", st.role]] },
    { title: "Dreams", emoji: "🚀", fields: [["aspirations", "What you're working toward", true], ["dream", "Who you want to become", true]] },
    { title: "You", emoji: "💜", fields: [["strengths", "Strengths", true], ["weaknesses", "Want to get better at", true], ["interests", "Interests & hobbies", true], ["values", "What matters most to you", true]] },
    { title: "Daily life", emoji: "☀️", fields: [["routine", "A normal day", true], ["health", "Health things to keep in mind", true], ["about", "Anything else", true]] },
  ];
}

/** Whole calendar days between a YYYY-MM-DD date and today (local time). */
function daysSince(d: string | null): number | null {
  if (!d) return null;
  const today = new Date().toLocaleDateString("en-CA");
  return Math.round((new Date(`${today}T12:00:00`).getTime() - new Date(`${d}T12:00:00`).getTime()) / 86400_000);
}

export function AboutMe({ profile, people, memories, companionName }: { profile: Profile; people: Person[]; memories: Memory[]; companionName: string }) {
  const router = useRouter();
  const [p, setP] = useState(profile);
  const [saved, setSaved] = useState(false);
  const [tab, setTab] = useState<"profile" | "people" | "memories">("profile");
  const [person, setPerson] = useState({ name: "", relation: "", closeness: 3 });
  const dirty = JSON.stringify(p) !== JSON.stringify(profile);

  async function save() {
    await api("/api/profile", "PUT", { profile: p });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
    router.refresh();
  }

  async function addPerson(e: React.FormEvent) {
    e.preventDefault();
    if (!person.name.trim()) return;
    await api("/api/items/people", "POST", person);
    setPerson({ name: "", relation: "", closeness: 3 });
    router.refresh();
  }

  const today = new Date().toLocaleDateString("en-CA");

  return (
    <div>
      <Title emoji="🪞" title="About me" subtitle={`Everything ${companionName} knows about you. Edit anything, anytime.`} />
      <div className="mb-5 flex gap-1.5">
        {(["profile", "people", "memories"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`rounded-2xl px-4 py-2 text-sm font-extrabold capitalize transition ${tab === t ? "bg-grape text-white" : "bg-white/70 text-muted hover:bg-white"}`}>
            {t === "people" ? `People (${people.length})` : t === "memories" ? `Memories (${memories.length})` : "Profile"}
          </button>
        ))}
      </div>

      {tab === "profile" && (
        <div className="space-y-4">
          <Card className="p-5">
            <h2 className="mb-3 text-lg font-extrabold">🧭 Life stage, focus & language</h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(Object.keys(LIFE_STAGES) as LifeStage[]).map((k) => (
                <button key={k} onClick={() => setP({ ...p, lifeStage: k })} className={`rounded-2xl p-2.5 text-left text-[13px] font-extrabold ring-2 transition ${p.lifeStage === k ? "bg-white ring-violet-400" : "bg-white/60 ring-transparent hover:ring-violet-200"}`}>
                  {LIFE_STAGES[k].emoji} {LIFE_STAGES[k].label}
                </button>
              ))}
            </div>
            <p className="mb-2 mt-4 text-sm font-bold text-muted">I want help with</p>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(FOCUS_AREAS) as FocusArea[]).map((k) => {
                const on = p.focusAreas.includes(k);
                return (
                  <button key={k} onClick={() => setP({ ...p, focusAreas: on ? p.focusAreas.filter((x) => x !== k) : [...p.focusAreas, k] })} className={`rounded-full px-3 py-1.5 text-sm font-bold ring-2 transition ${on ? "bg-white ring-violet-400" : "bg-white/60 ring-transparent hover:ring-violet-200"}`}>
                    {FOCUS_AREAS[k].emoji} {FOCUS_AREAS[k].label}
                  </button>
                );
              })}
            </div>
            <label className="mt-4 block max-w-xs space-y-1">
              <span className="text-sm font-bold text-muted">Talk to me in</span>
              <select className={field} value={p.language} onChange={(e) => setP({ ...p, language: e.target.value })}>
                {LANGUAGES.map((l) => <option key={l}>{l}</option>)}
              </select>
            </label>
          </Card>
          {groups(p.lifeStage).map((g) => (
            <Card key={g.title} className="p-5">
              <h2 className="mb-3 text-lg font-extrabold">{g.emoji} {g.title}</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {g.fields.map(([k, label, long]) => (
                  <label key={k} className={`block space-y-1 ${long ? "sm:col-span-2" : ""}`}>
                    <span className="text-sm font-bold text-muted">{label}</span>
                    {long ? (
                      <textarea className={`${field} min-h-20`} value={p[k] as string} onChange={(e) => setP({ ...p, [k]: e.target.value })} />
                    ) : (
                      <input className={field} value={p[k] as string} onChange={(e) => setP({ ...p, [k]: e.target.value })} />
                    )}
                  </label>
                ))}
              </div>
            </Card>
          ))}
          <div className="sticky bottom-24 flex justify-end md:bottom-4">
            <button onClick={save} disabled={!dirty && !saved} className={btn.candy}>
              {saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />} {saved ? "Saved!" : "Save changes"}
            </button>
          </div>
        </div>
      )}

      {tab === "people" && (
        <div className="space-y-4">
          <form onSubmit={addPerson} className="glass flex flex-wrap gap-2 rounded-3xl p-3">
            <input className={`${fieldBase} min-w-40 flex-1`} value={person.name} onChange={(e) => setPerson({ ...person, name: e.target.value })} placeholder="Name" />
            <input className={`${fieldBase} min-w-40 flex-1`} value={person.relation} onChange={(e) => setPerson({ ...person, relation: e.target.value })} placeholder="Best friend, mom, mentor…" />
            <select className={`${fieldBase} w-auto`} value={person.closeness} onChange={(e) => setPerson({ ...person, closeness: Number(e.target.value) })}>
              {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{"💜".repeat(n)} {["", "acquaintance", "friend", "good friend", "close", "very close"][n]}</option>)}
            </select>
            <button className={btn.candy}><UserPlus className="h-4 w-4" /> Add</button>
          </form>
          {people.length === 0 && <Empty emoji="🫂" title="No one here yet">Add your friends and family so {companionName} can remind you to stay in touch and help with what to say.</Empty>}
          <div className="grid gap-3 md:grid-cols-2">
            {people.map((x) => {
              const since = daysSince(x.lastContact);
              return (
                <Card key={x.id} className="pop p-4">
                  <div className="flex items-start gap-3">
                    <span className="candy grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-lg font-extrabold text-white">{x.name[0]?.toUpperCase()}</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-extrabold">{x.name}</p>
                      <p className="text-sm text-muted">{x.relation || "—"} · {"💜".repeat(x.closeness)}</p>
                      <p className="mt-1 text-xs font-bold text-muted">{since === null ? "Never logged a chat" : since === 0 ? "Talked today" : `Last talked ${since} day${since === 1 ? "" : "s"} ago`}</p>
                    </div>
                    <button onClick={() => api(`/api/items/people/${x.id}`, "DELETE").then(() => router.refresh())} className="rounded-lg p-1.5 text-muted hover:bg-rose-50 hover:text-rose-600" aria-label="Remove">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  {x.notes && <p className="mt-2 rounded-xl bg-violet-50/60 px-3 py-2 text-sm">{x.notes}</p>}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button onClick={() => api(`/api/items/people/${x.id}`, "PATCH", { lastContact: today }, x.name).then(() => router.refresh())} className={btn.soft}>
                      <Phone className="h-4 w-4" /> We talked today
                    </button>
                    <Link href={`/home?ask=${encodeURIComponent(`Should I reach out to ${x.name}? If yes, what should I say?`)}`} className={btn.soft}>
                      <MessageCircle className="h-4 w-4 text-violet-500" /> What do I say?
                    </Link>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {tab === "memories" && (
        <MemoryList memories={memories} companionName={companionName} />
      )}
    </div>
  );
}

function MemoryList({ memories, companionName }: { memories: Memory[]; companionName: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  return (
    <div className="space-y-4">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!text.trim()) return;
          await api("/api/items/memories", "POST", { text, category: "other" });
          setText("");
          router.refresh();
        }}
        className="glass flex gap-2 rounded-3xl p-3"
      >
        <input className={field} value={text} onChange={(e) => setText(e.target.value)} placeholder={`Tell ${companionName} something to remember…`} />
        <button className={btn.candy}><Plus className="h-4 w-4" /> Remember</button>
      </form>
      {memories.length === 0 && <Empty emoji="🧠" title="No memories yet">As you chat, {companionName} remembers important things about you here.</Empty>}
      <div className="space-y-2">
        {memories.map((m) => (
          <div key={m.id} className="group flex items-start gap-3 rounded-2xl bg-white/80 px-4 py-3 ring-1 ring-line">
            <Brain className="mt-0.5 h-4 w-4 shrink-0 text-pink-400" />
            <div className="min-w-0 flex-1">
              <p className="text-[15px]">{m.text}</p>
              <p className="mt-0.5 flex gap-2 text-xs text-muted"><Pill tone="pink">{m.category}</Pill> {new Date(m.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</p>
            </div>
            <button onClick={() => api(`/api/items/memories/${m.id}`, "DELETE").then(() => router.refresh())} className="rounded-lg p-1.5 text-muted opacity-0 hover:bg-rose-50 hover:text-rose-600 group-hover:opacity-100" aria-label="Forget">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
