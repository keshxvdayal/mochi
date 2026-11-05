import assert from "node:assert/strict";
import { after, test } from "node:test";
import { findPostgresUrl, postgresBackend } from "@/lib/kv";

test("Postgres connection string is found however Neon/Vercel named it", () => {
  assert.equal(findPostgresUrl({ DATABASE_URL: "postgresql://u:p@h/db" }), "postgresql://u:p@h/db");
  assert.equal(findPostgresUrl({ POSTGRES_URL: "postgres://u:p@h/db" }), "postgres://u:p@h/db");
  assert.equal(findPostgresUrl({ STORAGE_DATABASE_URL: "postgres://x/db" }), "postgres://x/db");
  assert.equal(findPostgresUrl({ DATABASE_URL: "mysql://nope" }), null);
  assert.equal(findPostgresUrl({}), null);
});

// Runs against a real database only when one is given: TEST_DATABASE_URL=postgres://… npm test
const url = process.env.TEST_DATABASE_URL;
const db = url ? postgresBackend(url) : null;
after(() => db?.close());

test("Postgres: documents, compare-and-set, unique keys and expiring counters", { skip: !db && "set TEST_DATABASE_URL to run" }, async () => {
  const k = `t:${Math.random()}`;
  assert.deepEqual(await db!.getDoc(k), { value: null, rev: 0 });
  assert.ok(await db!.putDoc(k, { a: 1 }, 0));
  assert.ok(!(await db!.putDoc(k, { a: 2 }, 0)), "create twice");
  assert.deepEqual(await db!.getDoc(k), { value: { a: 1 }, rev: 1 });
  assert.ok(await db!.putDoc(k, { a: 3 }, 1));
  assert.ok(!(await db!.putDoc(k, { a: 4 }, 1)), "stale revision is rejected");
  assert.deepEqual(await db!.getDoc(k), { value: { a: 3 }, rev: 2 });

  assert.ok(await db!.setIfAbsent(`${k}:e`, "id1"));
  assert.ok(!(await db!.setIfAbsent(`${k}:e`, "id2")));
  assert.equal(await db!.get(`${k}:e`), "id1");
  await db!.del(`${k}:e`);
  assert.equal(await db!.get(`${k}:e`), null);

  assert.equal(await db!.incr(`${k}:n`, 1), 1);
  assert.equal(await db!.incr(`${k}:n`, 1), 2);
  await new Promise((r) => setTimeout(r, 1100));
  assert.equal(await db!.incr(`${k}:n`, 1), 1, "counter restarts after its window");
});
