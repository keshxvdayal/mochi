import { COLLECTIONS, isCollection } from "@/lib/collections";
import { mutate, newId, now } from "@/lib/store";

export async function POST(req: Request, { params }: { params: Promise<{ collection: string }> }) {
  const { collection } = await params;
  if (!isCollection(collection)) return Response.json({ error: "Unknown collection." }, { status: 404 });
  const spec = COLLECTIONS[collection];
  const parsed = spec.schema.safeParse({ ...spec.defaults(), ...((await req.json().catch(() => ({}))) as object) });
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid data." }, { status: 400 });
  const id = newId();
  await mutate((db) => {
    const extra = collection === "tasks" ? { doneAt: null, source: "me" } : {};
    (db[collection] as unknown[]).push({ ...parsed.data, ...extra, id, createdAt: now() });
  });
  return Response.json({ id });
}
