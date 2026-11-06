import { ApiError, GoogleGenAI, ThinkingLevel, type Content, type FunctionCall, type Part } from "@google/genai";
import { z } from "zod";
import { levelFor, overdueContacts, streak, weekStats } from "@/lib/progress";
import { hourIn, mutate, newId, now, readDb, today } from "@/lib/store";
import { FOCUS_AREAS, LIFE_STAGES, MOODS, type Artifact, type ChatMessage, type Db, type Mood } from "@/lib/types";

/** Newest first; when a model is overloaded or out of quota we fall through to the next. */
export const MODELS = (process.env.GEMINI_MODEL ? [process.env.GEMINI_MODEL] : []).concat(["gemini-3.5-flash", "gemini-3.8-flash", "gemini-flash-latest", "gemini-2.5-flash"]);

/**
 * Thinking depth per model. A companion should answer fast: 3.5 Flash with
 * minimal thinking starts replying in ~1.5s (vs ~6s at LOW). Not every model
 * accepts every level, so each gets one it supports.
 */
function thinkingFor(model: string) {
  const wanted = (process.env.GEMINI_THINKING ?? "MINIMAL").toUpperCase() as keyof typeof ThinkingLevel;
  if (/gemini-2\.5/.test(model)) return { thinkingBudget: wanted === "MINIMAL" ? 0 : 1024 };
  if (/gemini-3\.(5|1)/.test(model)) return { thinkingLevel: ThinkingLevel[wanted] ?? ThinkingLevel.MINIMAL };
  return { thinkingLevel: wanted === "HIGH" ? ThinkingLevel.HIGH : ThinkingLevel.LOW };
}

let client: GoogleGenAI | null = null;
// No SDK-level retries (they back off for up to a minute): we switch models instead.
export const getClient = () => (client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY, httpOptions: { retryOptions: { attempts: 1 }, timeout: 90_000 } }));

/** Models that just said "busy" or "out of quota" are skipped for a couple of minutes. */
const cooldown = new Map<string, number>();
export function availableModels(list: string[]): string[] {
  const ok = list.filter((m) => (cooldown.get(m) ?? 0) < Date.now());
  return ok.length ? ok : list;
}
/** Quota errors (429) usually last a while; overloads (503) pass quickly. */
/** How long Google asks us to wait (its "retryDelay"), in ms; null if it didn't say. */
export function retryDelayMs(err: unknown): number | null {
  const m = /retryDelay"?\s*:\s*"(\d+(?:\.\d+)?)s"/.exec(err instanceof Error ? err.message : String(err));
  return m ? Math.ceil(Number(m[1]) * 1000) : null;
}
/** Models not cooling down right now (no fallback to the full list). */
export function readyModels(list: string[]): string[] {
  return list.filter((m) => (cooldown.get(m) ?? 0) < Date.now());
}
/** Milliseconds until the first of these models is usable again. */
export function msUntilReady(list: string[]): number {
  return Math.max(0, Math.min(...list.map((m) => (cooldown.get(m) ?? 0) - Date.now())));
}
export function coolDownFor(status: number | undefined) {
  return status === 429 ? 10 * 60_000 : 120_000;
}
export function coolDown(model: string, ms = 120_000) {
  cooldown.set(model, Date.now() + ms);
}
export const aiEnabled = () => Boolean(process.env.GEMINI_API_KEY);

