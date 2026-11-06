"use client";

import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { Mochi } from "@/components/character/mochi";
import { setMood } from "@/lib/companion-state";
import { speak, stopSpeaking, unlockAudio, type VoiceOpts } from "@/lib/speech";
import { DEMO, TRY } from "@/lib/demo-lines";
import type { Mood } from "@/lib/types";

// The same Gemini voice as in the app. These fixed lines are generated once and then served from the cache.
const VOICE: VoiceOpts = { voiceOn: true, geminiVoice: "Leda" };

export function LandingHero() {
  const [i, setI] = useState(0);
  const [line, setLine] = useState(DEMO[0].line);
  const [paused, setPaused] = useState(false);
  const [sound, setSound] = useState(false);
  const step = useRef(0);
  const soundOn = useRef(false);

  function show(mood: Mood, text: string) {
    setMood(mood);
    setLine(text);
    if (soundOn.current) speak(text, VOICE);
  }

  useEffect(() => {
    setMood(DEMO[0].mood);
    return () => stopSpeaking();
  }, []);
  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => {
      // Update the shared mood from the timer, never inside a state updater (that runs during render).
      step.current = (step.current + 1) % DEMO.length;
      setI(step.current);
      show(DEMO[step.current].mood, DEMO[step.current].line);
    }, sound ? 4200 : 3200);
    return () => clearInterval(t);
  }, [paused, sound]);

  function tryMood(t: (typeof TRY)[number]) {
    setPaused(true);
    show(t.mood, t.line);
    setTimeout(() => setPaused(false), 6000);
  }

  function toggleSound() {
    const on = !soundOn.current;
    soundOn.current = on;
    setSound(on);
    if (on) {
      unlockAudio();
      speak(line, VOICE);
    } else stopSpeaking();
  }

  return (
    <div className="relative">
      <div className="absolute inset-x-0 top-0 z-10 flex justify-center px-6">
        <p key={`${i}-${line}`} className="pop max-w-xs rounded-3xl bg-white/95 px-5 py-3 text-center text-[16px] font-bold leading-snug shadow-lg">
          {line}
        </p>
      </div>
      <div className="mx-auto h-85 w-full max-w-90 pt-20 sm:h-105">
        <Mochi color="peach" eyeColor="violet" />
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
        <span className="text-xs font-bold text-muted">Try a feeling:</span>
        {TRY.map((t) => (
          <button key={t.mood} onClick={() => tryMood(t)} className="grid h-10 w-10 place-items-center rounded-2xl bg-white text-xl shadow-sm ring-1 ring-line transition hover:-translate-y-0.5 hover:ring-violet-200" title={t.mood}>
            {t.emoji}
          </button>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-center gap-3">
        <button onClick={toggleSound} className={`inline-flex items-center gap-1.5 rounded-2xl px-3 py-1.5 text-sm font-bold ring-1 transition ${sound ? "bg-violet-600 text-white ring-violet-600" : "bg-white text-violet-700 ring-violet-200 hover:bg-violet-50"}`}>
          {sound ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />} {sound ? "Mochi is talking" : "Hear Mochi"}
        </button>
        <span className="text-xs text-muted">Psst… tap Mochi.</span>
      </div>
    </div>
  );
}
