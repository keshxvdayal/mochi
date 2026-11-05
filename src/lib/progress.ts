import type { CheckIn, Db, Task } from "@/lib/types";

/** Level curve: level n needs 50·n² XP. */
export function levelFor(xp: number) {
  const level = Math.floor(Math.sqrt(xp / 50)) + 1;
  const floor = 50 * (level - 1) ** 2;
  const next = 50 * level ** 2;
  return { level, into: xp - floor, span: next - floor, pct: Math.round(((xp - floor) / (next - floor)) * 100) };
}

const day = (iso: string) => iso.slice(0, 10);

function shiftDay(d: string, by: number) {
  const t = new Date(`${d}T12:00:00`);
  t.setDate(t.getDate() + by);
  return t.toLocaleDateString("en-CA");
}

/** Consecutive days (ending today or yesterday) with at least one finished task or a check-in. */
export function streak(tasks: Task[], checkins: CheckIn[], todayStr: string): number {
  const active = new Set<string>([...tasks.filter((t) => t.doneAt).map((t) => day(new Date(t.doneAt!).toLocaleDateString("en-CA"))), ...checkins.map((c) => c.date)]);
  let d = active.has(todayStr) ? todayStr : shiftDay(todayStr, -1);
  let n = 0;
  while (active.has(d)) {
    n++;
    d = shiftDay(d, -1);
  }
  return n;
}

export function taskBuckets(tasks: Task[], todayStr: string) {
  const open = tasks.filter((t) => !t.done);
  return {
    overdue: open.filter((t) => t.due && t.due < todayStr),
    today: open.filter((t) => t.due === todayStr),
    upcoming: open.filter((t) => !t.due || t.due > todayStr),
    done: tasks.filter((t) => t.done),
  };
}

/** Stats for the last `days` days: what's going well and what isn't. */
export function weekStats(db: Db, todayStr: string, days = 7) {
  const from = shiftDay(todayStr, -(days - 1));
  const inRange = (d: string | null) => Boolean(d && d >= from && d <= todayStr);
  const completed = db.tasks.filter((t) => t.doneAt && inRange(new Date(t.doneAt).toLocaleDateString("en-CA")));
  const dueInRange = db.tasks.filter((t) => inRange(t.due));
  const missed = dueInRange.filter((t) => !t.done && t.due! < todayStr);
  const checkins = db.checkins.filter((c) => inRange(c.date));
  const avgMood = checkins.length ? checkins.reduce((s, c) => s + c.mood, 0) / checkins.length : null;
  const series = Array.from({ length: days }, (_, i) => {
    const d = shiftDay(from, i);
    return {
      date: d,
      done: completed.filter((t) => new Date(t.doneAt!).toLocaleDateString("en-CA") === d).length,
      mood: db.checkins.find((c) => c.date === d)?.mood ?? null,
    };
  });
  return {
    from,
    completed: completed.length,
    missed: missed.length,
    completionRate: dueInRange.length ? Math.round((dueInRange.filter((t) => t.done).length / dueInRange.length) * 100) : null,
    avgMood,
    checkins: checkins.length,
    series,
    missedTitles: missed.map((t) => t.title),
    completedTitles: completed.map((t) => t.title),
  };
}

/** Friends you haven't talked to in a while, closest first. */
export function overdueContacts(db: Db, todayStr: string) {
  const gap = { 5: 7, 4: 14, 3: 30, 2: 60, 1: 120 } as Record<number, number>;
  return db.people
    .filter((p) => {
      if (!p.lastContact) return p.closeness >= 3;
      const days = (new Date(todayStr).getTime() - new Date(p.lastContact).getTime()) / 86400_000;
      return days >= gap[p.closeness];
    })
    .sort((a, b) => b.closeness - a.closeness);
}

/** Active goals under 20% that were created more than two weeks ago. */
export function stalledGoals(db: Db) {
  const cutoff = Date.now() - 14 * 86400_000;
  return db.goals.filter((g) => g.status === "active" && g.progress < 20 && new Date(g.createdAt).getTime() < cutoff);
}

/** Current run of consecutive days a habit was done (today counts if done; otherwise up to yesterday). */
export function habitStreak(log: string[], todayStr: string): number {
  const set = new Set(log);
  let d = set.has(todayStr) ? todayStr : shiftDay(todayStr, -1);
  let n = 0;
  while (set.has(d)) {
    n++;
    d = shiftDay(d, -1);
  }
  return n;
}

/** The last `n` days as YYYY-MM-DD, oldest first. */
export function lastDays(todayStr: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => shiftDay(todayStr, i - (n - 1)));
}