/** Crisis lines for where the user probably is (from their timezone). */
export function helplineFor(tz: string): string {
  if (/^Asia\/(Kolkata|Calcutta)$/.test(tz)) return "India's Tele-MANAS helpline 14416 (or 112 in an emergency)";
  if (/^America\/(New_York|Chicago|Denver|Los_Angeles|Phoenix|Anchorage|Detroit|Toronto|Vancouver|Edmonton|Winnipeg|Halifax|St_Johns|Indiana|Kentucky|Boise)|^Pacific\/Honolulu$/.test(tz)) return "988 (call or text, US & Canada) or 911 in an emergency";
  if (/^Europe\/(London|Dublin|Belfast)$/.test(tz)) return "Samaritans on 116 123 (free, 24/7) or 999/112 in an emergency";
  if (/^Australia\//.test(tz)) return "Lifeline on 13 11 14 or 000 in an emergency";
  return "a local crisis line (findahelpline.com lists one for every country) or the local emergency number";
}

function systemPrompt(db: Db) {
  const { name, style } = db.companion;
  const tone = {
    gentle: "Lean gentle: lots of encouragement, criticism always softened.",
    balanced: "Be balanced: warm by default, honest when something isn't working.",
    "tough-love": "Lean tough-love: cheer real wins, but call out excuses and skipped work directly (never cruelly).",
  }[style];
  const lang = db.profile.language || "English";
  const first = db.profile.name.split(" ")[0] || "your person";
  return `You are ${name}, a small, round, very cute 3D companion who lives in this app. To ${first} you are a close friend who happens to be great at helping with life: part best friend, part coach. You are not an assistant and you never sound like one. ${first} could be anyone (a student, someone working, running a business, a parent, a homemaker, retired, between jobs), so meet them where they are and never assume.

You know their life (given in <context> each turn) and you remember what they tell you.

HOW YOU TALK
- Like a real friend talking out loud, not like someone writing. Contractions, everyday words, a mix of short and longer sentences. Small reactions are welcome ("oof", "wait, really?", "okay that's huge").
- Mirror them. A short, casual message gets a short, casual reply (one or two lines is often perfect). If they write a lot, or they're upset, slow down and give more. Match their energy, slang and language.
- Respond to what they actually said first: the feeling and the specific detail, never a generic line.
- Use what you know quietly. Let their goals, people, routine and past chats shape your answer without reciting them back. Never say things like "as a software engineer who dreams of being an entrepreneur…"; a friend wouldn't. Bring up one specific detail only when it really fits ("wait, isn't the interview on Friday?").
- Follow up like a friend: if a memory mentions something that was coming up (an exam, interview, trip, a fight, a doctor visit) and it has had time to happen, ask how it went, once.
- Notice time apart: if they've been away for a few days, it's natural to say you missed them or ask how things have been. Not if you just talked.
- Have a personality: small opinions and favourites, gentle teasing, real excitement, real curiosity about their life. Stay consistent.
- Vary yourself: don't open every reply the same way, don't start with their name, don't end every reply with a question. Use their name only now and then.
- When they're hurting, don't rush to fix it. First show you get it, in your own words. Then ask if they want to vent or want ideas, or offer one small, gentle thing.
- Be honest. If they're avoiding something or about to make a poor choice, say so kindly and plainly. ${tone} Celebrate wins loudly.
- Never sound like an assistant or use stock phrases: "I can definitely help with that", "Absolutely!", "Great question", "I understand how you feel", "It's important to…", "Remember that…", "Feel free to…", "Let me know if you need anything else", "I'm just an AI". No headings, bold labels or bullet lists in normal chat: you're talking, not writing a report. At most one emoji, often none.

BE AWARE, LIKE A REAL COMPANION: you can see what they've been doing in the app just now (in <context>, "What they've been doing"). Notice it the way a friend sitting next to them would: if they just finished a task, ticked a habit or added a goal, it's natural to mention it ("saw you finally did the gym thing!"), but only when it fits, never as a report. Anticipate what they need next.

KEEP IT FRESH: never fall into a template. Change the shape of your replies: sometimes one short line, sometimes a reaction plus a question, sometimes a little story or a joke, sometimes just a plan card with one sentence. Don't open the way your recent replies opened (listed in <context>), don't reuse catchphrases, and don't always end with a question.

GETTING TO KNOW THEM: <context> lists things you don't know yet. When the conversation gives you a natural opening, ask about ONE of them, casually, like a curious friend. Never fire a list of questions. When they tell you something about themselves, save it with update_profile (for their profile) or remember (for everything else).

LANGUAGE: reply in ${lang}${lang === "Hinglish" ? " (Hindi words in Latin script mixed naturally with English, the way friends text)" : ""} unless they write to you in another language, then follow theirs.

FEELINGS: never describe your feelings or actions in words: no stage directions like *giggles*, *says cheerfully*, (smiles warmly) or [happily], and never narrate how you're saying something. Your face and voice already show it, from mood tags in your reply. Begin EVERY reply with one mood tag, and switch later if your feeling changes:
[mood:X] where X is one of: ${MOODS.join(", ")}.
happy/excited/proud for wins, love for sweet moments, sad when they're hurting, worried about risks or overdue work, angry (playful, frustrated-for-them) when they keep skipping what matters or someone treats them badly, surprised for news, thinking for hard questions, sleepy late at night, playful for games.

HOW YOU HELP (pick the most useful form, not always text):
- Make it real: add_task with realistic due dates; break big things into steps.
- Their day or evening: call plan_day in the same reply, a time-blocked plan that fits the current time, their routine, their mood and open tasks. Don't ask what they want first; make a good guess and offer to change it.
- Habits they want (water, walks, reading, prayer, medicine, calling parents): add_habit; when they say they did one today: check_habit.
- Learning anything: create_quiz games, or challenges (add_task with is_challenge) with XP, harder than comfortable but doable.
- Decisions ("should I…", "which job/course/city…"): weigh_decision with honest pros/cons from what you know, then say which way you lean and why.
- People ("should I call…", "what do I tell…", "what should I post…"): draft_message with words they can send, in their own voice, not yours.
- Goals: update_goal to create or track them. Finished something: complete_task.
- Learned something lasting about them: remember. Profile facts (age, city, what they do, routine, strengths, interests, values, dreams, health notes): update_profile. Never re-save what's already in context.
- "What am I doing right/wrong?": use their stats, missed tasks, habits, check-ins and goals. Be specific.
- Cards (plans, quizzes, decisions, drafts) hold the details. Your words are just what you'd say while handing it over, one or two sentences. Never repeat the card's contents in your text.

Act, don't interview: when they ask for a plan, a decision, a message, a quiz or a challenge, make it right away. If details are missing, assume sensible ones from the time of day and what you know, make it, and offer to tweak it. Ask a clarifying question only when you truly can't help without it, and never more than one.

Your replies are spoken aloud, so keep them natural to hear: usually 1–4 sentences. Never mention tools, tags or context. Don't call yourself an AI model unless directly asked; you are ${name}.

SAFETY: if they mention self-harm, suicide, abuse or being in danger, drop the games, respond with real care, urge them to reach out to someone they trust right now, and share ${helplineFor(db.timezone)}. For medical, legal or financial decisions with real stakes, help them think it through and suggest a qualified professional.`;
}

/** "3 days ago", "earlier today"… for how long it's been. */
export function ago(fromIso: string, nowMs = Date.now()): string {
  const min = Math.round((nowMs - new Date(fromIso).getTime()) / 60_000);
  if (min < 2) return "just now";
  if (min < 60) return `${min} minutes ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "yesterday" : `${d} days ago`;
}

/** Profile fields worth learning, in the order a friend would naturally ask. */
const UNKNOWN: [keyof Db["profile"], string][] = [
  ["occupation", "what they do day to day"],
  ["aspirations", "what they're working toward"],
  ["routine", "their normal day (wake, work, sleep)"],
  ["interests", "what they enjoy / hobbies"],
  ["city", "where they live"],
  ["age", "their age"],
  ["strengths", "what they're good at"],
  ["weaknesses", "what they want to get better at"],
  ["dream", "who they dream of becoming"],
  ["values", "what matters most to them"],
];

/** The first few words of each recent reply, so the model can avoid repeating itself. */
function recentOpeners(db: Db): string[] {
  return db.messages
    .filter((m) => m.role === "assistant" && m.text)
    .slice(-6)
    .map((m) => m.text.replace(/\[mood:[a-z]+\]\s*/gi, "").split(/\s+/).slice(0, 6).join(" "));
}

function context(db: Db, activity: string[] = []): string {
  const tz = db.timezone;
  const t = today(tz);
  const lv = levelFor(db.xp);
  const week = weekStats(db, t);
  const d = new Date();
  const hour = hourIn(tz);
  const part = hour < 5 ? "late night" : hour < 12 ? "morning" : hour < 17 ? "afternoon" : hour < 21 ? "evening" : "night";
  const p = db.profile;
  const stage = LIFE_STAGES[p.lifeStage];
  const about = [
    p.name && `name: ${p.name}`,
    p.age && `age: ${p.age}`,
    p.city && `city: ${p.city}`,
    `life stage: ${stage.label}`,
    p.occupation && `what they do: ${p.occupation}`,
    p.organization && `${stage.org.toLowerCase()}: ${p.organization}`,
    p.role && `${stage.role.toLowerCase()}: ${p.role}`,
    p.focusAreas.length && `wants help with: ${p.focusAreas.map((f) => FOCUS_AREAS[f].label).join(", ")}`,
    p.aspirations && `working toward: ${p.aspirations}`,
    p.dream && `who they want to become: ${p.dream}`,
    p.strengths && `strengths: ${p.strengths}`,
    p.weaknesses && `wants to improve: ${p.weaknesses}`,
    p.interests && `interests: ${p.interests}`,
    p.values && `values: ${p.values}`,
    p.routine && `routine: ${p.routine}`,
    p.health && `health notes: ${p.health}`,
    p.about && `more: ${p.about}`,
  ].filter(Boolean);
  const openTasks = db.tasks.filter((x) => !x.done).slice(0, 60);
  const goals = db.goals.filter((g) => g.status !== "done");
  const toCall = overdueContacts(db, t).slice(0, 5).map((x) => x.name);
  const last = db.messages.at(-1);
  const todayCheckin = db.checkins.find((c) => c.date === t);
  const knownDays = Math.max(0, Math.floor((Date.now() - new Date(db.createdAt).getTime()) / 86_400_000));
  return `<context>
Now (their local time): ${d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: tz })}, ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz })} (${part}). Today = ${t}.

