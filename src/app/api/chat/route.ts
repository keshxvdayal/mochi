import { aiEnabled, chat, type ChatEvent } from "@/lib/ai";
import { mutate } from "@/lib/store";

export const maxDuration = 300;

/** Streams newline-delimited JSON ChatEvents. */
export async function POST(req: Request) {
  const { text } = (await req.json().catch(() => ({}))) as { text?: string };
  const message = text?.trim().slice(0, 4000);
  if (!message) return Response.json({ error: "Say something!" }, { status: 400 });
  if (!aiEnabled()) {
    return Response.json({ error: "I need my brain first: add GEMINI_API_KEY to .env.local and restart the app." }, { status: 503 });
  }
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (ev: ChatEvent) => controller.enqueue(enc.encode(JSON.stringify(ev) + "\n"));
      for await (const ev of chat(message)) send(ev);
      controller.close();
    },
  });
  return new Response(body, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}

/** Clear the conversation (memories, tasks and goals stay). */
export async function DELETE() {
  await mutate((db) => void (db.messages = []));
  return Response.json({ ok: true });
}
