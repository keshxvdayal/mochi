"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { MessageCircleHeart, X } from "lucide-react";
import { Mochi } from "@/components/character/mochi";
import { onActivity, track, type Activity } from "@/lib/activity";
import { live, setMood } from "@/lib/companion-state";
import { canAutoplay, speak, unlockAudio, type VoiceOpts } from "@/lib/speech";
import type { Accessory, BodyColor, EyeColor, Mood } from "@/lib/types";

type Say = { mood: Mood; text: string };
const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

/** What the little companion says about each step. `n` = their first name. */
function reaction(a: Activity, n: string): Say | null {
  const l = a.label;
  switch (a.type) {
    case "page":
      return (
        {
          "/tasks": pick<Say>([
            { mood: "playful", text: `Task time! Which one are we crushing first, ${n}?` },
            { mood: "happy", text: "Ooh, the to-do list. Let's tick something off!" },
            { mood: "thinking", text: "Start with the smallest one. Momentum is everything." },
          ]),
          "/goals": pick<Say>([
            { mood: "excited", text: "Goals! My favourite page. Dream big!" },
            { mood: "proud", text: "Every goal here is a future you. I like that person already." },
          ]),
          "/me": pick<Say>([
            { mood: "love", text: "Hehe, this is everything I know about you." },
            { mood: "happy", text: `Tell me more about yourself here, ${n}. I love learning about you.` },
          ]),
          "/insights": pick<Say>([
            { mood: "thinking", text: "Let's see how your week really went…" },
            { mood: "thinking", text: "Numbers time. Don't worry, I'll be honest but nice." },
          ]),
          "/settings": pick<Say>([
            { mood: "excited", text: "Are you giving me a makeover?!" },
            { mood: "playful", text: "Ooh, dress-up time. Make me cute!" },
          ]),
        } as Record<string, Say>
      )[a.path] ?? null;
    case "task-done":
      return pick<Say>([
        { mood: "proud", text: `Yesss! “${l}” is DONE. Look at you go!` },
        { mood: "excited", text: `One down! “${l}” didn't stand a chance.` },
        { mood: "proud", text: `Done and done. I'm so proud of you, ${n}.` },
      ]);
    case "task-undone":
      return { mood: "surprised", text: `Oops, “${l}” is back on the list. No worries!` };
    case "task-added":
      return pick<Say>([
        { mood: "happy", text: `Added “${l}”. You've got this.` },
        { mood: "thinking", text: `“${l}”, noted! Want me to break it into steps later?` },
      ]);
    case "task-removed":
      return { mood: "neutral", text: "Gone! One less thing to think about." };
    case "goal-added":
      return pick<Say>([
        { mood: "excited", text: `A new goal: “${l}”! I'm SO in.` },
        { mood: "love", text: `“${l}”… I love that for you. Let's make it real.` },
      ]);
    case "goal-progress":
      return { mood: "proud", text: `Progress on “${l}”! Little steps, big wins.` };
    case "goal-done":
      return { mood: "excited", text: `YOU DID IT! “${l}” is complete! 🎉` };
    case "habit-added":
      return { mood: "happy", text: `New habit: “${l}”. Same time every day, okay?` };
    case "habit-toggled":
      return pick<Say>([
        { mood: "proud", text: `${l}, ticked! Your streak is growing.` },
        { mood: "happy", text: `${l}. Consistency looks good on you.` },
      ]);
    case "person-added":
      return { mood: "love", text: `Ooh, who's ${l}? Tell me about them sometime!` };
    case "person-contacted":
      return { mood: "love", text: `You talked to ${l}! That's so sweet.` };
    case "memory-added":
      return { mood: "happy", text: "Got it. I'll remember that." };
    case "look-changed":
      return pick<Say>([
        { mood: "love", text: "I LOVE my new look. Thank you!" },
        { mood: "excited", text: "Do I look cute? Be honest. Actually no, just say yes." },
      ]);
    case "profile-updated":
      return { mood: "happy", text: `Thanks for telling me more, ${n}!` };
    case "checkin":
      return null; // the home page already responds to check-ins
    case "idle":
      return pick<Say>([
        { mood: "sleepy", text: `Still there, ${n}? I'll wait right here…` },
        { mood: "thinking", text: "Hmm, it's quiet. Stuck on something? I can help." },
      ]);
    case "back":
      return pick<Say>([
        { mood: "excited", text: `You're back! I missed you, ${n}.` },
        { mood: "happy", text: "Welcome back! Where were we?" },
      ]);
    default:
      return null;
  }
}

/** Steps worth saying out loud (page visits just show a bubble, so it doesn't talk all the time). */
const SPEAK: Activity["type"][] = ["task-done", "goal-done", "goal-added", "habit-toggled", "back", "look-changed", "person-contacted"];

/**
 * The small companion that hops along the bottom of every page, watches what
 * you do and reacts. Tap it to chat. Hidden on Home, where the big one lives.
 */