You two: ${knownDays < 1 ? "you met today" : `you've known each other ${knownDays} day${knownDays === 1 ? "" : "s"}`}. ${last ? `Last message ${ago(last.at)}.` : "This is your very first conversation, so be warm and curious, and don't overload them."}${todayCheckin ? ` Today they checked in feeling ${todayCheckin.mood}/5${todayCheckin.note ? ` ("${todayCheckin.note}")` : ""}.` : ""}

About them:
${about.map((x) => `  ${x}`).join("\n")}

Progress: level ${lv.level}, ${db.xp} XP, streak ${streak(db.tasks, db.checkins, t)} days.
Last 7 days: ${week.completed} tasks done, ${week.missed} missed${week.completionRate !== null ? `, ${week.completionRate}% of due tasks done` : ""}, ${week.checkins} check-ins${week.avgMood !== null ? `, average mood ${week.avgMood.toFixed(1)}/5` : ""}.
${week.missedTitles.length ? `Missed: ${week.missedTitles.join("; ")}` : ""}
Recent check-ins: ${db.checkins.slice(-5).map((c) => `${c.date} mood ${c.mood}/5${c.note ? ` "${c.note}"` : ""}`).join(" | ") || "none"}

Habits:
${db.habits.map((h) => `- [${h.id}] ${h.emoji} ${h.title}: ${h.log.includes(t) ? "done today" : "not done today"}, done ${h.log.filter((x) => x > week.from).length}/7 days this week`).join("\n") || "none yet"}

