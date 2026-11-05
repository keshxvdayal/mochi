import { withUser } from "@/lib/session";
import { mutate, today } from "@/lib/store";

/** Toggle today's check for a habit. Checking earns 5 XP; unchecking gives it back. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withUser(async (uid) => {
    const result = await mutate(uid, (db) => {
      const h = db.habits.find((x) => x.id === id);
      if (!h) return null;
      const t = today(db.timezone);
      const done = h.log.includes(t);
      h.log = done ? h.log.filter((d) => d !== t) : [...h.log, t];
      db.xp = Math.max(0, db.xp + (done ? -5 : 5));
      return { done: !done };
    });
    return result ? Response.json(result) : Response.json({ error: "Not found." }, { status: 404 });
  });
}
