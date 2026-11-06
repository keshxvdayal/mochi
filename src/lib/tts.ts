import { ApiError } from "@google/genai";
import { coolDown, coolDownFor, getClient, msUntilReady, readyModels, retryDelayMs } from "@/lib/ai";
import { kv } from "@/lib/kv";
import { stripStageDirections } from "@/lib/stage-directions";
import { GEMINI_VOICES, MOODS, type Mood } from "@/lib/types";

const TTS_MODELS = (process.env.GEMINI_TTS_MODEL ? [process.env.GEMINI_TTS_MODEL] : []).concat(["gemini-3.8-flash-tts", "gemini-3.8-flash-lite-tts", "gemini-3.1-flash-tts-preview", "gemini-2.5-flash-preview-tts"]);

/** How the companion should sound for each mood. Short cues: long descriptions make the voice slow and theatrical. */
const DELIVERY: Record<Mood, string> = {
  neutral: "warm and friendly",
  happy: "cheerful",
  excited: "excited",
  love: "sweet and affectionate",
  proud: "proud",
  playful: "playful",
  sad: "gentle and soft",
  worried: "gently concerned",
  angry: "cutely pouty and frustrated",
  surprised: "surprised",
  thinking: "thoughtful",
  sleepy: "sleepy",
};

/**
 * The request for the voice model. The delivery note sits in its own section,
 * apart from the words, and the model is told to speak only the transcript.
 * A bare "Say cheerfully: …" sometimes got read out loud.
 */
/**
 * Models that read every word they're given out loud, notes included ("lite"
 * models; tested by transcribing their audio back). They only get the words,
 * so the tone follows the voice's natural delivery.
 */
export const speaksEverything = (model: string) => /lite/i.test(model);

/** What to send a given model: the words alone, or the words plus delivery notes. */
export function ttsInput(model: string, text: string, mood: Mood): string {
  return speaksEverything(model) ? stripStageDirections(text).trim() : ttsPrompt(text, mood);
}

export function ttsPrompt(text: string, mood: Mood): string {
  return `Read the transcript aloud. Speak ONLY the words under TRANSCRIPT, exactly as written. Never say the notes, the tone, or any labels out loud.

### DIRECTOR'S NOTES
Character: a small, cute, friendly companion talking to a close friend.
Tone: ${DELIVERY[mood]}, natural and conversational.

### TRANSCRIPT
${stripStageDirections(text).trim()}`;
}

/** Raw 16-bit PCM → WAV, so the browser can decode it. */
function wav(pcm: Buffer, rate: number): Buffer {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write("WAVE", 8);
  h.write("fmt ", 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

/** Every voice model is out of its daily quota until `retryAfterMs` has passed. */
export class VoiceQuotaError extends Error {
  constructor(public retryAfterMs: number) {
    super("Voice quota used up");
  }
}

/**
 * Which voice models are out of quota, and until when, shared through the
 * database: every server instance (Vercel starts many) skips them at once
 * instead of each finding out the slow way. Per model, because each has its own quota.
 */
const QUOTA_KEY = "tts:models-out-until";
async function loadSharedCooldowns() {
  try {
    const out = (await kv().getDoc<Record<string, number>>(QUOTA_KEY)).value ?? {};
    for (const [model, until] of Object.entries(out)) if (until > Date.now()) coolDown(model, until - Date.now());
  } catch {
    /* best effort */
  }
}
async function saveSharedCooldown(model: string, until: number) {
  try {
    for (let i = 0; i < 3; i++) {
      const doc = await kv().getDoc<Record<string, number>>(QUOTA_KEY);
      const out = Object.fromEntries(Object.entries(doc.value ?? {}).filter(([, t]) => t > Date.now()));
      out[model] = until;
      if (await kv().putDoc(QUOTA_KEY, out, doc.rev)) return;
    }
  } catch {
    /* best effort */
  }
}

export async function synthesize(text: string, mood: string, voice: string): Promise<Buffer> {
  const m = (MOODS as readonly string[]).includes(mood) ? (mood as Mood) : "neutral";
  const v = voice in GEMINI_VOICES ? voice : "Leda";
  // Skip models that are out of quota (here or on another instance) instead of waiting on doomed requests.
  await loadSharedCooldowns();
  const ready = readyModels(TTS_MODELS);
  if (!ready.length) throw new VoiceQuotaError(msUntilReady(TTS_MODELS));
  let lastErr: unknown;
  for (const model of ready) {
    try {
      const r = await getClient().models.generateContent({
        model,
        contents: [{ role: "user", parts: [{ text: ttsInput(model, text, m) }] }],
        config: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: v } } } },
      });
      const data = r.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData;
      if (!data?.data) throw new Error("No audio returned");
      const bytes = Buffer.from(data.data, "base64");
      if (/wav/i.test(data.mimeType ?? "")) return bytes;
      const rate = Number(/rate=(\d+)/.exec(data.mimeType ?? "")?.[1] ?? 24000);
      return wav(bytes, rate);
    } catch (err) {
      lastErr = err;
      if (err instanceof ApiError && [400, 401, 403].includes(err.status)) break;
      // Free keys get a few voice requests a day; Google says how long until they reset.
      if (err instanceof ApiError && [429, 500, 503].includes(err.status)) {
        const wait = (err.status === 429 && retryDelayMs(err)) || coolDownFor(err.status);
        coolDown(model, wait);
        if (err.status === 429) await saveSharedCooldown(model, Date.now() + wait);
      }
    }
  }
  if (!readyModels(TTS_MODELS).length) throw new VoiceQuotaError(msUntilReady(TTS_MODELS));
  throw lastErr;
}
