"use client";

import { boundary, live, setListening, setSpeaking } from "@/lib/companion-state";

/** Text for the voice: no markdown, emoji, mood tags or links. */
export function speakable(text: string): string {
  return text
    .replace(/\[mood:[a-z]+\]/gi, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[*_#`>|~]/g, "")
    .replace(/^\s*[-•]\s+/gm, "")
    .replace(/\p{Extended_Pictographic}️?/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function voices(): SpeechSynthesisVoice[] {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return [];
  return window.speechSynthesis.getVoices();
}

/** A friendly default: prefer natural English voices. */
export function pickVoice(name: string): SpeechSynthesisVoice | null {
  const all = voices();
  if (name) {
    const v = all.find((x) => x.name === name);
    if (v) return v;
  }
  const prefs = [/samantha/i, /google uk english female/i, /google us english/i, /microsoft (aria|jenny|neerja)/i, /karen|moira|tessa|veena/i, /female/i];
  for (const p of prefs) {
    const v = all.find((x) => p.test(x.name) && /^en/i.test(x.lang));
    if (v) return v;
  }
  return all.find((x) => /^en/i.test(x.lang)) ?? all[0] ?? null;
}

export type VoiceOpts = { voiceOn: boolean; voiceName: string; pitch: number; rate: number; voiceEngine?: "natural" | "browser"; geminiVoice?: string };

let mouthTimer: ReturnType<typeof setInterval> | null = null;
let silentTimer: ReturnType<typeof setTimeout> | null = null;
let browserPending = 0;
let silentUntil = 0;

function startMouth(flap = true) {
  if (flap && !mouthTimer) mouthTimer = setInterval(() => boundary(), 260);
  setSpeaking(true);
}

function stopMouth() {
  if (mouthTimer) clearInterval(mouthTimer);
  if (silentTimer) clearTimeout(silentTimer);
  mouthTimer = null;
  silentTimer = null;
  browserPending = 0;
  silentUntil = 0;
  live.audioLevel = -1;
  setSpeaking(false);
}

/* ------------------------------------------------------------------ *
 * Natural voice (Gemini TTS) played through Web Audio, with the mouth *
 * driven by the real loudness of the audio.                           *
 * ------------------------------------------------------------------ */
let ctx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let current: AudioBufferSourceNode | null = null;
let raf = 0;
let generation = 0;
const queue: { text: string; audio: Promise<AudioBuffer | null> }[] = [];
let playing = false;
let buffered = "";
let bufferedOpts: VoiceOpts | null = null;
let firstSent = false;

/** Browsers only allow audio after a user gesture: call this from a click/tap. */
export function unlockAudio() {
  if (typeof window === "undefined") return;
  ctx ??= new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
}

function meter() {
  if (!analyser) return;
  const data = new Float32Array(analyser.fftSize);
  const loop = () => {
    analyser!.getFloatTimeDomainData(data);
    let sum = 0;
    for (const v of data) sum += v * v;
    const rms = Math.sqrt(sum / data.length);
    live.audioLevel = Math.min(1, rms * 5.5);
    raf = requestAnimationFrame(loop);
  };
  cancelAnimationFrame(raf);
  loop();
}

function fetchAudio(text: string, opts: VoiceOpts): Promise<AudioBuffer | null> {
  const gen = generation;
  return fetch("/api/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, mood: live.mood, voice: opts.geminiVoice }) })
    .then((r) => (r.ok ? r.arrayBuffer() : null))
    .then((buf) => (buf && ctx && gen === generation ? ctx.decodeAudioData(buf) : null))
    .catch(() => null);
}

async function pump(opts: VoiceOpts) {
  if (playing) return;
  const item = queue.shift();
  if (!item) {
    cancelAnimationFrame(raf);
    stopMouth();
    return;
  }
  playing = true;
  const gen = generation;
  startMouth(false);
  const buf = await item.audio;
  if (gen !== generation) return;
  if (!buf || !ctx) {
    // Natural voice unavailable (quota, network): say this part with the browser voice.
    browserSay(item.text, opts, () => {
      playing = false;
      if (gen === generation) void pump(opts);
    });
    return;
  }
  analyser ??= Object.assign(ctx.createAnalyser(), { fftSize: 512 });
  analyser.connect(ctx.destination);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(analyser);
  current = src;
  meter();
  src.onended = () => {
    current = null;
    playing = false;
    live.audioLevel = 0;
    if (gen === generation) void pump(opts);
  };
  src.start();
}

function sendNatural(text: string, opts: VoiceOpts) {
  if (!text.trim()) return;
  unlockAudio();
  queue.push({ text, audio: fetchAudio(text, opts) });
  void pump(opts);
}

/* ------------------------------------------------------------------ *
 * Browser voice                                                       *
 * ------------------------------------------------------------------ */
function browserSay(say: string, opts: VoiceOpts, onDone?: () => void) {
  if (!("speechSynthesis" in window)) {
    setTimeout(() => onDone?.(), 400 + say.length * 55);
    return;
  }
  startMouth(true);
  const u = new SpeechSynthesisUtterance(say);
  const v = pickVoice(opts.voiceName);
  if (v) u.voice = v;
  u.pitch = opts.pitch;
  u.rate = opts.rate;
  u.onboundary = () => boundary();
  const done = () => {
    browserPending = Math.max(0, browserPending - 1);
    if (onDone) {
      if (mouthTimer) clearInterval(mouthTimer);
      mouthTimer = null;
      onDone();
    } else if (browserPending === 0) stopMouth();
  };
  u.onend = done;
  u.onerror = done;
  browserPending++;
  window.speechSynthesis.speak(u);
}

export function stopSpeaking() {
  generation++;
  queue.length = 0;
  buffered = "";
  firstSent = false;
  playing = false;
  try {
    current?.stop();
  } catch {}
  current = null;
  cancelAnimationFrame(raf);
  if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
  stopMouth();
}

/**
 * Queue a chunk of speech (call once per sentence while a reply streams, then
 * flushSpeech() at the end). The natural voice sends the first sentence right
 * away and groups the rest into fewer, longer requests.
 */
export function enqueueSpeech(text: string, opts: VoiceOpts) {
  const say = speakable(text);
  if (!say) return;
  if (!opts.voiceOn || typeof window === "undefined") {
    startMouth(true);
    silentUntil = Math.max(silentUntil, Date.now()) + 400 + say.length * 55;
    if (silentTimer) clearTimeout(silentTimer);
    silentTimer = setTimeout(stopMouth, Math.max(0, silentUntil - Date.now()));
    return;
  }
  if (opts.voiceEngine === "browser") {
    browserSay(say, opts);
    return;
  }
  bufferedOpts = opts;
  if (!firstSent) {
    firstSent = true;
    sendNatural(say, opts);
    return;
  }
  buffered = buffered ? `${buffered} ${say}` : say;
  if (buffered.length > 220) {
    sendNatural(buffered, opts);
    buffered = "";
  }
}

/** Send whatever is still buffered (end of a reply). */
export function flushSpeech() {
  if (buffered && bufferedOpts) sendNatural(buffered, bufferedOpts);
  buffered = "";
  firstSent = false;
}

/** Speak a whole text now, replacing anything being said. */
export function speak(text: string, opts: VoiceOpts) {
  stopSpeaking();
  enqueueSpeech(text, opts);
  flushSpeech();
}

/** Splits streaming text into complete sentences; keeps the unfinished tail. */
export function takeSentences(buffer: string): { sentences: string[]; rest: string } {
  const sentences: string[] = [];
  const re = /[^.!?\n]+[.!?]+["')\]]*\s+|[^\n]+\n+/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(buffer))) {
    sentences.push(m[0].trim());
    last = re.lastIndex;
  }
  return { sentences: sentences.filter(Boolean), rest: buffer.slice(last) };
}

/* ------------------------------------------------------------------ *
 * Voice input (Chrome, Edge, Safari)                                  *
 * ------------------------------------------------------------------ */
type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void;
  onend: () => void;
  onerror: () => void;
  start: () => void;
  stop: () => void;
};

export function canListen() {
  return typeof window !== "undefined" && ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);
}

export function listen(onText: (text: string, final: boolean) => void): () => void {
  const W = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  const Ctor = W.SpeechRecognition ?? W.webkitSpeechRecognition;
  if (!Ctor) return () => {};
  stopSpeaking();
  const rec = new Ctor();
  rec.lang = navigator.language || "en-US";
  rec.interimResults = true;
  rec.continuous = false;
  rec.onresult = (e) => {
    let text = "";
    let final = false;
    for (let i = 0; i < e.results.length; i++) {
      text += e.results[i][0].transcript;
      final ||= e.results[i].isFinal;
    }
    onText(text, final);
  };
  rec.onend = () => setListening(false);
  rec.onerror = () => setListening(false);
  setListening(true);
  rec.start();
  return () => rec.stop();
}
