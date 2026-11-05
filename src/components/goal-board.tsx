"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CalendarDays, Check, Plus, Sparkles, Trash2 } from "lucide-react";
import { btn, Card, Empty, field, Pill, Progress, Title } from "@/components/ui";
import { api } from "@/lib/client-api";
import type { Goal } from "@/lib/types";

const CATS = ["career", "study", "health", "money", "social", "skills", "life"];
const CAT_EMOJI: Record<string, string> = { career: "💼", study: "📚", health: "💪", money: "💰", social: "🤝", skills: "🛠️", life: "🌱" };

export function GoalBoard({ goals, taskCounts, companionName }: { goals: Goal[]; taskCounts: Record<string, { open: number; done: number }>; companionName: string }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("career");
  const [target, setTarget] = useState("");
  const [why, setWhy] = useState("");
  const [adding, setAdding] = useState(false);
  const [newMilestone, setNewMilestone] = useState<Record<string, string>>({});

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    await api("/api/items/goals", "POST", { title, category, targetDate: target || null, why });
    setTitle("");
    setWhy("");
    setTarget("");
    setAdding(false);
    router.refresh();
  }
  const patch = async (g: Goal, body: Partial<Goal>) => {
    await api(`/api/items/goals/${g.id}`, "PATCH", body);
    router.refresh();
  };

  function toggleMilestone(g: Goal, id: string) {
    const milestones = g.milestones.map((m) => (m.id === id ? { ...m, done: !m.done } : m));
    const progress = Math.round((milestones.filter((m) => m.done).length / milestones.length) * 100);
    void patch(g, { milestones, progress, status: progress === 100 ? "done" : g.status === "done" ? "active" : g.status });
  }

  const active = goals.filter((g) => g.status !== "done");
  const done = goals.filter((g) => g.status === "done");

  return (
    <div>
      <Title emoji="🎯" title="Goals" subtitle="Who you're becoming, one milestone at a time." action={<button onClick={() => setAdding((v) => !v)} className={btn.candy}><Plus className="h-4 w-4" /> New goal</button>} />

      {adding && (
        <form onSubmit={add} className="glass pop mb-6 grid gap-3 rounded-3xl p-5 sm:grid-cols-2">
          <input className={`${field} sm:col-span-2`} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Land a UX design internship" autoFocus />
          <select className={field} value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATS.map((c) => <option key={c} value={c}>{CAT_EMOJI[c]} {c}</option>)}
          </select>
          <input type="date" className={field} value={target} onChange={(e) => setTarget(e.target.value)} />
          <input className={`${field} sm:col-span-2`} value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Why does this matter to you?" />
          <div className="flex gap-2 sm:col-span-2">
            <button className={btn.candy}>Save goal</button>
            <button type="button" onClick={() => setAdding(false)} className={btn.ghost}>Cancel</button>
          </div>
        </form>
      )}

      {active.length === 0 && !adding && (
        <Empty emoji="🌟" title="No goals yet">
          Add one, or <Link className="font-bold text-grape" href={`/?ask=${encodeURIComponent("Help me set 3 meaningful goals for the next 6 months")}`}>ask {companionName} to help you pick</Link>.
        </Empty>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {active.map((g) => (
          <Card key={g.id} className="pop p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-2xl">{CAT_EMOJI[g.category] ?? "🌱"}</p>
                <h3 className="mt-1 text-lg font-extrabold leading-snug">{g.title}</h3>
                {g.why && <p className="mt-0.5 text-sm text-muted">{g.why}</p>}
              </div>
              <button onClick={() => confirm("Delete this goal?") && api(`/api/items/goals/${g.id}`, "DELETE").then(() => router.refresh())} className="rounded-lg p-1.5 text-muted hover:bg-rose-50 hover:text-rose-600" aria-label="Delete goal">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {g.targetDate && <Pill tone="sky"><CalendarDays className="h-3 w-3" /> by {new Date(`${g.targetDate}T12:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</Pill>}
              {taskCounts[g.id] && (taskCounts[g.id].open + taskCounts[g.id].done > 0) && <Pill tone="mint">{taskCounts[g.id].done}/{taskCounts[g.id].open + taskCounts[g.id].done} tasks</Pill>}
            </div>
            <div className="mt-4">
              <div className="mb-1 flex justify-between text-xs font-extrabold text-muted"><span>Progress</span><span>{g.progress}%</span></div>
              <Progress value={g.progress} />
              {g.milestones.length === 0 && (
                <input type="range" min={0} max={100} step={5} defaultValue={g.progress} onMouseUp={(e) => patch(g, { progress: Number((e.target as HTMLInputElement).value) })} onTouchEnd={(e) => patch(g, { progress: Number((e.target as HTMLInputElement).value) })} className="mt-2 w-full accent-violet-500" aria-label="Set progress" />
              )}
            </div>
            <div className="mt-4 space-y-1.5">
              {g.milestones.map((m) => (
                <button key={m.id} onClick={() => toggleMilestone(g, m.id)} className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-sm hover:bg-violet-50">
                  <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border-2 ${m.done ? "border-emerald-400 bg-emerald-400 text-white" : "border-violet-200"}`}>{m.done && <Check className="h-3.5 w-3.5" />}</span>
                  <span className={m.done ? "text-muted line-through" : "font-semibold"}>{m.title}</span>
                </button>
              ))}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const t = newMilestone[g.id]?.trim();
                  if (!t) return;
                  const milestones = [...g.milestones, { id: Math.random().toString(36).slice(2, 10), title: t, done: false }];
                  setNewMilestone({ ...newMilestone, [g.id]: "" });
                  void patch(g, { milestones, progress: Math.round((milestones.filter((m) => m.done).length / milestones.length) * 100) });
                }}
              >
                <input className="w-full rounded-xl bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted/60 focus:bg-white" value={newMilestone[g.id] ?? ""} onChange={(e) => setNewMilestone({ ...newMilestone, [g.id]: e.target.value })} placeholder="+ Add a milestone" />
              </form>
            </div>
            <Link href={`/?ask=${encodeURIComponent(`Break my goal "${g.title}" into a plan with weekly tasks`)}`} className={`${btn.soft} mt-4 w-full`}>
              <Sparkles className="h-4 w-4 text-violet-500" /> Make a plan with {companionName}
            </Link>
          </Card>
        ))}
      </div>

      {done.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-extrabold uppercase tracking-wider text-muted">Achieved 🏆</h2>
          <div className="flex flex-wrap gap-2">
            {done.map((g) => <Pill key={g.id} tone="mint">✓ {g.title}</Pill>)}
          </div>
        </section>
      )}
    </div>
  );
}
