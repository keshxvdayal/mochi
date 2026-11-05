import { createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { SESSION_DAYS } from "@/lib/auth-constants";
import { kv } from "@/lib/kv";
import { emptyDb, mutate, newId, now, safeTz } from "@/lib/store";

/**
 * Email + password accounts with stateless, signed session cookies.
 *  - Passwords: scrypt with a per-user random salt.
 *  - Sessions: `<payload>.<HMAC-SHA256>`; the secret is AUTH_SECRET, or one
 *    generated once and kept in the database, so a deploy works without extra setup.
 */

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export type User = { id: string; email: string; name: string; passwordHash: string; createdAt: string };

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

/* ------------------------------- passwords ------------------------------ */

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, salt, hash] = stored.split("$");
  if (algo !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const actual = await scrypt(password, Buffer.from(salt, "base64"), expected.length);
  return timingSafeEqual(actual, expected);
}

/* -------------------------------- secret -------------------------------- */

let secret: string | null = process.env.AUTH_SECRET || null;
async function getSecret(): Promise<string> {
  if (secret) return secret;
  const store = kv();
  await store.setIfAbsent("auth:secret", randomBytes(32).toString("base64"));
  secret = await store.get("auth:secret");
  if (!secret) throw new Error("Could not load the session secret.");
  return secret;
}

/* ------------------------------- sessions ------------------------------- */

const sign = (data: string, key: string) => createHmac("sha256", key).update(data).digest("base64url");

export async function createSessionToken(userId: string, days = SESSION_DAYS): Promise<string> {
  const payload = Buffer.from(JSON.stringify({ uid: userId, exp: Date.now() + days * 86_400_000 })).toString("base64url");
  return `${payload}.${sign(payload, await getSecret())}`;
}

/** The user id inside a valid, unexpired token, or null. */
export async function verifySessionToken(token: string | undefined | null): Promise<string | null> {
  if (!token) return null;
  const [payload, mac] = token.split(".");
  if (!payload || !mac) return null;
  let key: string;
  try {
    key = await getSecret();
  } catch (err) {
    // Database unreachable: treat as signed out rather than crashing the page.
    console.error("[auth] session check failed:", err instanceof Error ? err.message : err);
    return null;
  }
  const expected = Buffer.from(sign(payload, key));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const { uid, exp } = JSON.parse(Buffer.from(payload, "base64url").toString()) as { uid?: string; exp?: number };
    return typeof uid === "string" && typeof exp === "number" && exp > Date.now() ? uid : null;
  } catch {
    return null;
  }
}

/* -------------------------------- users --------------------------------- */

export async function findUserByEmail(email: string): Promise<User | null> {
  const id = await kv().get(`email:${normalizeEmail(email)}`);
  return id ? getUser(id) : null;
}

export async function getUser(id: string): Promise<User | null> {
  return (await kv().getDoc<User>(`user:${id}`)).value;
}

/** Creates the account and an empty companion for it. Returns null if the email is taken. */
export async function createUser(input: { name: string; email: string; password: string; timezone?: string }): Promise<User | null> {
  const email = normalizeEmail(input.email);
  const id = newId() + newId();
  if (!(await kv().setIfAbsent(`email:${email}`, id))) return null;
  const user: User = { id, email, name: input.name.trim(), passwordHash: await hashPassword(input.password), createdAt: now() };
  await kv().putDoc(`user:${id}`, user, 0);
  const tz = safeTz(input.timezone);
  await mutate(id, (db) => {
    Object.assign(db, emptyDb(), { timezone: tz });
    db.profile.name = user.name;
  });
  return user;
}

/** Counts attempts per key in a fixed time window; true while still under the limit. */
export async function underLimit(key: string, max: number, windowSec: number): Promise<boolean> {
  return (await kv().incr(`rl:${key}`, windowSec)) <= max;
}
