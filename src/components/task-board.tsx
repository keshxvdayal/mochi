"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CalendarDays, Check, ChevronDown, Plus, Sparkles, Trash2, Trophy } from "lucide-react";
import { btn, Card, Empty, fieldBase, Pill, Title } from "@/components/ui";
import { api } from "@/lib/client-api";
import type { Task } from "@/lib/types";

function fmtDue(due: string, today: string) {
  if (due === today) return "Today";
  const d = new Date(`${due}T12:00:00`);
  const diff = Math.round((d.getTime() - new Date(`${today}T12:00:00`).getTime()) / 86400_000);
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff < 0) return `${-diff} days late`;
  if (diff < 7) return d.toLocaleDateString("en-IN", { weekday: "long" });
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export function TaskBoard({ tasks, goals, today, companionName, children }: { tasks: Task[]; goals: { id: string; title: string }[]; today: string; companionName: string; children?: React.ReactNode }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [due, setDue] = useState(today);
  const [priority, setPriority] = useState<Task["priority"]>("medium");
  const [toast, setToast] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);

  const open = tasks.filter((t) => !t.done);
  const challenges = open.filter((t) => t.kind === "challenge");
  const normal = open.filter((t) => t.kind === "task");
  const groups = [
    { key: "overdue", label: "Overdue", tone: "rose" as const, items: normal.filter((t) => t.due && t.due < today) },
    { key: "today", label: "Today", tone: "grape" as const, items: normal.filter((t) => t.due === today) },
    { key: "later", label: "Upcoming & someday", tone: "sky" as const, items: normal.filter((t) => !t.due || t.due > today).sort((a, b) => (a.due ?? "9").localeCompare(b.due ?? "9")) },
  ];
  const done = tasks.filter((t) => t.done).sort((a, b) => (b.doneAt ?? "").localeCompare(a.doneAt ?? ""));

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    await api("/api/items/tasks", "POST", { title, due: due || null, priority });
    setTitle("");
    router.refresh();
  }

  async function patch(t: Task, body: Partial<Task>) {
    const r = await api<{ xpGained: number }>(`/api/items/tasks/${t.id}`, "PATCH", body);
    if (r.xpGained > 0) {
      setToast(`+${r.xpGained} XP! ${t.kind === "challenge" ? "Challenge crushed! 🏆" : "Nice work! ✨"}`);
      setTimeout(() => setToast(null), 2200);
    }
    router.refresh();
  }

  async function remove(t: Task) {
    await api(`/api/items/tasks/${t.id}`, "DELETE");
    router.refresh();
  }

  const goalName = (id: string | null) => goals.find((g) => g.id === id)?.title;

  const row = (t: Task) => (
    <div key={t.id} className="pop group rounded-2xl bg-white p-3 ring-1 ring-line transition hover:ring-violet-200">
      <div className="flex items-start gap-3">
        <button onClick={() => patch(t, { done: !t.done })} className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg border-2 transition ${t.done ? "border-emerald-400 bg-emerald-400 text-white" : "border-violet-200 hover:border-violet-400 hover:bg-violet-50"}`} aria-label="Toggle done">
          {t.done && <Check className="h-4 w-4" />}
        </button>
        <div className="min-w-0 flex-1">
          <p className={`font-bold ${t.done ? "text-muted line-through" : ""}`}>{t.title}</p>
          {t.notes && <p className="mt-0.5 text-sm text-muted">{t.notes}</p>}
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {t.due && <Pill tone={t.due < today && !t.done ? "rose" : "sky"}><CalendarDays className="h-3 w-3" /> {fmtDue(t.due, today)}</Pill>}
            {t.priority === "high" && <Pill tone="pink">High priority</Pill>}
            <Pill tone="amber">+{t.xp} XP</Pill>
            {t.source === "companion" && <Pill tone="grape"><Sparkles className="h-3 w-3" /> from {companionName}</Pill>}
            {goalName(t.goalId) && <Pill tone="mint">🎯 {goalName(t.goalId)}</Pill>}
          </div>
          {t.steps.length > 0 && (
            <div className="mt-2 space-y-1">
              {t.steps.map((s, i) => (
                <label key={i} className="flex cursor-pointer items-center gap-2 text-sm">
                  <input type="checkbox" checked={s.done} onChange={() => patch(t, { steps: t.steps.map((x, j) => (j === i ? { ...x, done: !x.done } : x)) })} className="h-4 w-4 accent-violet-500" />
                  <span className={s.done ? "text-muted line-through" : ""}>{s.text}</span>
                </label>
              ))}
            </div>
          )}
        </div>
        <button onClick={() => remove(t)} className="rounded-lg p-1.5 text-muted opacity-0 transition hover:bg-rose-50 hover:text-rose-600 group-hover:opacity-100" aria-label="Delete">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );

  return (
    <div>
      <Title emoji="✅" title="Tasks, habits & challenges" subtitle={`${open.length} open · ${done.length} done. Finish things to earn XP and level up.`} />
      {children}
      {toast && <div className="pop fixed left-1/2 top-24 z-50 -translate-x-1/2 rounded-2xl bg-emerald-500 px-5 py-3 font-extrabold text-white shadow-xl">{toast}</div>}

      <form onSubmit={add} className="glass mb-6 flex flex-wrap gap-2 rounded-3xl p-3">
        <input className={`${fieldBase} min-w-56 flex-1`} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a task… e.g. Finish DBMS assignment" />
        <input type="date" className={`${fieldBase} w-auto`} value={due} onChange={(e) => setDue(e.target.value)} />
        <select className={`${fieldBase} w-auto`} value={priority} onChange={(e) => setPriority(e.target.value as Task["priority"])}>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
        <button className={btn.candy}><Plus className="h-4 w-4" /> Add</button>
      </form>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          {groups.map((g) =>
            g.items.length ? (
              <section key={g.key}>
                <h2 className="mb-2 flex items-center gap-2 text-sm font-extrabold uppercase tracking-wider text-muted">{g.label} <Pill tone={g.tone}>{g.items.length}</Pill></h2>
                <div className="space-y-2">{g.items.map(row)}</div>
              </section>
            ) : null,
          )}
          {normal.length === 0 && <Empty emoji="🌈" title="All clear!">Add a task above, or ask {companionName} to plan your day.</Empty>}

          {done.length > 0 && (
            <section>
              <button onClick={() => setShowDone((v) => !v)} className="mb-2 flex items-center gap-1 text-sm font-extrabold uppercase tracking-wider text-muted">
                Done ({done.length}) <ChevronDown className={`h-4 w-4 transition ${showDone ? "rotate-180" : ""}`} />
              </button>
              {showDone && <div className="space-y-2">{done.slice(0, 30).map(row)}</div>}
            </section>
          )}
        </div>

        <aside>
          <Card className="p-5">
            <h2 className="mb-1 flex items-center gap-2 text-lg font-extrabold"><Trophy className="h-5 w-5 text-amber-500" /> Challenges</h2>
            <p className="mb-4 text-sm text-muted">Harder missions with big XP. {companionName} makes them for you.</p>
            <div className="space-y-2">
              {challenges.length ? challenges.map(row) : <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">No active challenges.</p>}
            </div>
            <Link href={`/?ask=${encodeURIComponent("Give me a tough but fun 7-day challenge based on my goals")}`} className={`${btn.soft} mt-4 w-full`}>
              <Sparkles className="h-4 w-4 text-violet-500" /> Ask for a challenge
            </Link>
          </Card>
        </aside>
      </div>
    </div>
  );
}
