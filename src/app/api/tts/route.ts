import { createHash } from "crypto";
import { aiEnabled } from "@/lib/ai";
import { underLimit } from "@/lib/auth";
import { demoKey, PUBLIC_LINES } from "@/lib/demo-lines";
import { kv } from "@/lib/kv";
import { currentUserId } from "@/lib/session";
import { synthesize, VoiceQuotaError } from "@/lib/tts";

export const maxDuration = 60;

const PER_HOUR = Number(process.env.MOCHI_TTS_LIMIT_PER_HOUR ?? 300);
/** Clips above this aren't cached (database rows stay small). */
const MAX_CACHED_BYTES = 700_000;

const wav = (audio: Uint8Array, cached: boolean) =>
  new Response(new Uint8Array(audio), { headers: { "Content-Type": "audio/wav", "Cache-Control": "no-store", "X-Mochi-Voice": cached ? "cache" : "gemini" } });

/**
 * Mochi's voice (Gemini text-to-speech). Every clip is cached by voice + mood +
 * text, so a line Mochi has said before (onboarding questions, greetings,
 * reactions, the landing page demo) never uses the daily quota again.
 */
export async function POST(req: Request) {
  if (!aiEnabled()) return new Response("No API key", { status: 503 });
  const { text, mood, voice } = (await req.json().catch(() => ({}))) as { text?: string; mood?: string; voice?: string };
  const say = text?.trim().slice(0, 900);
  if (!say) return new Response("Nothing to say", { status: 400 });

  // Visitors who aren't signed in can only hear the landing page's demo lines.
  const uid = await currentUserId();
  if (!uid && !PUBLIC_LINES.has(demoKey(say))) return new Response("Please sign in", { status: 401 });

  // v2: clips made before lite models got words-only requests may contain spoken instructions.
  const key = `tts2:${createHash("sha256").update(`${voice ?? "Leda"}|${mood ?? "neutral"}|${say}`).digest("base64url")}`;
  try {
    const hit = await kv().get(key);
    if (hit) return wav(Buffer.from(hit, "base64"), true);
  } catch {
    /* cache unavailable: just generate */
  }

  if (uid && !(await underLimit(`tts:${uid}`, PER_HOUR, 3600))) return new Response("Voice limit reached", { status: 429, headers: { "Retry-After": "600" } });
  try {
    const audio = await synthesize(say, mood ?? "neutral", voice ?? "Leda");
    if (audio.length <= MAX_CACHED_BYTES) await kv().setIfAbsent(key, audio.toString("base64")).catch(() => {});
    return wav(audio, false);
  } catch (err) {
    if (err instanceof VoiceQuotaError) {
      // Out of the free daily quota: tell the browser when to try again.
      return new Response("Voice quota used up", { status: 429, headers: { "Retry-After": String(Math.ceil(err.retryAfterMs / 1000)) } });
    }
    console.error("[tts]", err instanceof Error ? err.message.slice(0, 200) : err);
    return new Response("Voice unavailable", { status: 503 });
  }
}
