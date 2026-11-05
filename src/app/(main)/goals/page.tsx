import { GoalBoard } from "@/components/goal-board";
import { pageDb } from "@/lib/page-data";

export default async function GoalsPage() {
  const db = await pageDb();
  const taskCounts = Object.fromEntries(db.goals.map((g) => [g.id, { open: db.tasks.filter((t) => t.goalId === g.id && !t.done).length, done: db.tasks.filter((t) => t.goalId === g.id && t.done).length }]));
  return <GoalBoard goals={db.goals} taskCounts={taskCounts} companionName={db.companion.name} />;
}
