import type { Mood } from "@/lib/types";

/** Lines Mochi acts out on the landing page, so visitors see what it's like before signing up. */
export const DEMO: { mood: Mood; line: string }[] = [
  { mood: "excited", line: "Hiii! I'm Mochi. I'd love to be your companion!" },
  { mood: "happy", line: "I remember your goals, your people and your day." },
  { mood: "thinking", line: "Big decision? Let's weigh it up together." },
  { mood: "proud", line: "Seven-day streak?! I'm SO proud of you." },
  { mood: "worried", line: "Three tasks overdue… want to sort them out?" },
  { mood: "love", line: "Had a rough day? Come here. Tell me everything." },
  { mood: "playful", line: "Quiz time! Bet you can't get all five right 😏" },
  { mood: "sleepy", line: "It's late… let's plan tomorrow, then sleep?" },
];

export const TRY: { mood: Mood; emoji: string; line: string }[] = [
  { mood: "happy", emoji: "😊", line: "Yay, a good day!" },
  { mood: "sad", emoji: "😢", line: "Aww… I'm right here." },
  { mood: "angry", emoji: "😤", line: "Hmph! You skipped your workout again!" },
  { mood: "surprised", emoji: "😮", line: "Wait, WHAT? Tell me more!" },
  { mood: "love", emoji: "🥰", line: "You're my favourite human." },
  { mood: "sleepy", emoji: "😴", line: "Five more minutes… please…" },
];

/** Letters only, lowercased: how the voice endpoint recognises a demo line however it was cleaned up. */
export const demoKey = (text: string) => text.toLowerCase().replace(/[^\p{L}]/gu, "");
/** The only lines the voice will say for visitors who aren't signed in. */
export const PUBLIC_LINES = new Set([...DEMO.map((d) => d.line), ...TRY.map((t) => t.line)].map(demoKey));
