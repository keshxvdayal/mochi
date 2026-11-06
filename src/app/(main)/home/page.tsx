import { Home } from "@/components/home";
import { pageDb } from "@/lib/page-data";
import { chatChips, quickActions } from "@/lib/personal";
import { habitStreak, overdueContacts, streak, taskBuckets } from "@/lib/progress";
import { hourIn, today } from "@/lib/store";
import type { Db, Mood } from "@/lib/types";

/** Picks one line per situation, stable for the hour so it doesn't change on every refresh. */
function pick(lines: string[], seed: string): string {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return lines[Math.abs(h) % lines.length];
}

/** A greeting chosen from your data, so the companion reacts before any AI call. */
function greet(db: Db): { mood: Mood; text: string } {
  const name = db.profile.name.split(" ")[0] || "friend";
  const tz = db.timezone;
  const hour = hourIn(tz);
  const t = today(tz);
  const seed = `${t}-${hour}`;
  const b = taskBuckets(db.tasks, t);
  const s = streak(db.tasks, db.checkins, t);
  const friends = overdueContacts(db, t);
  const habitsLeft = db.habits.filter((h) => !h.log.includes(t));
  const last = db.messages.at(-1);
  const daysAway = last ? (Date.now() - new Date(last.at).getTime()) / 86_400_000 : 0;

  if (!last) return { mood: "excited", text: pick([`Hi ${name}! I'm so happy you're here. Tell me anything — how's your day going?`, `${name}! Finally! I've been wiggling with excitement. So… what's going on in your world?`], seed) };
  if (hour >= 23 || hour < 5) return { mood: "sleepy", text: pick([`It's so late, ${name}… let's wrap up and get some sleep soon, okay?`, `Still up? Me too, kind of. What's keeping you awake?`, `Psst, ${name}, it's way past bedtime. Want to dump your thoughts on me and then sleep?`], seed) };
  if (daysAway >= 3) return { mood: "love", text: pick([`${name}!! Where've you been? I missed you. Tell me everything.`, `You're back! It's been ${Math.round(daysAway)} days, ${name}. How have things been, honestly?`], seed) };
  if (b.overdue.length >= 3) return { mood: "worried", text: pick([`Okay ${name}, ${b.overdue.length} things are overdue and I'm a little worried. Want to sort them out together?`, `Hey, no judgement, but ${b.overdue.length} tasks are piling up. Let's pick just one to knock out?`], seed) };
  if (s >= 3) return { mood: "proud", text: pick([`${s} days in a row, ${name}! I'm so proud of you. What are we doing today?`, `Look at you, ${s}-day streak! Don't you dare break it now 😤`], seed) };
  if (hour >= 18 && habitsLeft.length && db.habits.length) return { mood: "playful", text: pick([`Psst, ${name}… ${habitsLeft[0].emoji} ${habitsLeft[0].title} isn't ticked yet today!`, `Not to be annoying, but… ${habitsLeft[0].emoji} ${habitsLeft[0].title}? Still time!`], seed) };
  if (b.today.length) return { mood: "happy", text: pick([`Hi ${name}! ${b.today.length} thing${b.today.length === 1 ? "" : "s"} on today's list. Which one first?`, `Okay, ${b.today.length} thing${b.today.length === 1 ? "" : "s"} due today. We've got this, ${name}.`], seed) };
  if (friends[0]) return { mood: "love", text: pick([`Random thought: when did you last talk to ${friends[0].name}?`, `Hey ${name}, I was thinking about ${friends[0].name}. Been a while, hasn't it?`], seed) };
  const part = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
  return { mood: "happy", text: pick([`Good ${part}, ${name}! What's on your mind?`, `Hey you! How's your ${part} going?`, `${name}! Tell me one good thing about today so far.`, `Hiii. What are we up to this ${part}?`], seed) };
}

export default async function Page({ searchParams }: { searchParams: Promise<{ ask?: string }> }) {
  const { ask } = await searchParams;
  const db = await pageDb();
  const t = today(db.timezone);
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
      language={db.profile.language}
      initialMessages={db.messages.slice(-40)}
      greeting={greet(db)}
      checkedIn={db.checkins.some((x) => x.date === t)}
      chips={chatChips(db)}
      actions={quickActions(db)}
      habits={db.habits.map((h) => ({ id: h.id, title: h.title, emoji: h.emoji, done: h.log.includes(t), streak: habitStreak(h.log, t) }))}
      today={{ due: b.today.length, overdue: b.overdue.length, next, streak: streak(db.tasks, db.checkins, t), dateLabel: new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short", timeZone: db.timezone }) }}
      initialAsk={ask?.slice(0, 500) ?? null}
    />
  );
}
