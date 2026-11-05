import { z } from "zod";
import { GoalSchema, HabitSchema, PersonSchema, TaskSchema } from "@/lib/types";

const MemorySchema = z.object({ text: z.string().min(1).max(400), category: z.string().max(40) });

/** Collections editable through /api/items/<collection>. */
export const COLLECTIONS = {
  people: { schema: PersonSchema, defaults: () => ({ relation: "", closeness: 3, lastContact: null, birthday: null, notes: "" }) },
  goals: { schema: GoalSchema, defaults: () => ({ why: "", category: "life", targetDate: null, progress: 0, status: "active", milestones: [] }) },
  tasks: { schema: TaskSchema, defaults: () => ({ notes: "", due: null, priority: "medium", category: "self", goalId: null, kind: "task", xp: 20, steps: [], done: false }) },
  memories: { schema: MemorySchema, defaults: () => ({ category: "other" }) },
  habits: { schema: HabitSchema, defaults: () => ({ emoji: "✨", log: [] }) },
} as const;

export type Collection = keyof typeof COLLECTIONS;
export const isCollection = (c: string): c is Collection => c in COLLECTIONS;
