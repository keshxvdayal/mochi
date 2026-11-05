import { Home } from "@/components/home";
import { pageDb } from "@/lib/page-data";
import { chatChips, quickActions } from "@/lib/personal";
import { habitStreak, overdueContacts, streak, taskBuckets } from "@/lib/progress";
import { today } from "@/lib/store";
import type { Db, Mood } from "@/lib/types";

/** A greeting chosen from your data, so the companion reacts before any AI call. */
function greet(db: Db): { mood: Mood; text: string } {
  const name = db.profile.name.split(" ")[0] || "friend";
  const hour = new Date().getHours();
  const t = today();
  const b = taskBuckets(db.tasks, t);
  const s = streak(db.tasks, db.checkins, t);
  const friends = overdueContacts(db, t);
  const habitsLeft = db.habits.filter((h) => !h.log.includes(t));
  if (hour >= 23 || hour < 5) return { mood: "sleepy", text: `It's so late, ${name}… *yawn*. Let's wrap up and get some sleep soon, okay?` };
  if (b.overdue.length >= 3) return { mood: "worried", text: `${name}, ${b.overdue.length} tasks are overdue. Want me to help you sort them out?` };
  if (s >= 3) return { mood: "proud", text: `${s}-day streak, ${name}! I'm so proud of you. What are we doing today?` };
  if (hour >= 18 && habitsLeft.length && db.habits.length) return { mood: "playful", text: `Psst, ${name}… ${habitsLeft[0].emoji} ${habitsLeft[0].title} isn't ticked yet today!` };
  if (b.today.length) return { mood: "happy", text: `Hi ${name}! You've got ${b.today.length} thing${b.today.length === 1 ? "" : "s"} planned for today. Ready?` };
  if (friends[0]) return { mood: "love", text: `Hey ${name}! Random thought: when did you last talk to ${friends[0].name}?` };
  const part = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  return { mood: "happy", text: `${part}, ${name}! What's on your mind today?` };
}

export default async function Page({ searchParams }: { searchParams: Promise<{ ask?: string }> }) {
  const { ask } = await searchParams;
  const db = await pageDb();
  const t = today();
  const b = taskBuckets(db.tasks, t);
  const c = db.companion;
  const next = [...b.overdue, ...b.today][0]?.title ?? null;
  return (
    <Home
      companionName={c.name}
      color={c.color}
      eyeColor={c.eyeColor}
      accessory={c.accessory}
      voice={{ voiceOn: c.voiceOn, voiceName: c.voiceName, pitch: c.pitch, rate: c.rate, voiceEngine: c.voiceEngine, geminiVoice: c.geminiVoice }}
      userName={db.profile.name.split(" ")[0]}
      initialMessages={db.messages.slice(-40)}
      greeting={greet(db)}
      checkedIn={db.checkins.some((x) => x.date === t)}
      chips={chatChips(db)}
      actions={quickActions(db)}
      habits={db.habits.map((h) => ({ id: h.id, title: h.title, emoji: h.emoji, done: h.log.includes(t), streak: habitStreak(h.log, t) }))}
      today={{ due: b.today.length, overdue: b.overdue.length, next, streak: streak(db.tasks, db.checkins, t), dateLabel: new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" }) }}
      initialAsk={ask?.slice(0, 500) ?? null}
    />
  );
}