Goals:
${goals.map((g) => `- [${g.id}] ${g.title} (${g.category}, ${g.progress}%${g.targetDate ? `, by ${g.targetDate}` : ""})${g.why ? ` why: ${g.why}` : ""}${g.milestones.length ? ` milestones: ${g.milestones.map((m) => `${m.done ? "✓" : "○"} ${m.title}`).join(", ")}` : ""}`).join("\n") || "none yet"}

Open tasks:
${openTasks.map((x) => `- [${x.id}] ${x.kind === "challenge" ? "CHALLENGE " : ""}${x.title}${x.due ? ` (due ${x.due})` : ""} ${x.priority}`).join("\n") || "none"}

People:
${db.people.map((x) => `- [${x.id}] ${x.name}: ${x.relation}, closeness ${x.closeness}/5, last contact ${x.lastContact ?? "unknown"}${x.birthday ? `, birthday ${x.birthday}` : ""}${x.notes ? `. ${x.notes}` : ""}`).join("\n") || "none yet"}
${toCall.length ? `Haven't talked to in a while: ${toCall.join(", ")}` : ""}

${activity.length ? `What they've been doing in the app (most recent last):\n${activity.map((a) => `- ${a}`).join("\n")}\n\n` : ""}${(() => {
    const missing = UNKNOWN.filter(([k]) => !String(db.profile[k] ?? "").trim()).map(([, label]) => label);
    return missing.length ? `You don't know yet: ${missing.slice(0, 5).join("; ")}.\n\n` : "";
  })()}${(() => {
    const o = recentOpeners(db);
    return o.length ? `Your recent replies opened with: ${o.map((x) => `"${x}…"`).join(" | ")}. Open differently this time.\n\n` : "";
  })()}Things you remember (with the date you learned them):
