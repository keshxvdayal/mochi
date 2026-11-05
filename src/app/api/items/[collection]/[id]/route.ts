import { COLLECTIONS, isCollection } from "@/lib/collections";
import { mutate, now } from "@/lib/store";
import type { Task } from "@/lib/types";

type Ctx = { params: Promise<{ collection: string; id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const { collection, id } = await params;
  if (!isCollection(collection)) return Response.json({ error: "Unknown collection." }, { status: 404 });
  const parsed = COLLECTIONS[collection].schema.partial().safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid data." }, { status: 400 });
  const result = await mutate((db) => {
    const list = db[collection] as { id: string }[];
    const item = list.find((x) => x.id === id);
    if (!item) return null;
    let xpGained = 0;
    if (collection === "tasks") {
      const t = item as Task;
      const data = parsed.data as Partial<Task>;
      // Completing a task pays its XP once; un-completing takes it back.
      if (data.done === true && !t.done) {
        t.doneAt = now();
        db.xp += t.xp;
        xpGained = t.xp;
      } else if (data.done === false && t.done) {
        t.doneAt = null;
        db.xp = Math.max(0, db.xp - t.xp);
        xpGained = -t.xp;
      }
    }
    Object.assign(item, parsed.data);
    return { xpGained };
  });
  return result ? Response.json({ ok: true, ...result }) : Response.json({ error: "Not found." }, { status: 404 });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { collection, id } = await params;
  if (!isCollection(collection)) return Response.json({ error: "Unknown collection." }, { status: 404 });
  await mutate((db) => {
    (db[collection] as { id: string }[]) = (db[collection] as { id: string }[]).filter((x) => x.id !== id);
  });
  return Response.json({ ok: true });
}
