import { ApiError } from "@google/genai";
import { availableModels, coolDown, coolDownFor, getClient } from "@/lib/ai";
import { stripStageDirections } from "@/lib/stage-directions";
import { GEMINI_VOICES, MOODS, type Mood } from "@/lib/types";

const TTS_MODELS = (process.env.GEMINI_TTS_MODEL ? [process.env.GEMINI_TTS_MODEL] : []).concat(["gemini-3.8-flash-tts", "gemini-3.1-flash-tts-preview", "gemini-2.5-flash-preview-tts"]);

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

export async function synthesize(text: string, mood: string, voice: string): Promise<Buffer> {
  const m = (MOODS as readonly string[]).includes(mood) ? (mood as Mood) : "neutral";
  const v = voice in GEMINI_VOICES ? voice : "Leda";
  let lastErr: unknown;
  for (const model of availableModels(TTS_MODELS)) {
    try {
      const r = await getClient().models.generateContent({
        model,
        contents: [{ role: "user", parts: [{ text: ttsPrompt(text, m) }] }],
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
      if (err instanceof ApiError && [429, 500, 503].includes(err.status)) coolDown(model, coolDownFor(err.status));
    }
  }
  throw lastErr;
}
