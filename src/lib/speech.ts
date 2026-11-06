"use client";

import { boundary, live, setListening, setSpeaking, setVoiceResting, voiceResting } from "@/lib/companion-state";
import { stripStageDirections } from "@/lib/stage-directions";

/** Text for the voice: no markdown, emoji, mood tags, links or stage directions. */
export function speakable(text: string): string {
  return stripStageDirections(text)
    .replace(/\[mood:[a-z]+\]/gi, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[*_#`>|~]/g, "")
    .replace(/^\s*[-•]\s+/gm, "")
    .replace(/\p{Extended_Pictographic}️?/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** voiceName/pitch/rate/voiceEngine are kept for old saved settings; only the Gemini voice is used. */
export type VoiceOpts = { voiceOn: boolean; voiceName?: string; pitch?: number; rate?: number; voiceEngine?: "natural" | "browser"; geminiVoice?: string };

/* ------------------------------------------------------------------ *
 * Mochi's voice: Gemini text-to-speech only, played through Web      *
 * Audio, with the mouth driven by the real loudness of the audio.     *
 * ------------------------------------------------------------------ */
let ctx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let current: AudioBufferSourceNode | null = null;
let raf = 0;
let generation = 0;
const queue: { audio: Promise<AudioBuffer | null> }[] = [];
let playing = false;
let buffered = "";
let bufferedOpts: VoiceOpts | null = null;
let firstSent = false;
let mouthTimer: ReturnType<typeof setTimeout> | null = null;
/** Longest text sent in one request after the first sentence (fewer requests = the free quota lasts longer). */
const CHUNK = 600;

/**
 * True once the person has clicked/tapped/typed on this page, so the browser
 * lets us play sound without another tap. Navigating inside the app (e.g. right
 * after the sign-up button) keeps this, so Mochi can speak straight away.
 */
export function canAutoplay(): boolean {
  if (typeof navigator === "undefined") return false;
  return navigator.userActivation?.hasBeenActive ?? false;
}

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
    live.audioLevel = Math.min(1, Math.sqrt(sum / data.length) * 5.5);
    raf = requestAnimationFrame(loop);
  };
  cancelAnimationFrame(raf);
  loop();
}

function stopMouth() {
  if (mouthTimer) clearTimeout(mouthTimer);
  mouthTimer = null;
  live.audioLevel = -1;
  setSpeaking(false);
}

/** Muted: move the mouth for about as long as the line would take, without sound. */
function mouthOnly(text: string) {
  setSpeaking(true);
  const until = Date.now() + 400 + text.length * 55;
  const tick = () => {
    if (Date.now() > until) return stopMouth();
    boundary();
    mouthTimer = setTimeout(tick, 240);
  };
  if (mouthTimer) clearTimeout(mouthTimer);
  tick();
}

function fetchAudio(text: string, opts: VoiceOpts): Promise<AudioBuffer | null> {
  const gen = generation;
  const mood = live.mood;
  let quota = false;
  const once = () =>
    fetch("/api/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, mood, voice: opts.geminiVoice }) })
      .then((r) => {
        if (r.status === 429) {
          // Out of the free daily voice quota: rest until Google says it resets.
          quota = true;
          setVoiceResting(Date.now() + Number(r.headers.get("Retry-After") ?? 600) * 1000);
        }
        return r.ok ? r.arrayBuffer() : null;
      })
      .then((buf) => (buf && ctx && gen === generation ? ctx.decodeAudioData(buf) : null))
      .catch(() => null);
  // One retry for a passing hiccup (not for quota).
  return once().then((b) => (b || quota || gen !== generation ? b : once()));
}

async function pump() {
  if (playing) return;
  const item = queue.shift();
  if (!item) {
    cancelAnimationFrame(raf);
    stopMouth();
    return;
  }
  playing = true;
  const gen = generation;
  const buf = await item.audio;
  if (gen !== generation) return;
  if (!buf || !ctx) {
    playing = false;
    void pump();
    return;
  }
  setSpeaking(true);
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
    if (gen === generation) void pump();
  };
  src.start();
}

function send(text: string, opts: VoiceOpts) {
  if (!text.trim()) return;
  unlockAudio();
  queue.push({ audio: fetchAudio(text, opts) });
  void pump();
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
  stopMouth();
}

/**
 * Queue a chunk of speech (call once per sentence while a reply streams, then
 * flushSpeech() at the end). The first sentence is sent straight away so the
 * voice starts quickly; the rest of the reply goes in one more request.
 */
export function enqueueSpeech(text: string, opts: VoiceOpts) {
  const say = speakable(text);
  if (!say || typeof window === "undefined") return;
  if (!opts.voiceOn) return mouthOnly(say);
  if (voiceResting()) return; // the UI shows that the voice is resting
  bufferedOpts = opts;
  if (!firstSent) {
    firstSent = true;
    send(say, opts);
    return;
  }
  buffered = buffered ? `${buffered} ${say}` : say;
  if (buffered.length > CHUNK) {
    send(buffered, opts);
    buffered = "";
  }
}

/** Send whatever is still buffered (end of a reply). */
export function flushSpeech() {
  if (buffered && bufferedOpts) send(buffered, bufferedOpts);
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
  maxAlternatives: number;
  onresult: (e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void;
  onend: () => void;
  onerror: (e: { error: string }) => void;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

export function canListen() {
  return typeof window !== "undefined" && ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);
}

/** The recognition language for the language they chose to talk in. */
export function speechLang(language: string): string {
  const browser = typeof navigator !== "undefined" ? navigator.language : "en-US";
  const map: Record<string, string> = {
    // Hinglish is typed in Latin script, which Indian-English recognition writes best.
    Hinglish: "en-IN", Hindi: "hi-IN", Bengali: "bn-IN", Tamil: "ta-IN", Telugu: "te-IN", Marathi: "mr-IN", Gujarati: "gu-IN",
    Kannada: "kn-IN", Malayalam: "ml-IN", Punjabi: "pa-IN", Urdu: "ur-PK", Spanish: "es-ES", French: "fr-FR", German: "de-DE",
    Arabic: "ar-SA", Portuguese: "pt-BR", Japanese: "ja-JP",
  };
  if (map[language]) {
    // Prefer the browser's regional variant of the same language (es-MX over es-ES, etc.).
    return browser.split("-")[0] === map[language].split("-")[0] && language !== "Hinglish" ? browser : map[language];
  }
  return /^en/i.test(browser) ? browser : "en-US";
}

export type DictationError = "no-permission" | "no-mic" | "network" | "unsupported" | "other";

export type Dictation = {
  /** Stop listening and get everything that was said (waits briefly for the last words). */
  finish: () => Promise<string>;
  /** Stop listening and throw the words away. */
  cancel: () => void;
};

/**
 * Push-to-talk dictation: listens until `finish()` or `cancel()`, however long
 * the pauses. Browsers end recognition by themselves after some silence, so it
 * quietly restarts and keeps what was already heard.
 */
export function startDictation(opts: { lang: string; onText: (text: string) => void; onError: (e: DictationError) => void }): Dictation {
  const W = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  const Ctor = W.SpeechRecognition ?? W.webkitSpeechRecognition;
  if (!Ctor) {
    opts.onError("unsupported");
    return { finish: async () => "", cancel: () => {} };
  }
  stopSpeaking();

  let committed = ""; // finished sessions (before an automatic restart)
  let session = ""; // the current session's words, final + interim
  let holding = true;
  let rec: Recognition | null = null;
  let ended: (() => void) | null = null;
  const full = () => [committed, session].map((x) => x.trim()).filter(Boolean).join(" ");

  const begin = () => {
    const r = new Ctor();
    rec = r;
    r.lang = opts.lang;
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 1;
    r.onresult = (e) => {
      let text = "";
      for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
      session = text;
      opts.onText(full());
    };
    r.onerror = (e) => {
      if (e.error === "no-speech" || e.error === "aborted") return;
      holding = false;
      opts.onError(e.error === "not-allowed" || e.error === "service-not-allowed" ? "no-permission" : e.error === "audio-capture" ? "no-mic" : e.error === "network" ? "network" : "other");
    };
    r.onend = () => {
      committed = full();
      session = "";
      if (holding) {
        try {
          begin(); // the browser stopped on its own while they're still holding: keep going
          return;
        } catch {
          holding = false;
        }
      }
      setListening(false);
      ended?.();
    };
    r.start();
  };

  setListening(true);
  try {
    begin();
  } catch {
    setListening(false);
    opts.onError("other");
  }

  return {
    finish: () =>
      new Promise<string>((resolve) => {
        holding = false;
        const done = () => resolve(full());
        if (!rec) return done();
        // The last words arrive just after stop(); wait for them, but not forever.
        const timer = setTimeout(() => {
          ended = null;
          setListening(false);
          rec?.abort();
          done();
        }, 1500);
        ended = () => {
          clearTimeout(timer);
          done();
        };
        rec.stop();
      }),
    cancel: () => {
      holding = false;
      ended = null;
      rec?.abort();
      setListening(false);
    },
  };
}
