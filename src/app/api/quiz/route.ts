import { withUser } from "@/lib/session";
import { mutate } from "@/lib/store";

const XP_PER_CORRECT = 10;

/** Record an answer to a quiz question. Each question can be answered once. */
export async function POST(req: Request) {
  return withUser(async (uid) => {
    const b = (await req.json().catch(() => ({}))) as { messageId?: string; artifactId?: string; question?: number; choice?: number };
    const result = await mutate(uid, (db) => {
      const msg = db.messages.find((m) => m.id === b.messageId);
      const art = msg?.artifacts.find((a) => a.id === b.artifactId);
      if (!art || art.kind !== "quiz") return null;
      const q = art.questions[b.question ?? -1];
      if (!q || art.answers[b.question!] !== null || typeof b.choice !== "number") return null;
      art.answers[b.question!] = b.choice;
      const correct = b.choice === q.answer;
      if (correct) {
        art.xpEarned += XP_PER_CORRECT;
        db.xp += XP_PER_CORRECT;
      }
      return { correct, answer: q.answer, xp: correct ? XP_PER_CORRECT : 0 };
    });
    return result ? Response.json(result) : Response.json({ error: "Can't answer that question." }, { status: 400 });
  });
}
