"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { CalendarCheck, Check, Flame, Mic, RotateCcw, Send, Volume2, VolumeX, X } from "lucide-react";
import { ArtifactView } from "@/components/artifacts";
import { Companion } from "@/components/companion/companion";
import { RichText } from "@/components/rich-text";
import { live, setMood, setThinking, useCompanion } from "@/lib/companion-state";
import type { QuickAction } from "@/lib/personal";
import { describeActivity, recentActivity } from "@/lib/activity";
import { api, toSignIn } from "@/lib/client-api";
import { canAutoplay, canListen, enqueueSpeech, flushSpeech, speak, speechLang, startDictation, stopSpeaking, takeSentences, unlockAudio, type Dictation, type DictationError, type VoiceOpts } from "@/lib/speech";
import type { Accessory, Artifact, BodyColor, ChatMessage, EyeColor, Mood } from "@/lib/types";

type Msg = Omit<ChatMessage, "id" | "at"> & { id: string | null; streaming?: boolean; error?: string };
export type TodayHabit = { id: string; title: string; emoji: string; done: boolean; streak: number };

const MOOD_WORD: Record<Mood, string> = {
  neutral: "chilling", happy: "happy", excited: "super excited", love: "full of love", proud: "so proud of you", sad: "a bit sad",
  worried: "worried", angry: "grumpy", surprised: "surprised", thinking: "thinking…", sleepy: "sleepy", playful: "playful",
};

const POKES = ["Hehe, that tickles!", "Boop! Hi there!", "Hey! I'm awake, I'm awake!", "Do it again, I dare you!", "You found my squishy spot!"];

const CHECKIN = [
  { v: 1, e: "😢", mood: "sad" as Mood, line: "Oh no… I'm right here with you. Want to tell me what happened?" },
  { v: 2, e: "😕", mood: "worried" as Mood, line: "Hmm, not your best day. Let's make it a little lighter together." },
  { v: 3, e: "😐", mood: "neutral" as Mood, line: "Okay okay, a steady day. Let's sneak in one small win!" },
  { v: 4, e: "🙂", mood: "happy" as Mood, line: "Yay, a good day! Let's use that energy." },
  { v: 5, e: "🤩", mood: "excited" as Mood, line: "Woohoo! You're glowing today! Let's go big!" },
];