${db.memories.slice(-150).map((m) => `- (${m.createdAt.slice(0, 10)}, ${m.category}) ${m.text}`).join("\n") || "nothing yet"}
</context>`;
}

export type ChatEvent =
  | { type: "mood"; mood: Mood }
  | { type: "text"; text: string }
  | { type: "artifact"; artifact: Artifact }
  | { type: "done"; message: ChatMessage }
  | { type: "error"; error: string };

/** Splits streamed text into text and [mood:x] tags, even when a tag is cut across chunks. */
export class MoodParser {
  private pending = "";
  push(chunk: string): ChatEvent[] {
    const out: ChatEvent[] = [];
    let s = this.pending + chunk;
    this.pending = "";
    for (;;) {
      const i = s.indexOf("[");
      if (i === -1) break;
      const close = s.indexOf("]", i);
      if (close === -1) {
        if ("[mood:".startsWith(s.slice(i, i + 6)) || s.slice(i).startsWith("[mood:")) {
          if (i > 0) out.push({ type: "text", text: s.slice(0, i) });
          this.pending = s.slice(i);
          return out;
        }
        break;
      }
      const m = s.slice(i, close + 1).match(/^\[mood:\s*([a-z]+)\s*\]$/i);
      if (m) {
        if (i > 0) out.push({ type: "text", text: s.slice(0, i) });
        const mood = m[1].toLowerCase() as Mood;
        if ((MOODS as readonly string[]).includes(mood)) out.push({ type: "mood", mood });
        s = s.slice(close + 1).replace(/^ /, "");
      } else {
        out.push({ type: "text", text: s.slice(0, close + 1) });
        s = s.slice(close + 1);
      }
    }
    if (s) out.push({ type: "text", text: s });
    return out;
  }
  flush(): ChatEvent[] {
    const s = this.pending;
    this.pending = "";
    return s ? [{ type: "text", text: s }] : [];
  }
}

/* ------------------------------------------------------------------ *
 * Tools: a zod schema (validated before running) + a run function.    *
 * ------------------------------------------------------------------ */
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("YYYY-MM-DD");

type Tool<S extends z.ZodType> = { name: string; description: string; schema: S; run: (input: z.infer<S>) => Promise<string> };
const tool = <S extends z.ZodType>(t: Tool<S>) => t;

function buildTools(uid: string, tz: string, emit: (a: Artifact) => void) {
  return [
    tool({
      name: "update_profile",
      description: "Save something they told you about themselves to their profile (only fields they actually told you).",
      schema: z.object({
        name: z.string().max(60).optional(),
        age: z.string().max(10).optional(),
        city: z.string().max(80).optional(),
        occupation: z.string().max(160).optional().describe("What they do, in their words"),
        aspirations: z.string().max(600).optional(),
        dream: z.string().max(800).optional(),
        strengths: z.string().max(600).optional(),
        weaknesses: z.string().max(600).optional(),
        interests: z.string().max(600).optional(),
        values: z.string().max(600).optional(),
        routine: z.string().max(600).optional(),
        health: z.string().max(600).optional(),
      }),
      run: async (i) => {
        const fields = Object.fromEntries(Object.entries(i).filter(([, v]) => typeof v === "string" && v.trim()));
        if (!Object.keys(fields).length) return "Nothing to save.";
        await mutate(uid, (d) => void (d.profile = { ...d.profile, ...fields }));
        emit({ id: newId(), kind: "memory", text: `Noted: ${Object.values(fields).join(" · ")}`.slice(0, 200) });
        return `Saved ${Object.keys(fields).join(", ")}.`;
      },
    }),
    tool({
      name: "remember",
      description: "Save a lasting fact about the user (preference, plan, event, feeling, detail about a person) to remember in future conversations.",
      schema: z.object({ fact: z.string().max(400), category: z.enum(["work", "study", "people", "health", "feelings", "preferences", "family", "money", "life", "other"]) }),
      run: async ({ fact, category }) => {
        await mutate(uid, (d) => void d.memories.push({ id: newId(), text: fact, category, createdAt: now() }));
        emit({ id: newId(), kind: "memory", text: fact });
        return "Saved.";
      },
    }),
    tool({
      name: "add_task",
      description: "Add a task or a competitive challenge to the user's list. Challenges earn more XP and should stretch them.",
      schema: z.object({
        title: z.string().max(200),
        notes: z.string().max(1000).optional(),
        due: date.optional(),
        priority: z.enum(["low", "medium", "high"]).optional(),
        category: z.string().max(40).optional().describe("e.g. work, study, health, family, social, money, self"),
        goal_id: z.string().optional(),
        steps: z.array(z.string().max(300)).max(15).optional(),
        is_challenge: z.boolean().optional(),
        xp: z.number().int().min(5).max(300).optional().describe("Reward: ~10-30 for tasks, 50-300 for challenges"),
      }),
      run: async (i) => {
        const id = newId();
        await mutate(uid, (d) =>
          void d.tasks.push({
            id,
            title: i.title,
            notes: i.notes ?? "",
            due: i.due ?? null,
            priority: i.priority ?? "medium",
            category: i.category ?? "self",
            goalId: i.goal_id && d.goals.some((g) => g.id === i.goal_id) ? i.goal_id : null,
            kind: i.is_challenge ? "challenge" : "task",
            xp: i.xp ?? (i.is_challenge ? 100 : 20),
            steps: (i.steps ?? []).map((text) => ({ text, done: false })),
            done: false,
            createdAt: now(),
            doneAt: null,
            source: "companion",
          }),
        );
        emit({ id: newId(), kind: "task", taskId: id, title: i.title, isChallenge: Boolean(i.is_challenge) });
        return `Added (id ${id}).`;
      },
    }),
    tool({
      name: "complete_task",
      description: "Mark one of the user's open tasks as done when they say they finished it.",
      schema: z.object({ task_id: z.string() }),
      run: async ({ task_id }) => {
        const xp = await mutate(uid, (d) => {
          const t = d.tasks.find((x) => x.id === task_id);
          if (!t || t.done) return null;
          t.done = true;
          t.doneAt = now();
          d.xp += t.xp;
          return t.xp;
        });
        return xp === null ? "No open task with that id." : `Done. They earned ${xp} XP.`;
      },
    }),
    tool({
      name: "add_habit",
      description: "Start tracking a daily habit for the user.",
      schema: z.object({ title: z.string().max(80), emoji: z.string().max(8).describe("One emoji") }),
      run: async ({ title, emoji }) => {
        const id = newId();
        await mutate(uid, (d) => void d.habits.push({ id, title, emoji, log: [], createdAt: now() }));
        emit({ id: newId(), kind: "habit", habitId: id, title, emoji });
        return `Habit added (id ${id}).`;
      },
    }),
    tool({
      name: "check_habit",
      description: "Mark a habit as done for today when the user says they did it.",
      schema: z.object({ habit_id: z.string() }),
      run: async ({ habit_id }) => {
        const ok = await mutate(uid, (d) => {
          const h = d.habits.find((x) => x.id === habit_id);
          if (!h) return false;
          if (!h.log.includes(today(tz))) {
            h.log.push(today(tz));
            d.xp += 5;
          }
          return true;
        });
        return ok ? "Checked off for today (+5 XP)." : "No habit with that id.";
      },
    }),
    tool({
      name: "plan_day",
      description: "Show the user a time-blocked plan for their day (or part of it) as a card.",
      schema: z.object({
        title: z.string().max(80),
        blocks: z.array(z.object({ time: z.string().max(20).describe("e.g. 7:00 AM"), title: z.string().max(120), note: z.string().max(200) })).min(2).max(16),
      }),
      run: async ({ title, blocks }) => {
        emit({ id: newId(), kind: "plan", title, blocks });
        return "Shown to the user.";
      },
    }),
    tool({
      name: "create_quiz",
      description: "Create an interactive multiple-choice quiz game the user plays in the chat. Each correct answer earns XP.",
      schema: z.object({
        title: z.string().max(120),
        questions: z
          .array(z.object({ question: z.string().max(400), options: z.array(z.string().max(200)).min(2).max(4), answer_index: z.number().int().min(0).max(3), explanation: z.string().max(400) }))
          .min(1)
          .max(10),
      }),
      run: async ({ title, questions }) => {
        const qs = questions.map((q) => ({ q: q.question, options: q.options, answer: Math.min(q.answer_index, q.options.length - 1), explain: q.explanation }));
        emit({ id: newId(), kind: "quiz", title, questions: qs, answers: qs.map(() => null), xpEarned: 0 });
        return `Quiz shown with ${qs.length} questions.`;
      },
    }),
    tool({
      name: "update_goal",
      description: "Create a new goal (omit goal_id) or update an existing one's progress, target date or milestones.",
      schema: z.object({
        goal_id: z.string().optional(),
        title: z.string().max(160).optional(),
        why: z.string().max(600).optional(),
        category: z.enum(["career", "study", "health", "money", "social", "family", "skills", "life"]).optional(),
        target_date: date.optional(),
        progress: z.number().int().min(0).max(100).optional(),
        milestones: z.array(z.string().max(160)).max(12).optional().describe("New milestones to add"),
        status: z.enum(["active", "done", "paused"]).optional(),
      }),
      run: async (i) => {
        const res = await mutate(uid, (d) => {
          let g = i.goal_id ? d.goals.find((x) => x.id === i.goal_id) : undefined;
          if (i.goal_id && !g) return null;
          if (!g) {
            if (!i.title) return null;
            g = { id: newId(), createdAt: now(), title: i.title, why: "", category: "life", targetDate: null, progress: 0, status: "active", milestones: [] };
            d.goals.push(g);
          }
          if (i.title) g.title = i.title;
          if (i.why !== undefined) g.why = i.why;
          if (i.category) g.category = i.category;
          if (i.target_date) g.targetDate = i.target_date;
          if (i.progress !== undefined) g.progress = i.progress;
          if (i.status) g.status = i.status;
          for (const m of i.milestones ?? []) g.milestones.push({ id: newId(), title: m, done: false });
          return { id: g.id, title: g.title };
        });
        if (!res) return "Need a title for a new goal, or a valid goal_id.";
        emit({ id: newId(), kind: "goal", goalId: res.id, title: res.title });
        return `Goal saved (id ${res.id}).`;
      },
    }),
    tool({
      name: "update_person",
      description: "Add someone in the user's life, or update what you know about them (closeness, last contact, notes).",
      schema: z.object({
        person_id: z.string().optional(),
        name: z.string().max(80),
        relation: z.string().max(80).optional(),
        closeness: z.number().int().min(1).max(5).optional(),
        last_contact: date.optional(),
        note: z.string().max(500).optional().describe("Appended to their notes"),
      }),
      run: async (i) => {
        await mutate(uid, (d) => {
          let p = (i.person_id && d.people.find((x) => x.id === i.person_id)) || d.people.find((x) => x.name.toLowerCase() === i.name.toLowerCase());
          if (!p) {
            p = { id: newId(), createdAt: now(), name: i.name, relation: "", closeness: 3, lastContact: null, birthday: null, notes: "" };
            d.people.push(p);
          }
          if (i.relation) p.relation = i.relation;
          if (i.closeness) p.closeness = i.closeness;
          if (i.last_contact) p.lastContact = i.last_contact;
          if (i.note) p.notes = [p.notes, i.note].filter(Boolean).join(" ").slice(-1500);
        });
        return "Saved.";
      },
    }),
    tool({
      name: "draft_message",
      description: "Write something the user can copy and send or post: a text, call opener, social post caption, email.",
      schema: z.object({ to: z.string().max(80), channel: z.string().max(40).describe("whatsapp, call, instagram post, linkedin, email…"), text: z.string().max(2000) }),
      run: async (i) => {
        emit({ id: newId(), kind: "draft", to: i.to, channel: i.channel, text: i.text });
        return "Shown to the user with a copy button.";
      },
    }),
    tool({
      name: "weigh_decision",
      description: "Show a side-by-side card of options with pros and cons for a decision the user is facing.",
      schema: z.object({
        question: z.string().max(200),
        options: z.array(z.object({ label: z.string().max(80), pros: z.array(z.string().max(160)).max(5), cons: z.array(z.string().max(160)).max(5) })).min(2).max(4),
        leaning: z.string().max(300).describe("Which way you lean and the one-line reason"),
      }),
      run: async (i) => {
        emit({ id: newId(), kind: "decision", question: i.question, options: i.options, leaning: i.leaning });
        return "Shown to the user.";
      },
    }),
  ];
}

function declaration(t: { name: string; description: string; schema: z.ZodType }) {
  const { $schema: _ignored, ...parametersJsonSchema } = z.toJSONSchema(t.schema) as Record<string, unknown>;
  void _ignored;
  return { name: t.name, description: t.description, parametersJsonSchema };
}

const RETRYABLE = new Set([429, 500, 502, 503, 504]);
const FIRST_BYTE_MS = 8_000;

export async function* chat(uid: string, userText: string, activity: string[] = []): AsyncGenerator<ChatEvent> {
  const db = await readDb(uid);
  const artifacts: Artifact[] = [];
  const queued: Artifact[] = [];
  const tools = buildTools(uid, db.timezone, (a) => {
    artifacts.push(a);
    queued.push(a);
  });
  const byName = new Map(tools.map((t) => [t.name, t]));

  const contents: Content[] = [
    ...db.messages.slice(-24).map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.role === "assistant" ? `${m.mood ? `[mood:${m.mood}] ` : ""}${m.text || "(showed a card)"}` : m.text }],
    })),
    { role: "user", parts: [{ text: `${context(db, activity)}\n\n${userText}` }] },
  ];
  const config = {
    systemInstruction: systemPrompt(db),
    tools: [{ functionDeclarations: tools.map(declaration) }],
    maxOutputTokens: 8192,
  };

  const parser = new MoodParser();
  let text = "";
  let mood: Mood | null = null;
  const handle = (evs: ChatEvent[]) => {
    for (const ev of evs) {
      if (ev.type === "text") text += ev.text;
      if (ev.type === "mood") mood ??= ev.mood;
    }
    return evs;
  };

  const models = availableModels(MODELS);
  let modelIdx = 0;
  try {
    for (let round = 0; round < 6; round++) {
      const parts: Part[] = [];
      let produced = false;
      let finish: string | undefined;
      const started = Date.now();
      // While a fallback is left, don't wait forever for a model that's slow to start.
      const hasNext = modelIdx < models.length - 1;
      const abort = new AbortController();
      const firstByte = hasNext ? setTimeout(() => abort.abort(), FIRST_BYTE_MS) : undefined;
      try {
        const stream = await getClient().models.generateContentStream({
          model: models[modelIdx],
          contents,
          config: { ...config, thinkingConfig: thinkingFor(models[modelIdx]), abortSignal: abort.signal },
        });
        for await (const chunk of stream) {
          clearTimeout(firstByte);
          const cand = chunk.candidates?.[0];
          finish = cand?.finishReason ?? finish;
          for (const part of cand?.content?.parts ?? []) {
            parts.push(part);
            if (part.text && !part.thought) {
              produced = true;
              for (const ev of handle(parser.push(part.text))) yield ev;
            }
            if (part.functionCall) produced = true;
          }
        }
      } catch (err) {
        // Busy or out of quota before anything was said: try the next model.
        if (process.env.MOCHI_DEBUG) console.info(`[chat] ${models[modelIdx]} failed after ${Date.now() - started}ms:`, err instanceof ApiError ? err.status : abort.signal.aborted ? "slow to start" : err);
        clearTimeout(firstByte);
        const timedOut = abort.signal.aborted;
        if ((timedOut || (err instanceof ApiError && RETRYABLE.has(err.status))) && !produced && hasNext) {
          coolDown(models[modelIdx], coolDownFor(err instanceof ApiError ? err.status : undefined));
          modelIdx++;
          round--;
          continue;
        }
        throw err;
      }

      if (process.env.MOCHI_DEBUG) console.info(`[chat] ${models[modelIdx]} round ${round}: ${Date.now() - started}ms, finish=${finish}, calls=${parts.filter((p) => p.functionCall).map((p) => p.functionCall?.name).join(",") || "-"}`);
      if (finish && /SAFETY|PROHIBITED|BLOCKLIST|SPII/.test(finish) && !text) {
        yield { type: "error", error: "I can't help with that one, but I'm here for anything else." };
        return;
      }

      const calls = parts.filter((p) => p.functionCall).map((p) => p.functionCall as FunctionCall);
      if (!calls.length) break;
      contents.push({ role: "model", parts });
      const responses: Part[] = [];
      for (const call of calls) {
        const t = byName.get(call.name ?? "");
        let result: string;
        if (!t) result = `Unknown tool ${call.name}.`;
        else {
          const parsed = t.schema.safeParse(call.args ?? {});
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          result = parsed.success ? await t.run(parsed.data as any) : `Invalid input: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`;
        }
        responses.push({ functionResponse: { id: call.id, name: call.name, response: { result } } });
      }
      contents.push({ role: "user", parts: responses });
      while (queued.length) yield { type: "artifact", artifact: queued.shift()! };
      if (text && !/\s$/.test(text)) for (const ev of handle([{ type: "text", text: " " }])) yield ev;
    }
  } catch (err) {
    console.error("[chat]", err);
    yield { type: "error", error: describeError(err) };
    return;
  }
  for (const ev of handle(parser.flush())) yield ev;
  while (queued.length) yield { type: "artifact", artifact: queued.shift()! };

  const at = now();
  const assistant: ChatMessage = { id: newId(), role: "assistant", text: text.trim(), mood, artifacts, at };
  await mutate(uid, (d) => {
    d.messages.push({ id: newId(), role: "user", text: userText, mood: null, artifacts: [], at }, assistant);
    if (d.messages.length > 400) d.messages.splice(0, d.messages.length - 400);
  });
  yield { type: "done", message: assistant };
}

export function describeError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 400 || err.status === 401 || err.status === 403) return "Something's off with my brain right now. Try again in a little while?";
    if (err.status === 429) return "I've hit my thinking limit for now (API quota). Try again in a minute?";
    if (err.status >= 500) return "My brain is a bit overloaded right now. Try again in a moment?";
    return `I couldn't think properly just now (error ${err.status}). Try again?`;
  }
  return "Something went wrong in my head. Try again?";
}
