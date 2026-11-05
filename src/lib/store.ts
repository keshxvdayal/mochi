import { randomUUID } from "crypto";
import { kv } from "@/lib/kv";
import { defaultCompanion, emptyProfile, type Db, type Profile } from "@/lib/types";

/**
 * Each account has its own document (`db:<userId>`). Writes are
 * compare-and-set with a few retries, so two requests from the same person
 * (say, ticking a habit while a chat reply is saving) never lose each other's changes.
 */
const key = (userId: string) => `db:${userId}`;

export const emptyDb = (): Db => ({
  version: 1,
  onboarded: false,
  timezone: "UTC",
  createdAt: new Date().toISOString(),
  profile: emptyProfile(),
  companion: defaultCompanion(),
  xp: 0,
  people: [],
  goals: [],
  tasks: [],
  memories: [],
  checkins: [],
  habits: [],
  messages: [],
});

/** Early versions were student-only (college/course/year/careerInterests). */
export function migrateProfile(p: Profile & { college?: string; course?: string; year?: string; careerInterests?: string }): Profile {
  const { college, course, year, careerInterests, ...rest } = p;
  if (college && !rest.organization) rest.organization = college;
  if ((course || year) && !rest.role) rest.role = [course, year].filter(Boolean).join(", ");
  if (careerInterests && !rest.aspirations) rest.aspirations = careerInterests;
  if (college && rest.lifeStage === "other") rest.lifeStage = "student";
  return rest;
}

function normalize(db: Partial<Db> | null): Db {
  const base = emptyDb();
  if (!db) return base;
  return { ...base, ...db, profile: migrateProfile({ ...base.profile, ...db.profile }), companion: { ...base.companion, ...db.companion } };
}

export async function readDb(userId: string): Promise<Db> {
  return normalize((await kv().getDoc<Db>(key(userId))).value);
}

export async function mutate<T>(userId: string, fn: (db: Db) => T | Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const doc = await kv().getDoc<Db>(key(userId));
    const db = normalize(doc.value);
    const result = await fn(db);
    if (await kv().putDoc(key(userId), db, doc.rev)) return result;
    await new Promise((r) => setTimeout(r, 30 + Math.random() * 80 * (attempt + 1)));
  }
  throw new Error("Too many simultaneous changes. Try again.");
}

export const newId = () => randomUUID().replaceAll("-", "").slice(0, 10);
export const now = () => new Date().toISOString();

/** A timezone we can safely pass to Intl, or UTC. */
export function safeTz(tz: string | null | undefined): string {
  if (!tz) return "UTC";
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return tz;
  } catch {
    return "UTC";
  }
}
/** YYYY-MM-DD in the user's timezone (servers run in UTC, people don't). */
export const today = (tz?: string) => new Date().toLocaleDateString("en-CA", { timeZone: safeTz(tz) });
/** 0–23 in the user's timezone. */
export const hourIn = (tz?: string) => Number(new Date().toLocaleString("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone: safeTz(tz) }));
