import { overdueContacts } from "@/lib/progress";
import type { Db, FocusArea, LifeStage } from "@/lib/types";

export type QuickAction = { emoji: string; title: string; prompt: string; hue: number };

const STAGE: Record<LifeStage, QuickAction[]> = {
  student: [
    { emoji: "📚", title: "Study plan", prompt: "Make me a realistic study plan for my upcoming exams", hue: 250 },
    { emoji: "🎯", title: "What after this?", prompt: "Help me figure out what to do after my studies", hue: 200 },
  ],
  working: [
    { emoji: "💼", title: "Grow at work", prompt: "Help me grow faster in my career this quarter", hue: 220 },
    { emoji: "🔋", title: "Beat burnout", prompt: "I'm tired from work. Help me recharge and set better boundaries", hue: 160 },
  ],
  business: [
    { emoji: "📈", title: "Grow my business", prompt: "Give me 3 practical ideas to grow my business this month", hue: 140 },
    { emoji: "🧾", title: "Plan the week", prompt: "Plan my business week with priorities", hue: 30 },
  ],
  "job-seeking": [
    { emoji: "🔎", title: "Interview prep", prompt: "Help me prepare for my next interview with a practice quiz", hue: 210 },
    { emoji: "📄", title: "Job hunt plan", prompt: "Make me a 2-week job hunt plan", hue: 260 },
  ],
  parent: [
    { emoji: "🧸", title: "Fun with kids", prompt: "Give me a fun activity to do with my kids this weekend", hue: 330 },
    { emoji: "⏳", title: "Me-time", prompt: "Help me find time for myself this week", hue: 280 },
  ],
  homemaker: [
    { emoji: "🍲", title: "Plan the week", prompt: "Plan meals and chores for this week so it feels lighter", hue: 30 },
    { emoji: "🌷", title: "Something for me", prompt: "Suggest something new just for me to learn or enjoy", hue: 320 },
  ],
  retired: [
    { emoji: "🌅", title: "New hobby", prompt: "Suggest a meaningful new hobby I could start", hue: 40 },
    { emoji: "🧠", title: "Brain game", prompt: "Play a fun brain-teaser quiz with me", hue: 260 },
  ],
  other: [
    { emoji: "🧭", title: "Find direction", prompt: "Help me figure out what I want next in life", hue: 200 },
    { emoji: "✨", title: "Surprise me", prompt: "Surprise me with something fun and useful today", hue: 300 },
  ],
};

const FOCUS: Record<FocusArea, QuickAction> = {
  career: { emoji: "💼", title: "Career move", prompt: "What's the smartest next step in my career?", hue: 220 },
  learning: { emoji: "🧩", title: "Learn something", prompt: "Give me a 7-day learning challenge on something useful", hue: 250 },
  health: { emoji: "💪", title: "Move more", prompt: "Build me a simple workout I can actually stick to", hue: 150 },
  mind: { emoji: "🧘", title: "Calm down", prompt: "Give me a 5-minute calm-down routine right now", hue: 190 },
  relationships: { emoji: "💞", title: "Be closer", prompt: "How can I be a better friend or partner this week?", hue: 340 },
  family: { emoji: "🏠", title: "Family time", prompt: "How can I spend better time with my family?", hue: 20 },
  money: { emoji: "💰", title: "Money plan", prompt: "Help me make a simple monthly budget", hue: 130 },
  productivity: { emoji: "⏰", title: "Beat procrastination", prompt: "Help me stop procrastinating today", hue: 45 },
  creativity: { emoji: "🎨", title: "Create", prompt: "Give me a small creative challenge for today", hue: 290 },
  confidence: { emoji: "🦁", title: "Confidence", prompt: "Give me a confidence challenge for this week", hue: 25 },
  social: { emoji: "📱", title: "What to post", prompt: "What should I post this week? Give me 3 ideas with captions", hue: 310 },
  purpose: { emoji: "🌱", title: "Reflect", prompt: "Help me reflect on what gives my life meaning", hue: 110 },
};

const ALWAYS: QuickAction[] = [
  { emoji: "🗓️", title: "Plan my day", prompt: "Plan my day around my routine, habits and tasks", hue: 260 },
  { emoji: "💬", title: "Talk it out", prompt: "I want to talk about how I'm feeling", hue: 330 },
  { emoji: "⚖️", title: "Help me decide", prompt: "Help me make a decision I'm stuck on", hue: 200 },
  { emoji: "🪞", title: "Honest check-in", prompt: "Be honest: what am I doing right and wrong lately?", hue: 40 },
];

/** Eight quick actions tuned to who the user is. */
export function quickActions(db: Db): QuickAction[] {
  const picks = [ALWAYS[0], ...STAGE[db.profile.lifeStage], ...db.profile.focusAreas.slice(0, 3).map((f) => FOCUS[f]), ALWAYS[1], ALWAYS[2], ALWAYS[3]];
  const friend = overdueContacts(db, new Date().toLocaleDateString("en-CA"))[0];
  if (friend) picks.splice(4, 0, { emoji: "💌", title: `Reach ${friend.name}`, prompt: `Should I reach out to ${friend.name}? What should I say?`, hue: 350 });
  const seen = new Set<string>();
  return picks.filter((q) => !seen.has(q.title) && seen.add(q.title)).slice(0, 8);
}

/** Short follow-up prompts shown above the chat input. */
export function chatChips(db: Db): string[] {
  const goal = db.goals.find((g) => g.status === "active")?.title;
  const qa = quickActions(db).map((q) => q.prompt);
  return [...(goal ? [`Give me a challenge for "${goal}"`] : []), ...qa, "Quiz me on something useful"].slice(0, 9);
}
