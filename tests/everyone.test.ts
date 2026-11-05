import assert from "node:assert/strict";
import { test } from "node:test";
import { quickActions } from "@/lib/personal";
import { habitStreak, lastDays } from "@/lib/progress";
import { emptyDb, migrateProfile } from "@/lib/store";
import { emptyProfile } from "@/lib/types";

test("habit streak counts back from today, or from yesterday if today isn't done yet", () => {
  const log = ["2026-11-02", "2026-11-03", "2026-11-04"];
  assert.equal(habitStreak(log, "2026-11-04"), 3);
  assert.equal(habitStreak(log, "2026-11-05"), 3, "not done yet today: streak still alive");
  assert.equal(habitStreak(log, "2026-11-06"), 0);
  assert.deepEqual(lastDays("2026-11-05", 3), ["2026-11-03", "2026-11-04", "2026-11-05"]);
});

test("old student-only profiles migrate to the general profile", () => {
  const old = { ...emptyProfile(), college: "IP University", course: "B.Tech", year: "3rd year", careerInterests: "Product" };
  const p = migrateProfile(old);
  assert.equal(p.organization, "IP University");
  assert.equal(p.role, "B.Tech, 3rd year");
  assert.equal(p.aspirations, "Product");
  assert.equal(p.lifeStage, "student");
  assert.ok(!("college" in p));
});

test("quick actions adapt to life stage and focus areas", () => {
  const db = emptyDb();
  db.profile = { ...db.profile, lifeStage: "parent", focusAreas: ["money", "health"] };
  const titles = quickActions(db).map((q) => q.title);
  assert.ok(titles.includes("Fun with kids"));
  assert.ok(titles.includes("Money plan"));
  assert.ok(titles.includes("Plan my day"));
  assert.ok(!titles.includes("Study plan"));
  assert.ok(titles.length <= 8);
  db.profile.lifeStage = "student";
  assert.ok(quickActions(db).some((q) => q.title === "Study plan"));
});
