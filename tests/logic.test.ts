import assert from "node:assert/strict";
import { test } from "node:test";
import { MoodParser, type ChatEvent } from "@/lib/ai";
import { levelFor, overdueContacts, streak, weekStats } from "@/lib/progress";
import { speakable, takeSentences } from "@/lib/speech";
import { emptyDb } from "@/lib/store";
import type { Task } from "@/lib/types";

function run(chunks: string[]) {
  const p = new MoodParser();
  const evs: ChatEvent[] = [...chunks.flatMap((c) => p.push(c)), ...p.flush()];
  return {
    text: evs.filter((e) => e.type === "text").map((e) => (e as { text: string }).text).join(""),
    moods: evs.filter((e) => e.type === "mood").map((e) => (e as { mood: string }).mood),
  };
}

test("mood tags are extracted even when split across stream chunks", () => {
  assert.deepEqual(run(["[mood:happy] Hi there!"]), { text: "Hi there!", moods: ["happy"] });
  assert.deepEqual(run(["[mo", "od:ex", "cited] Yay"]), { text: "Yay", moods: ["excited"] });
  assert.deepEqual(run(["Oh no. [mood:sad] That hurts."]), { text: "Oh no. That hurts.", moods: ["sad"] });
});

test("non-tag brackets and unknown moods are left alone or dropped safely", () => {
  assert.deepEqual(run(["Use [this] link"]), { text: "Use [this] link", moods: [] });
  assert.deepEqual(run(["[mood:hungry] ok"]), { text: "ok", moods: [] });
  assert.deepEqual(run(["ends with [mo"]), { text: "ends with [mo", moods: [] });
});

test("levels follow 50·n² XP", () => {
  assert.equal(levelFor(0).level, 1);
  assert.equal(levelFor(49).level, 1);
  assert.equal(levelFor(50).level, 2);
  assert.equal(levelFor(200).level, 3);
  assert.equal(levelFor(125).pct, 50);
});

const task = (over: Partial<Task>): Task => ({ id: Math.random().toString(36), title: "t", notes: "", due: null, priority: "medium", category: "self", goalId: null, kind: "task", xp: 20, steps: [], done: false, createdAt: "2026-11-01T00:00:00Z", doneAt: null, source: "me", ...over });

test("streak counts consecutive active days ending today or yesterday", () => {
  const checkins = ["2026-11-03", "2026-11-04"].map((date) => ({ id: date, date, mood: 3, energy: 3, note: "" }));
  const tasks = [task({ done: true, doneAt: "2026-11-05T10:00:00" })];
  assert.equal(streak(tasks, checkins, "2026-11-05"), 3);
  assert.equal(streak([], checkins, "2026-11-05"), 2, "yesterday still counts");
  assert.equal(streak([], checkins, "2026-11-07"), 0);
});

test("week stats count missed and completed tasks", () => {
  const db = emptyDb();
  db.tasks = [task({ due: "2026-11-03", done: true, doneAt: "2026-11-03T09:00:00" }), task({ due: "2026-11-04", title: "Missed one" }), task({ due: "2026-11-10" })];
  const w = weekStats(db, "2026-11-05");
  assert.equal(w.completed, 1);
  assert.equal(w.missed, 1);
  assert.deepEqual(w.missedTitles, ["Missed one"]);
  assert.equal(w.completionRate, 50);
});

test("close friends not contacted for a while come first", () => {
  const db = emptyDb();
  const p = (name: string, closeness: number, lastContact: string | null) => ({ id: name, name, relation: "", closeness, lastContact, birthday: null, notes: "", createdAt: "" });
  db.people = [p("Acquaintance", 1, "2026-10-01"), p("Bestie", 5, "2026-10-20"), p("Mom", 5, "2026-11-04")];
  assert.deepEqual(overdueContacts(db, "2026-11-05").map((x) => x.name), ["Bestie"]);
});

test("speech text drops markdown, emoji and mood tags; sentences split as they complete", () => {
  assert.equal(speakable("[mood:happy] **Great** job! 🎉\n- step one"), "Great job! step one");
  assert.deepEqual(takeSentences("Hi there! How are you? I was"), { sentences: ["Hi there!", "How are you?"], rest: "I was" });
});
