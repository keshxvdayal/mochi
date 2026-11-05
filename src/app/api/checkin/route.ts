import { mutate, newId, today } from "@/lib/store";

/** One check-in per day; checking in again replaces today's. First check-in of the day earns 10 XP. */
export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { mood?: number; energy?: number; note?: string };
  const mood = Math.round(Number(b.mood));
  const energy = Math.round(Number(b.energy ?? 3));
  if (!(mood >= 1 && mood <= 5) || !(energy >= 1 && energy <= 5)) return Response.json({ error: "Mood and energy are 1–5." }, { status: 400 });
  const date = today();
  await mutate((db) => {
    const existing = db.checkins.find((c) => c.date === date);
    if (existing) Object.assign(existing, { mood, energy, note: (b.note ?? "").slice(0, 500) });
    else {
      db.checkins.push({ id: newId(), date, mood, energy, note: (b.note ?? "").slice(0, 500) });
      db.xp += 10;
    }
  });
  return Response.json({ ok: true });
}
