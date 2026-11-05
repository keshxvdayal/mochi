"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, Plus, Trash2 } from "lucide-react";
import { btn, Card, fieldBase } from "@/components/ui";
import { api } from "@/lib/client-api";

export type HabitRow = { id: string; title: string; emoji: string; week: { date: string; done: boolean }[]; streak: number; doneToday: boolean };

const IDEAS = ["💧 Drink water", "🚶 10-min walk", "📖 Read 10 pages", "🧘 Breathe 5 min", "📵 No phone after 11", "🙏 Gratitude note", "💊 Medicine", "🥗 Eat a fruit"];

export function HabitBoard({ habits, companionName }: { habits: HabitRow[]; companionName: string }) {
  const router = useRouter();
  const [emoji, setEmoji] = useState("✨");
  const [title, setTitle] = useState("");

  async function add(t: string, e: string) {
    if (!t.trim()) return;
    await api("/api/items/habits", "POST", { title: t.trim(), emoji: e || "✨", log: [] });
    setTitle("");
    router.refresh();
  }

  return (
    <Card className="mb-6 p-5">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-extrabold">🔁 Daily habits</h2>
          <p className="text-sm text-muted">Small things, every day. +5 XP each time. {companionName} checks in on them.</p>
        </div>
      </div>
      {habits.length > 0 && (
        <div className="mb-4 space-y-2">
          {habits.map((h) => (
            <div key={h.id} className="group flex items-center gap-3 rounded-2xl bg-white p-3 ring-1 ring-line">
              <button
                onClick={() => api(`/api/habits/${h.id}`, "POST").then(() => router.refresh())}
                className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-xl transition active:scale-90 ${h.doneToday ? "bg-emerald-100 ring-2 ring-emerald-300" : "bg-violet-50 hover:bg-violet-100"}`}
                title={h.doneToday ? "Done today (tap to undo)" : "Mark done today"}
              >
                {h.doneToday ? <Check className="h-5 w-5 text-emerald-600" /> : h.emoji}
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{h.emoji} {h.title}</p>
                <p className="text-xs font-bold text-orange-500">{h.streak ? `🔥 ${h.streak}-day streak` : <span className="text-muted">Start your streak today</span>}</p>
              </div>
              <div className="hidden gap-1 sm:flex" aria-label="Last 7 days">
                {h.week.map((d) => (
                  <span key={d.date} title={d.date} className={`h-6 w-6 rounded-lg ${d.done ? "candy" : "bg-violet-100/70"}`} />
                ))}
              </div>
              <button onClick={() => api(`/api/items/habits/${h.id}`, "DELETE").then(() => router.refresh())} className="rounded-lg p-1.5 text-muted opacity-0 transition hover:bg-rose-50 hover:text-rose-600 group-hover:opacity-100" aria-label="Delete habit">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void add(title, emoji);
        }}
        className="flex flex-wrap gap-2"
      >
        <input className={`${fieldBase} w-16 text-center text-lg`} value={emoji} onChange={(e) => setEmoji(e.target.value.slice(0, 4))} aria-label="Emoji" />
        <input className={`${fieldBase} min-w-48 flex-1`} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New habit, e.g. Walk after dinner" />
        <button className={btn.candy}>
          <Plus className="h-4 w-4" /> Add habit
        </button>
      </form>
      {habits.length < 3 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {IDEAS.map((i) => (
            <button key={i} onClick={() => add(i.slice(i.indexOf(" ") + 1), i.split(" ")[0])} className="rounded-full bg-white/70 px-3 py-1 text-xs font-bold text-muted ring-1 ring-line hover:text-grape">
              + {i}
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}