export function Buddy({
  color,
  eyeColor,
  accessory,
  name,
  userName,
  voice,
}: {
  color: BodyColor;
  eyeColor: EyeColor;
  accessory: Accessory;
  name: string;
  userName: string;
  voice: VoiceOpts;
}) {
  const path = usePathname();
  const [bubble, setBubble] = useState<Say | null>(null);
  const [x, setX] = useState(88); // % from the left of the screen
  const [hidden, setHidden] = useState(false);
  const hop = useRef<HTMLDivElement>(null);
  const lastSpoke = useRef(0);
  const unlocked = useRef(false);
  const onHome = path === "/home";

  const jump = () => {
    const el = hop.current;
    if (!el) return;
    el.classList.remove("buddy-hop");
    void el.offsetWidth;
    el.classList.add("buddy-hop");
  };

  // Audio can only start after the person interacts with the page.
  useEffect(() => {
    if (canAutoplay()) unlocked.current = true;
    const unlock = () => {
      unlocked.current = true;
      unlockAudio();
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  // React to every step.
  useEffect(() => {
    const seenPages = new Set<string>(JSON.parse(sessionStorage.getItem("mochi-seen-pages") ?? "[]") as string[]);
    return onActivity((a) => {
      if (window.location.pathname === "/home") return;
      if (a.type === "page") {
        // Comment on a page the first time this visit, then only sometimes.
        if (seenPages.has(a.path) && Math.random() > 0.25) return;
        seenPages.add(a.path);
        sessionStorage.setItem("mochi-seen-pages", JSON.stringify([...seenPages]));
      }
      const say = reaction(a, userName || "friend");
      if (!say) return;
      setMood(say.mood);
      setBubble(say);
      jump();
      const now = Date.now();
      if (SPEAK.includes(a.type) && unlocked.current && voice.voiceOn && now - lastSpoke.current > 6000 && !live.speaking) {
        lastSpoke.current = now;
        speak(say.text, voice);
      }
    });
  }, [userName, voice]);

  // Log page visits (after the listener above is attached, so the first page counts too).
  useEffect(() => {
    track("page");
  }, [path]);

  // Bubbles fade after a few seconds.
  useEffect(() => {
    if (!bubble) return;
    const t = setTimeout(() => setBubble(null), 5200);
    return () => clearTimeout(t);
  }, [bubble]);

  // Notice when they go quiet, and when they come back.
  useEffect(() => {
    let idleTimer: ReturnType<typeof setTimeout>;
    let idle = false;
    const arm = () => {
      clearTimeout(idleTimer);
      if (idle) {
        idle = false;
        track("back");
      }
      idleTimer = setTimeout(() => {
        idle = true;
        track("idle");
      }, 120_000);
    };
    const onVisible = () => document.visibilityState === "visible" && arm();
    arm();
    window.addEventListener("pointerdown", arm);
    window.addEventListener("keydown", arm);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(idleTimer);
      window.removeEventListener("pointerdown", arm);
      window.removeEventListener("keydown", arm);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  // Wander: hop to a new spot along the bottom now and then.
  useEffect(() => {
    const t = setInterval(() => {
      if (live.speaking) return;
      setX(8 + Math.random() * 80);
      jump();
    }, 18_000);
    return () => clearInterval(t);
  }, []);

  if (onHome || hidden) return null;

  return (
    <div
      className="pointer-events-none fixed bottom-24 z-40 transition-[left] duration-1600 ease-in-out md:bottom-4"
      style={{ left: `clamp(8px, calc(${x}% - 48px), calc(100% - 112px))` }}
    >
      {bubble && (
        <div className={`pop pointer-events-auto absolute bottom-26 w-56 ${x > 50 ? "right-0" : "left-0"}`}>
          <div className="rounded-2xl bg-white px-3.5 py-2.5 text-[13.5px] font-bold leading-snug text-ink shadow-lg ring-1 ring-violet-100">
            {bubble.text}
            <Link href="/home" className="mt-1.5 flex items-center gap-1 text-xs font-extrabold text-grape hover:underline">
              <MessageCircleHeart className="h-3.5 w-3.5" /> Talk to {name}
            </Link>
          </div>
        </div>
      )}
      <div className="group pointer-events-auto relative">
        <button
          onClick={() => setHidden(true)}
          className="absolute -right-1 -top-1 z-10 hidden h-5 w-5 place-items-center rounded-full bg-white text-muted shadow ring-1 ring-line hover:text-rose-500 group-hover:grid"
          aria-label={`Hide ${name}`}
          title="Hide for now"
        >
          <X className="h-3 w-3" />
        </button>
        <div
          ref={hop}
          className="h-25 w-24"
          onClick={() => setBubble(pick<Say>([{ mood: "happy", text: `Hi ${userName || "friend"}! Want to talk?` }, { mood: "playful", text: "Hehe, that tickles! Need anything?" }, { mood: "love", text: "I'm right here if you need me." }]))}
          onAnimationEnd={() => hop.current?.classList.remove("buddy-hop")}
        >
          <Mochi color={color} eyeColor={eyeColor} accessory={accessory} />
        </div>
      </div>
    </div>
  );
}