export function Home(props: {
  companionName: string;
  color: BodyColor;
  eyeColor: EyeColor;
  accessory: Accessory;
  voice: VoiceOpts;
  userName: string;
  language: string;
  initialMessages: ChatMessage[];
  greeting: { mood: Mood; text: string };
  checkedIn: boolean;
  chips: string[];
  actions: QuickAction[];
  habits: TodayHabit[];
  today: { due: number; overdue: number; next: string | null; streak: number; dateLabel: string };
  initialAsk: string | null;
}) {
  const { companionName, voice, userName, greeting } = props;
  const router = useRouter();
  const { mood, speaking, listening, thinking, voiceRestingUntil } = useCompanion();
  const [messages, setMessages] = useState<Msg[]>(props.initialMessages);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [bubble, setBubble] = useState(greeting.text);
  const [voiceOn, setVoiceOn] = useState(voice.voiceOn);
  const [showCheckin, setShowCheckin] = useState(!props.checkedIn);
  const [habits, setHabits] = useState(props.habits);
  const [recording, setRecording] = useState(false);
  const [willCancel, setWillCancel] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const [micHint, setMicHint] = useState<string | null>(null);
  const dictation = useRef<Dictation | null>(null);
  const pressedAt = useRef(0);
  const pendingVoice = useRef<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const opts = { ...voice, voiceOn };
  const micSupported = useSyncExternalStore(() => () => {}, canListen, () => false);

  // Greeting: shown with a moving mouth (browsers only allow sound after a click).
  useEffect(() => {
    setMood(greeting.mood);
    // Say the greeting out loud when the browser allows it (e.g. right after signing in);
    // otherwise just move the mouth. Browsers block sound before the first tap.
    if (canAutoplay()) unlockAudio();
    enqueueSpeech(greeting.text, { ...voice, voiceOn: voice.voiceOn && canAutoplay() });
    flushSpeech();
    return () => stopSpeaking();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Questions sent from other pages (/?ask=…) go straight to the chat.
  const askedFromLink = useRef(false);
  useEffect(() => {
    if (!props.initialAsk || askedFromLink.current) return;
    askedFromLink.current = true;
    window.history.replaceState(null, "", "/home");
    void send(props.initialAsk);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.initialAsk]);

  // Drift back to calm after a while.
  useEffect(() => {
    const t = setInterval(() => {
      if (!live.speaking && !live.thinking && performance.now() / 1000 - live.moodSince > 40 && !["neutral", "happy", "sleepy"].includes(live.mood)) {
        const h = new Date().getHours();
        setMood(h >= 23 || h < 5 ? "sleepy" : "happy");
      }
    }, 5000);
    return () => clearInterval(t);
  }, []);

  // Scroll only the chat box (scrollIntoView would also scroll the page past the companion on phones).
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages]);

  function patchLast(fn: (m: Msg) => Msg) {
    setMessages((ms) => [...ms.slice(0, -1), fn(ms[ms.length - 1])]);
  }

  async function send(raw: string) {
    const text = raw.trim();
    if (!text || busy) return;
    unlockAudio();
    stopSpeaking();
    setInput("");
    setBusy(true);
    setThinking(true);
    setBubble("Hmm, let me think…");
    setMessages((ms) => [...ms, { id: null, role: "user", text, mood: null, artifacts: [] }, { id: null, role: "assistant", text: "", mood: null, artifacts: [], streaming: true }]);

    let spoken = "";
    let full = "";
    try {
      const activity = describeActivity(recentActivity(12));
      const res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, activity }) });
      if (res.status === 401) return toSignIn();
      if (!res.ok || !res.body) {
        const error = ((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Something went wrong.";
        patchLast((m) => ({ ...m, streaming: false, error }));
        setMood("sad");
        setBubble(error);
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const ev = JSON.parse(line) as
            | { type: "mood"; mood: Mood }
            | { type: "text"; text: string }
            | { type: "artifact"; artifact: Artifact }
            | { type: "done"; message: ChatMessage }
            | { type: "error"; error: string };
          if (ev.type === "mood") {
            setThinking(false);
            setMood(ev.mood);
            patchLast((m) => ({ ...m, mood: m.mood ?? ev.mood }));
          } else if (ev.type === "text") {
            setThinking(false);
            full += ev.text;
            setBubble(full);
            patchLast((m) => ({ ...m, text: m.text + ev.text }));
            const { sentences, rest } = takeSentences(full.slice(spoken.length));
            if (sentences.length) {
              for (const s of sentences) enqueueSpeech(s, opts);
              spoken = full.slice(0, full.length - rest.length);
            }
          } else if (ev.type === "artifact") {
            const a = ev.artifact;
            patchLast((m) => ({ ...m, artifacts: [...m.artifacts, a] }));
            if (a.kind === "quiz") setMood("playful");
            if (a.kind === "habit") setHabits((h) => [...h, { id: a.habitId, title: a.title, emoji: a.emoji, done: false, streak: 0 }]);
          } else if (ev.type === "done") {
            patchLast(() => ({ ...ev.message, streaming: false }));
            const rest = full.slice(spoken.length);
            if (rest.trim()) enqueueSpeech(rest, opts);
            flushSpeech();
          } else if (ev.type === "error") {
            patchLast((m) => ({ ...m, streaming: false, error: ev.error }));
            setMood("sad");
            setBubble(ev.error);
          }
        }
      }
      router.refresh();
    } catch {
      patchLast((m) => ({ ...m, streaming: false, error: "I lost connection for a second. Try again?" }));
    } finally {
      setThinking(false);
      setBusy(false);
    }
  }

  /* ---------------- Hold to talk: press, speak, let go to send ---------------- */
  const MIC_ERRORS: Record<DictationError, string> = {
    "no-permission": "Your mic is blocked. Allow microphone access for this site (the icon in the address bar), then try again.",
    "no-mic": "I can't find a microphone on this device.",
    network: "Voice typing needs an internet connection. Try again in a moment?",
    unsupported: "Voice input works in Chrome, Edge and Safari. You can still type to me!",
    other: "My ears glitched. Try holding the mic again?",
  };

  function hint(text: string) {
    setMicHint(text);
    setTimeout(() => setMicHint((h) => (h === text ? null : h)), 4000);
  }

  function startTalking() {
    if (dictation.current) return;
    unlockAudio();
    setMicHint(null);
    if (!micSupported) return hint(MIC_ERRORS.unsupported);
    pressedAt.current = Date.now();
    setInput("");
    setWillCancel(false);
    setRecSeconds(0);
    setRecording(true);
    dictation.current = startDictation({
      lang: speechLang(props.language),
      onText: setInput,
      onError: (e) => {
        dictation.current?.cancel();
        dictation.current = null;
        setRecording(false);
        setInput("");
        hint(MIC_ERRORS[e]);
      },
    });
  }

  async function stopTalking(cancel: boolean) {
    const d = dictation.current;
    if (!d) return;
    dictation.current = null;
    setRecording(false);
    setWillCancel(false);
    const tooShort = Date.now() - pressedAt.current < 400;
    if (cancel || tooShort) {
      d.cancel();
      setInput("");
      if (tooShort && !cancel) hint("Hold the mic while you talk, then let go to send.");
      return;
    }
    const text = (await d.finish()).trim();
    if (!text) {
      setInput("");
      return hint("I didn't catch that. Try again, maybe a little closer to the mic?");
    }
    if (busy) {
      // Still answering the last message: send this as soon as I'm done.
      setInput(text);
      pendingVoice.current = text;
    } else void send(text);
  }

  // Send voice messages that arrived while I was still replying.
  useEffect(() => {
    if (!busy && pendingVoice.current) {
      const text = pendingVoice.current;
      pendingVoice.current = null;
      void send(text);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy]);

  // Recording timer, with a safety stop after a minute.
  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setRecSeconds((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [recording]);
  useEffect(() => {
    if (recording && recSeconds >= 60) void stopTalking(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recSeconds, recording]);

  // Leaving the page mid-recording shouldn't leave the mic on.
  useEffect(() => () => dictation.current?.cancel(), []);

  async function checkIn(c: (typeof CHECKIN)[number]) {
    unlockAudio();
    setShowCheckin(false);
    setMood(c.mood);
    setBubble(c.line);
    speak(c.line, opts);
    await api("/api/checkin", "POST", { mood: c.v, energy: c.v }, ["", "awful", "low", "okay", "good", "amazing"][c.v]).catch(() => {});
    router.refresh();
  }

  async function toggleHabit(h: TodayHabit) {
    setHabits((hs) => hs.map((x) => (x.id === h.id ? { ...x, done: !x.done, streak: x.done ? Math.max(0, x.streak - 1) : x.streak + 1 } : x)));
    if (!h.done) {
      setMood("proud");
      setBubble(`${h.emoji} ${h.title}: done! +5 XP`);
    }
    await api(`/api/habits/${h.id}`, "POST", undefined, `${h.emoji} ${h.title}`).catch(() => {});
    router.refresh();
  }

  async function clearChat() {
    if (!confirm(`Clear the conversation? ${companionName} still remembers everything important about you.`)) return;
    await fetch("/api/chat", { method: "DELETE" });
    setMessages([]);
    router.refresh();
  }

  const doneHabits = habits.filter((h) => h.done).length;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]" onPointerDown={unlockAudio}>
      {/* Companion stage */}
      <section className="glass relative h-[52vh] min-h-[380px] min-w-0 overflow-hidden rounded-[2rem] lg:sticky lg:top-24 lg:h-[calc(100vh-8rem)]">
        <div className="absolute inset-0 bg-gradient-to-b from-pink-50/80 via-white/0 to-violet-100/70" />
        <div className="pointer-events-none absolute -left-10 top-1/3 h-40 w-40 rounded-full bg-pink-200/40 blur-3xl" />
        <div className="pointer-events-none absolute -right-10 bottom-10 h-48 w-48 rounded-full bg-violet-200/50 blur-3xl" />
        <div
          className={`absolute inset-x-0 top-32 transition-[bottom] duration-500 ${showCheckin ? "bottom-32" : "bottom-6"}`}
          onPointerDown={() => {
            const line = POKES[Math.floor(Math.random() * POKES.length)];
            setTimeout(() => {
              if (live.pokeAt > performance.now() / 1000 - 0.3) {
                setBubble(line);
                speak(line, opts);
              }
            }, 30);
          }}
        >
          <Companion color={props.color} eyeColor={props.eyeColor} accessory={props.accessory} />
        </div>

        <div className="pointer-events-none absolute left-5 top-4">
          <p className="text-2xl font-extrabold tracking-tight">{companionName}</p>
          <p className="flex items-center gap-1.5 text-sm font-bold text-muted">
            <span className={`h-2 w-2 rounded-full ${listening ? "animate-pulse bg-rose-500" : thinking ? "animate-pulse bg-amber-400" : speaking ? "bg-emerald-500" : "bg-violet-400"}`} />
            {listening ? "listening to you" : thinking ? "thinking…" : speaking ? "talking" : `feeling ${MOOD_WORD[mood]}`}
          </p>
          {voiceRestingUntil > Date.now() && (
            <p className="mt-1 max-w-56 rounded-xl bg-amber-50 px-2 py-1 text-[11px] font-bold leading-snug text-amber-700 ring-1 ring-amber-200">
              🔇 My voice is resting (free daily limit). Back around {new Date(voiceRestingUntil).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.
            </p>
          )}
        </div>
        <button onClick={() => (voiceOn ? (stopSpeaking(), setVoiceOn(false)) : setVoiceOn(true))} className="glass absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-2xl text-muted" title={voiceOn ? "Mute voice" : "Turn voice on"}>
          {voiceOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
        </button>

        {bubble && (
          <div className="pointer-events-none absolute inset-x-5 top-[4.4rem] z-10 flex justify-center">
            <div key={bubble.slice(0, 12)} className="pop relative max-h-28 max-w-md overflow-hidden rounded-3xl bg-white/95 px-4 py-2 text-center text-[15px] font-semibold leading-snug shadow-lg">
              {bubble.replace(/[*#]/g, "").slice(-220)}
              <span className="absolute -bottom-2 left-1/2 h-4 w-4 -translate-x-1/2 rotate-45 bg-white/95" />
            </div>
          </div>
        )}

        {showCheckin && (
          <div className="pop absolute inset-x-4 bottom-4 rounded-3xl bg-white/90 p-3 text-center shadow-lg backdrop-blur">
            <p className="text-sm font-extrabold">How are you feeling today, {userName || "friend"}?</p>
            <div className="mt-2 flex justify-center gap-2">
              {CHECKIN.map((c) => (
                <button key={c.v} onClick={() => checkIn(c)} className="grid h-11 w-11 place-items-center rounded-2xl bg-violet-50 text-2xl transition hover:scale-110 hover:bg-violet-100">
                  {c.e}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      <div className="flex min-w-0 flex-col gap-4 lg:h-[calc(100vh-8rem)]">
        {/* Today */}
        <section className="glass rounded-[2rem] p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="font-extrabold">
              Today <span className="font-semibold text-muted">· {props.today.dateLabel}</span>
            </p>
            <div className="flex items-center gap-2 text-xs font-extrabold">
              <span className="flex items-center gap-1 rounded-full bg-orange-50 px-2 py-1 text-orange-500">
                <Flame className="h-3.5 w-3.5 fill-orange-400" /> {props.today.streak}
              </span>
              <Link href="/tasks" className="flex items-center gap-1 rounded-full bg-violet-50 px-2 py-1 text-violet-700 hover:bg-violet-100">
                <CalendarCheck className="h-3.5 w-3.5" /> {props.today.due} today{props.today.overdue ? ` · ${props.today.overdue} late` : ""}
              </Link>
            </div>
          </div>
          {habits.length ? (
            <div className="no-scrollbar flex gap-2 overflow-x-auto pb-0.5">
              {habits.map((h) => (
                <button
                  key={h.id}
                  onClick={() => toggleHabit(h)}
                  className={`flex shrink-0 items-center gap-2 rounded-2xl px-3 py-2 text-sm font-bold transition active:scale-95 ${h.done ? "bg-emerald-100 text-emerald-800 ring-2 ring-emerald-300" : "bg-white ring-1 ring-line hover:ring-violet-300"}`}
                >
                  <span className="text-lg">{h.emoji}</span>
                  <span className="max-w-32 truncate">{h.title}</span>
                  {h.done ? <Check className="h-4 w-4" /> : h.streak > 0 && <span className="text-[11px] text-orange-500">🔥{h.streak}</span>}
                </button>
              ))}
              <span className="flex shrink-0 items-center px-1 text-xs font-bold text-muted">
                {doneHabits}/{habits.length} done
              </span>
            </div>
          ) : (
            <p className="text-sm text-muted">
              No daily habits yet.{" "}
              <button onClick={() => send("Help me pick 2 small daily habits that fit my life")} className="font-bold text-grape">
                Ask {companionName} to suggest some
              </button>{" "}
              or add them on{" "}
              <Link href="/tasks" className="font-bold text-grape">
                Tasks
              </Link>
              .
            </p>
          )}
          {props.today.next && <p className="mt-2 truncate text-xs font-semibold text-muted">Next up: {props.today.next}</p>}
        </section>

        {/* Chat */}
        <section className="glass flex min-h-[60vh] min-w-0 flex-1 flex-col overflow-hidden rounded-[2rem] lg:min-h-0">
          <div className="flex items-center justify-between border-b border-white/80 px-5 py-3">
            <p className="font-extrabold">Talk to {companionName}</p>
            {messages.length > 0 && (
              <button onClick={clearChat} className="inline-flex items-center gap-1 rounded-xl px-2 py-1 text-xs font-bold text-muted hover:bg-grape-soft" title="Clear conversation">
                <RotateCcw className="h-3.5 w-3.5" /> New chat
              </button>
            )}
          </div>

          <div ref={scroller} className="no-scrollbar max-h-[62vh] flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5 lg:max-h-none">
            {messages.length === 0 && (
              <div className="pop">
                <p className="mb-3 text-center text-sm font-bold text-muted">What would you like to do?</p>
                <div className="grid grid-cols-2 gap-2.5">
                  {props.actions.map((a) => (
                    <button
                      key={a.title}
                      onClick={() => send(a.prompt)}
                      className="group flex items-center gap-3 rounded-2xl p-3 text-left ring-1 ring-white transition hover:-translate-y-0.5 hover:shadow-md"
                      style={{ background: `linear-gradient(135deg, hsl(${a.hue} 90% 96%), hsl(${(a.hue + 30) % 360} 85% 92%))` }}
                    >
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/80 text-xl shadow-sm transition group-hover:scale-110">{a.emoji}</span>
                      <span className="text-sm font-extrabold leading-tight text-ink/85">{a.title}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="flex justify-end">
                  <p className="max-w-[85%] rounded-3xl rounded-br-lg bg-grape px-4 py-2.5 text-[15px] font-semibold text-white shadow-sm">{m.text}</p>
                </div>
              ) : (
                <div key={i} className="space-y-2">
                  {(m.text || m.streaming) && (
                    <div className="max-w-[92%] rounded-3xl rounded-bl-lg bg-white px-4 py-3 text-[15px] leading-relaxed shadow-sm">
                      {m.text ? (
                        <RichText text={m.text} />
                      ) : (
                        <p className="typing text-xl leading-none text-violet-400">
                          <span>●</span>
                          <span>●</span>
                          <span>●</span>
                        </p>
                      )}
                    </div>
                  )}
                  {m.artifacts.map((a) => (
                    <ArtifactView key={a.id} artifact={a} messageId={m.id} />
                  ))}
                  {m.error && <p className="rounded-2xl bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700">{m.error}</p>}
                </div>
              ),
            )}
          </div>

          {messages.length > 0 && (
            <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 pb-2">
              {props.chips.map((c) => (
                <button key={c} disabled={busy} onClick={() => send(c)} className="max-w-64 shrink-0 truncate rounded-full bg-white px-3 py-1.5 text-[13px] font-bold text-violet-700 ring-1 ring-violet-100 transition hover:bg-violet-50 disabled:opacity-50">
                  {c}
                </button>
              ))}
            </div>
          )}

          {(recording || micHint) && (
            <div className="pop mx-3 -mb-1 flex items-center justify-center gap-2 rounded-2xl px-3 py-1.5 text-[13px] font-bold" aria-live="polite">
              {recording ? (
                willCancel ? (
                  <span className="text-slate-500">Let go to cancel</span>
                ) : (
                  <>
                    <span className="h-2 w-2 animate-pulse rounded-full bg-rose-500" />
                    <span className="tabular-nums text-rose-600">{Math.floor(recSeconds / 60)}:{String(recSeconds % 60).padStart(2, "0")}</span>
                    <span className="text-muted">Let go to send · slide away to cancel</span>
                  </>
                )
              ) : (
                <span className="text-violet-700">{micHint}</span>
              )}
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
            className="m-3 mt-1 flex items-end gap-2 rounded-3xl bg-white p-2 shadow-sm ring-1 ring-line"
          >
            <button
              type="button"
              aria-label="Hold to talk"
              title="Hold to talk, let go to send"
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                e.preventDefault();
                e.currentTarget.setPointerCapture(e.pointerId);
                startTalking();
              }}
              onPointerMove={(e) => {
                if (!dictation.current) return;
                const r = e.currentTarget.getBoundingClientRect();
                const far = e.clientX < r.left - 60 || e.clientX > r.right + 60 || e.clientY < r.top - 80 || e.clientY > r.bottom + 60;
                setWillCancel(far);
              }}
              onPointerUp={() => void stopTalking(willCancel)}
              onPointerCancel={() => void stopTalking(true)}
              onKeyDown={(e) => {
                if ((e.key === " " || e.key === "Enter") && !e.repeat) {
                  e.preventDefault();
                  startTalking();
                }
                if (e.key === "Escape") void stopTalking(true);
              }}
              onKeyUp={(e) => {
                if (e.key === " " || e.key === "Enter") void stopTalking(false);
              }}
              onContextMenu={(e) => e.preventDefault()}
              style={{ touchAction: "none", WebkitTouchCallout: "none" }}
              className={`relative grid h-11 w-11 shrink-0 select-none place-items-center rounded-2xl transition ${
                recording ? (willCancel ? "scale-110 bg-slate-400 text-white" : "scale-110 bg-rose-500 text-white shadow-[0_0_0_6px_rgba(244,63,94,0.18)]") : "bg-violet-50 text-violet-600 hover:bg-violet-100"
              }`}
            >
              {recording && !willCancel && <span className="absolute inset-0 animate-ping rounded-2xl bg-rose-400/40" />}
              {recording && willCancel ? <X className="relative h-4 w-4" /> : <Mic className="relative h-4 w-4" />}
            </button>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send(input);
                }
              }}
              rows={1}
              readOnly={recording}
              placeholder={recording ? "Listening… let go to send" : `Tell ${companionName} anything…`}
              className="max-h-36 min-h-[44px] flex-1 resize-none bg-transparent px-2 py-2.5 text-[15px] outline-none placeholder:text-muted/60"
            />
            <button disabled={busy || !input.trim()} className="candy grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-white transition active:scale-95 disabled:opacity-40" title="Send">
              <Send className="h-4 w-4" />
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
