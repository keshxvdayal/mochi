import { randomBytes, randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { defaultCompanion, emptyProfile, type Db, type Profile } from "@/lib/types";

/**
 * Personal, single-user store: ./data/db.json. Writes are serialized, so
 * concurrent requests can't clobber each other. Everything stays on this machine.
 */
const DATA_DIR = process.env.MOCHI_DATA_DIR ?? path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "db.json");

export const emptyDb = (): Db => ({
  version: 1,
  onboarded: false,
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

let queue: Promise<unknown> = Promise.resolve();

export async function readDb(): Promise<Db> {
  try {
    const db = JSON.parse(await fs.readFile(DB_FILE, "utf8")) as Db;
    const base = emptyDb();
    return { ...base, ...db, profile: migrateProfile({ ...base.profile, ...db.profile }), companion: { ...base.companion, ...db.companion } };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return emptyDb();
    throw err;
  }
}

async function writeDb(db: Db) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = `${DB_FILE}.${randomBytes(4).toString("hex")}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(db, null, 1));
  await fs.rename(tmp, DB_FILE);
}

export function mutate<T>(fn: (db: Db) => T | Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const db = await readDb();
    const result = await fn(db);
    await writeDb(db);
    return result;
  });
  queue = run.catch(() => {});
  return run;
}

export const newId = () => randomUUID().replaceAll("-", "").slice(0, 10);
export const now = () => new Date().toISOString();
export const today = () => new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD in local time
