import { aiEnabled } from "@/lib/ai";
import { underLimit } from "@/lib/auth";
import { withUser } from "@/lib/session";
import { synthesize } from "@/lib/tts";

export const maxDuration = 60;

const PER_HOUR = Number(process.env.MOCHI_TTS_LIMIT_PER_HOUR ?? 300);

/** Natural voice for the companion. The client falls back to the browser's voice if this fails. */
export async function POST(req: Request) {
  return withUser(async (uid) => {
    if (!aiEnabled()) return new Response("No API key", { status: 503 });
    const { text, mood, voice } = (await req.json().catch(() => ({}))) as { text?: string; mood?: string; voice?: string };
    const say = text?.trim().slice(0, 900);
    if (!say) return new Response("Nothing to say", { status: 400 });
    if (!(await underLimit(`tts:${uid}`, PER_HOUR, 3600))) return new Response("Voice limit reached", { status: 429 });
    try {
      const audio = await synthesize(say, mood ?? "neutral", voice ?? "Leda");
      return new Response(new Uint8Array(audio), { headers: { "Content-Type": "audio/wav", "Cache-Control": "no-store" } });
    } catch (err) {
      console.error("[tts]", err instanceof Error ? err.message.slice(0, 200) : err);
      return new Response("Voice unavailable", { status: 503 });
    }
  });
}
