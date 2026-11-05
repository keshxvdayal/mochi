import { aiEnabled, chat, type ChatEvent } from "@/lib/ai";
import { underLimit } from "@/lib/auth";
import { withUser } from "@/lib/session";
import { mutate } from "@/lib/store";

export const maxDuration = 300;

/** Messages per person per hour, so one account can't use up the shared AI quota. */
const PER_HOUR = Number(process.env.MOCHI_CHAT_LIMIT_PER_HOUR ?? 60);

/** Streams newline-delimited JSON ChatEvents. */
export async function POST(req: Request) {
  return withUser(async (uid) => {
    const { text } = (await req.json().catch(() => ({}))) as { text?: string };
    const message = text?.trim().slice(0, 4000);
    if (!message) return Response.json({ error: "Say something!" }, { status: 400 });
    if (!aiEnabled()) {
      console.error("[chat] GEMINI_API_KEY is not set");
      return Response.json({ error: "My brain isn't switched on yet. Please try again a bit later." }, { status: 503 });
    }
    if (!(await underLimit(`chat:${uid}`, PER_HOUR, 3600))) {
      return Response.json({ error: "Phew, we've talked a LOT this hour! My head needs a little rest. Come back in a bit?" }, { status: 429 });
    }
    const enc = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (ev: ChatEvent) => controller.enqueue(enc.encode(JSON.stringify(ev) + "\n"));
        for await (const ev of chat(uid, message)) send(ev);
        controller.close();
      },
    });
    return new Response(body, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
  });
}

/** Clear the conversation (memories, tasks and goals stay). */
export async function DELETE() {
  return withUser(async (uid) => {
    await mutate(uid, (db) => void (db.messages = []));
    return Response.json({ ok: true });
  });
}
