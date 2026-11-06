"use client";

import { useSyncExternalStore } from "react";
import type { Mood } from "@/lib/types";

/**
 * Live state shared between the UI and the 3D character. The character reads
 * `live` every frame (no React re-render); UI components subscribe through
 * useCompanion() for the few fields they display.
 */
export const live = {
  mood: "happy" as Mood,
  moodSince: 0,
  speaking: false,
  /** 0..1 mouth target while speaking, pulsed by word boundaries. */
  level: 0,
  lastBoundary: 0,
  /** Live loudness of the natural voice (0..1), or -1 when the browser voice is used. */
  audioLevel: -1,
  pokeAt: -10,
  listening: false,
  thinking: false,
  /** Until when Mochi's (Gemini) voice is out of its daily quota; 0 = fine. */
  voiceRestingUntil: 0,
};

const listeners = new Set<() => void>();
let snapshot = { mood: live.mood, speaking: false, listening: false, thinking: false, voiceRestingUntil: 0 };

function emit() {
  snapshot = { mood: live.mood, speaking: live.speaking, listening: live.listening, thinking: live.thinking, voiceRestingUntil: live.voiceRestingUntil };
  listeners.forEach((l) => l());
}

export function setMood(mood: Mood) {
  if (live.mood === mood) return;
  live.mood = mood;
  live.moodSince = performance.now() / 1000;
  emit();
}
export function setSpeaking(v: boolean) {
  live.speaking = v;
  if (!v) live.level = 0;
  emit();
}
export function setListening(v: boolean) {
  live.listening = v;
  emit();
}
export function setThinking(v: boolean) {
  live.thinking = v;
  emit();
}
export function setVoiceResting(until: number) {
  live.voiceRestingUntil = until;
  emit();
}
export const voiceResting = () => live.voiceRestingUntil > Date.now();
export function poke() {
  live.pokeAt = performance.now() / 1000;
}
export function boundary() {
  live.lastBoundary = performance.now() / 1000;
}

export function useCompanion() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => snapshot,
    () => snapshot,
  );
}
