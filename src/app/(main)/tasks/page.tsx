import { HabitBoard } from "@/components/habit-board";
import { TaskBoard } from "@/components/task-board";
import { pageDb } from "@/lib/page-data";
import { habitStreak, lastDays } from "@/lib/progress";
import { today } from "@/lib/store";

export default async function TasksPage() {
  const db = await pageDb();
  const t = today();
  const days = lastDays(t, 7);
  const habits = db.habits.map((h) => ({ id: h.id, title: h.title, emoji: h.emoji, week: days.map((d) => ({ date: d, done: h.log.includes(d) })), streak: habitStreak(h.log, t), doneToday: h.log.includes(t) }));
  return (
    <TaskBoard tasks={db.tasks} goals={db.goals.map((g) => ({ id: g.id, title: g.title }))} today={t} companionName={db.companion.name}>
      <HabitBoard habits={habits} companionName={db.companion.name} />
    </TaskBoard>
  );
}
