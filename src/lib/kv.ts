import { randomBytes } from "crypto";
import { promises as fs } from "fs";
import path from "path";

/**
 * A tiny key-value layer with two backends:
 * - Upstash Redis over REST (production, e.g. Vercel → Storage → Upstash), when
 *   KV_REST_API_URL/KV_REST_API_TOKEN or UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN are set.
 * - JSON files under ./data (local development).
 *
 * Values are versioned documents: `getDoc` returns a revision and `putDoc` only
 * writes if nobody else wrote in between (compare-and-set), so parallel
 * serverless requests can't overwrite each other.
 */

/**
 * Finds Upstash REST credentials however Vercel named them: the standard names,
 * a custom prefix chosen when connecting storage (e.g. MOCHI_KV_REST_API_URL),
 * or an Upstash redis:// URL (its password doubles as the REST token).
 */
export function findRestCredentials(env: Record<string, string | undefined> = process.env): { url: string; token: string } | null {
  const pairs: [string, string][] = [
    ["KV_REST_API_URL", "KV_REST_API_TOKEN"],
    ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"],
  ];
  for (const k of Object.keys(env)) {
    for (const suffix of ["KV_REST_API_URL", "UPSTASH_REDIS_REST_URL", "REDIS_REST_URL"]) {
      if (k.endsWith(`_${suffix}`)) pairs.push([k, k.replace(/URL$/, "TOKEN")]);
    }
  }
  for (const [u, t] of pairs) if (env[u] && env[t]) return { url: env[u]!, token: env[t]! };
  for (const k of Object.keys(env)) {
    if (!/(^|_)(REDIS_URL|KV_URL)$/.test(k) || !env[k]) continue;
    try {
      const url = new URL(env[k]!);
      if (url.hostname.endsWith(".upstash.io") && url.password) return { url: `https://${url.hostname}`, token: decodeURIComponent(url.password) };
    } catch {
      /* not a URL */
    }
  }
  return null;
}

const creds = findRestCredentials();
const REST_URL = creds?.url;
const REST_TOKEN = creds?.token;
const DATA_DIR = process.env.MOCHI_DATA_DIR ?? path.join(process.cwd(), "data");

export const usingRedis = () => Boolean(REST_URL && REST_TOKEN);

function assertWritableBackend() {
  if (!usingRedis() && process.env.VERCEL) {
    const seen = Object.keys(process.env).filter((k) => /REDIS|KV_/.test(k));
    throw new Error(
      `No database configured. On Vercel, connect Upstash Redis (Storage tab) so KV_REST_API_URL and KV_REST_API_TOKEN are set, then redeploy.${seen.length ? ` Found only: ${seen.join(", ")} (Mochi needs Upstash's REST URL and token).` : ""}`,
    );
  }
}

export type Doc<T> = { value: T | null; rev: number };

interface Backend {
  getDoc<T>(key: string): Promise<Doc<T>>;
  /** Writes only if the stored revision still equals `rev`. Returns false on conflict. */
  putDoc<T>(key: string, value: T, rev: number): Promise<boolean>;
  /** Sets the key only if it doesn't exist yet. Returns true if it was set. */
  setIfAbsent(key: string, value: string): Promise<boolean>;
  get(key: string): Promise<string | null>;
  del(key: string): Promise<void>;
  /** Increments a counter that expires `ttlSec` after it was first created. */
  incr(key: string, ttlSec: number): Promise<number>;
}

/* ----------------------------- Upstash REST ----------------------------- */

async function redis<T = unknown>(command: (string | number)[]): Promise<T> {
  const res = await fetch(REST_URL!, {
    method: "POST",
    headers: { Authorization: `Bearer ${REST_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as { result?: T; error?: string };
  if (!res.ok || data.error) throw new Error(`Redis ${command[0]} failed: ${data.error ?? res.status}`);
  return data.result as T;
}

// KEYS[1] = value key, KEYS[2] = revision key, ARGV[1] = expected revision, ARGV[2] = new value
const CAS = `local cur = tonumber(redis.call('GET', KEYS[2]) or '0')
if cur ~= tonumber(ARGV[1]) then return 0 end
redis.call('SET', KEYS[1], ARGV[2])
redis.call('INCR', KEYS[2])
return 1`;

// KEYS[1] = counter, ARGV[1] = ttl seconds
const INCR_TTL = `local n = redis.call('INCR', KEYS[1])
if n == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return n`;

const redisBackend: Backend = {
  async getDoc<T>(key: string) {
    const [raw, rev] = await redis<[string | null, string | null]>(["MGET", key, `${key}:rev`]);
    return { value: raw ? (JSON.parse(raw) as T) : null, rev: Number(rev ?? 0) };
  },
  async putDoc(key, value, rev) {
    return (await redis<number>(["EVAL", CAS, 2, key, `${key}:rev`, rev, JSON.stringify(value)])) === 1;
  },
  async setIfAbsent(key, value) {
    return (await redis<string | null>(["SET", key, value, "NX"])) === "OK";
  },
  get: (key) => redis<string | null>(["GET", key]),
  async del(key) {
    await redis(["DEL", key, `${key}:rev`]);
  },
  incr: (key, ttlSec) => redis<number>(["EVAL", INCR_TTL, 1, key, ttlSec]),
};

/* ------------------------------ Local files ----------------------------- */

const fileFor = (key: string) => path.join(DATA_DIR, "kv", `${key.replace(/[^a-zA-Z0-9_.@-]/g, "_")}.json`);
let queue: Promise<unknown> = Promise.resolve();
/** One process, so serializing file access is enough to make CAS safe locally. */
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn);
  queue = run.catch(() => {});
  return run;
}
async function readFile<T>(key: string): Promise<{ value: T; rev: number; exp?: number } | null> {
  try {
    const f = JSON.parse(await fs.readFile(fileFor(key), "utf8")) as { value: T; rev: number; exp?: number };
    if (f.exp && f.exp < Date.now()) return null;
    return f;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}
async function writeFile(key: string, data: unknown) {
  const file = fileFor(key);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${randomBytes(4).toString("hex")}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data));
  await fs.rename(tmp, file);
}

const fileBackend: Backend = {
  async getDoc<T>(key: string) {
    const f = await readFile<T>(key);
    return { value: f?.value ?? null, rev: f?.rev ?? 0 };
  },
  putDoc: (key, value, rev) =>
    serial(async () => {
      if (((await readFile(key))?.rev ?? 0) !== rev) return false;
      await writeFile(key, { value, rev: rev + 1 });
      return true;
    }),
  setIfAbsent: (key, value) =>
    serial(async () => {
      if (await readFile(key)) return false;
      await writeFile(key, { value, rev: 1 });
      return true;
    }),
  async get(key) {
    return (await readFile<string>(key))?.value ?? null;
  },
  del: (key) => serial(() => fs.rm(fileFor(key), { force: true })),
  incr: (key, ttlSec) =>
    serial(async () => {
      const f = await readFile<number>(key);
      const n = (f?.value ?? 0) + 1;
      await writeFile(key, { value: n, rev: 1, exp: f?.exp ?? Date.now() + ttlSec * 1000 });
      return n;
    }),
};

export function kv(): Backend {
  assertWritableBackend();
  return usingRedis() ? redisBackend : fileBackend;
}
