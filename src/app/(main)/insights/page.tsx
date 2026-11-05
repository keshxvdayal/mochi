import Link from "next/link";
import { Sparkles } from "lucide-react";
import { btn, Card, Pill, Progress, Title } from "@/components/ui";
import { habitStreak, lastDays, levelFor, overdueContacts, stalledGoals, streak, taskBuckets, weekStats } from "@/lib/progress";
import { pageDb } from "@/lib/page-data";
import { today } from "@/lib/store";

const MOOD_EMOJI = ["", "😢", "😕", "😐", "🙂", "🤩"];

export default async function InsightsPage() {
  const db = await pageDb();
  const t = today();
  const w = weekStats(db, t);
  const lv = levelFor(db.xp);
  const s = streak(db.tasks, db.checkins, t);
  const b = taskBuckets(db.tasks, t);
  const friends = overdueContacts(db, t);
  const goals = db.goals.filter((g) => g.status === "active");
  const stalled = stalledGoals(db);
  const max = Math.max(1, ...w.series.map((x) => x.done));
  const week = lastDays(t, 7);
  const habits = db.habits.map((h) => ({ ...h, count: week.filter((d) => h.log.includes(d)).length, streak: habitStreak(h.log, t) }));

  const right: string[] = [];
  const wrong: string[] = [];
  if (w.completed >= 5) right.push(`You finished ${w.completed} tasks this week. That's real momentum.`);
  else if (w.completed > 0) right.push(`You finished ${w.completed} task${w.completed === 1 ? "" : "s"} this week.`);
  if (s >= 3) right.push(`${s}-day streak. Consistency beats intensity.`);
  if (w.checkins >= 4) right.push("You've been checking in on your feelings regularly.");
  if (goals.some((g) => g.progress >= 50)) right.push(`Good progress on “${goals.find((g) => g.progress >= 50)!.title}”.`);
  if (b.overdue.length) wrong.push(`${b.overdue.length} task${b.overdue.length === 1 ? " is" : "s are"} overdue: ${b.overdue.slice(0, 3).map((x) => `“${x.title}”`).join(", ")}.`);
  if (w.completionRate !== null && w.completionRate < 50) wrong.push(`Only ${w.completionRate}% of tasks due this week got done. Try planning fewer, smaller tasks.`);
  if (stalled.length) wrong.push(`“${stalled[0].title}” hasn't moved in a while.`);
  if (friends.length) wrong.push(`You haven't talked to ${friends.slice(0, 2).map((f) => f.name).join(" or ")} in a while.`);
  if (w.avgMood !== null && w.avgMood < 2.6) wrong.push("Your mood has been low this week. Be gentle with yourself and talk to someone you trust.");
  for (const h of habits) {
    if (h.count >= 5) right.push(`${h.emoji} ${h.title}: ${h.count}/7 days this week. Rock solid.`);
    else if (h.count <= 2 && h.createdAt.slice(0, 10) < week[0]) wrong.push(`${h.emoji} ${h.title} only happened ${h.count}/7 days. Make it smaller or tie it to something you already do.`);
  }
  if (!right.length) right.push("You showed up and opened this page. That counts!");

  return (
    <div>
      <Title emoji="✨" title="Insights" subtitle="How your week is really going." action={<Link href={`/?ask=${encodeURIComponent("Be honest: what am I doing right and what am I doing wrong lately? Give me 3 fixes.")}`} className={btn.candy}><Sparkles className="h-4 w-4" /> Honest review from {db.companion.name}</Link>} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Level", value: lv.level, sub: `${db.xp} XP · ${lv.span - lv.into} to next`, extra: <Progress value={lv.pct} className="mt-2" /> },
          { label: "Streak", value: `🔥 ${s}`, sub: "days in a row" },
          { label: "Done this week", value: w.completed, sub: w.completionRate !== null ? `${w.completionRate}% of due tasks` : "no due tasks this week" },
          { label: "Average mood", value: w.avgMood !== null ? MOOD_EMOJI[Math.round(w.avgMood)] : "—", sub: `${w.checkins} check-ins this week` },
        ].map((x) => (
          <Card key={x.label} className="p-5">
            <p className="text-xs font-extrabold uppercase tracking-wider text-muted">{x.label}</p>
            <p className="mt-1 text-3xl font-extrabold">{x.value}</p>
            <p className="text-sm text-muted">{x.sub}</p>
            {x.extra}
          </Card>
        ))}
      </div>

      <Card className="mt-4 p-5">
        <p className="mb-4 font-extrabold">Last 7 days</p>
        <div className="flex h-40 items-end gap-3">
          {w.series.map((d) => (
            <div key={d.date} className="flex flex-1 flex-col items-center gap-1.5">
              <span className="text-lg">{d.mood ? MOOD_EMOJI[d.mood] : ""}</span>
              <span className="text-xs font-bold text-muted">{d.done || ""}</span>
              <div className="candy w-full max-w-12 rounded-xl transition-all" style={{ height: `${Math.max(6, (d.done / max) * 90)}px`, opacity: d.done ? 1 : 0.2 }} />
              <span className="text-xs font-bold text-muted">{new Date(`${d.date}T12:00:00`).toLocaleDateString("en-IN", { weekday: "short" })}</span>
            </div>
          ))}
        </div>
      </Card>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Card className="p-5">
          <p className="mb-3 text-lg font-extrabold">💚 What you&apos;re doing right</p>
          <ul className="space-y-2">{right.map((r) => <li key={r} className="rounded-2xl bg-emerald-50 px-4 py-2.5 text-[15px]">{r}</li>)}</ul>
        </Card>
        <Card className="p-5">
          <p className="mb-3 text-lg font-extrabold">🧡 What needs attention</p>
          {wrong.length ? <ul className="space-y-2">{wrong.map((r) => <li key={r} className="rounded-2xl bg-orange-50 px-4 py-2.5 text-[15px]">{r}</li>)}</ul> : <p className="rounded-2xl bg-emerald-50 px-4 py-3">Nothing worrying right now. Keep going! 🎉</p>}
        </Card>
      </div>

      {habits.length > 0 && (
        <Card className="mt-4 p-5">
          <p className="mb-3 text-lg font-extrabold">🔁 Habits this week</p>
          <div className="space-y-2.5">
            {habits.map((h) => (
              <div key={h.id} className="flex items-center gap-3">
                <span className="w-44 truncate text-sm font-bold">{h.emoji} {h.title}</span>
                <div className="flex gap-1">
                  {week.map((d) => <span key={d} className={`h-5 w-5 rounded-md ${h.log.includes(d) ? "candy" : "bg-violet-100/70"}`} />)}
                </div>
                <span className="text-xs font-bold text-muted">{h.count}/7{h.streak ? ` · 🔥${h.streak}` : ""}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {goals.length > 0 && (
        <Card className="mt-4 p-5">
          <p className="mb-3 text-lg font-extrabold">🎯 Goals</p>
          <div className="space-y-3">
            {goals.map((g) => (
              <div key={g.id}>
                <div className="mb-1 flex justify-between text-sm font-bold"><span>{g.title}</span><Pill>{g.progress}%</Pill></div>
                <Progress value={g.progress} />
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
