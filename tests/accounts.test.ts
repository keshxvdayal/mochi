import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { after, test } from "node:test";
import { ago, helplineFor } from "@/lib/ai";
import { createSessionToken, createUser, findUserByEmail, hashPassword, underLimit, verifyPassword, verifySessionToken } from "@/lib/auth";
import { mutate, readDb, safeTz, today } from "@/lib/store";

after(() => rm(process.env.MOCHI_DATA_DIR!, { recursive: true, force: true }));

const email = (tag: string) => `${tag}-${Math.random().toString(36).slice(2)}@example.com`;

test("passwords are salted and verified", async () => {
  const a = await hashPassword("correct horse");
  const b = await hashPassword("correct horse");
  assert.notEqual(a, b, "same password, different salt");
  assert.ok(await verifyPassword("correct horse", a));
  assert.ok(!(await verifyPassword("wrong horse", a)));
});

test("sign-up creates a separate account; the same email can't sign up twice", async () => {
  const e = email("asha");
  const u = await createUser({ name: "Asha Rao", email: e.toUpperCase(), password: "secret123", timezone: "Asia/Kolkata" });
  assert.ok(u);
  assert.equal((await findUserByEmail(e))?.id, u.id, "emails are case-insensitive");
  assert.equal(await createUser({ name: "Again", email: e, password: "secret123" }), null);
  const db = await readDb(u.id);
  assert.equal(db.profile.name, "Asha Rao");
  assert.equal(db.timezone, "Asia/Kolkata");
  assert.equal(db.onboarded, false, "new people start at onboarding");
});

test("each account only sees its own data", async () => {
  const a = (await createUser({ name: "A", email: email("a"), password: "secret123" }))!;
  const b = (await createUser({ name: "B", email: email("b"), password: "secret123" }))!;
  await mutate(a.id, (db) => void db.memories.push({ id: "m1", text: "A's secret", category: "other", createdAt: new Date().toISOString() }));
  assert.equal((await readDb(a.id)).memories.length, 1);
  assert.equal((await readDb(b.id)).memories.length, 0);
  assert.equal((await readDb("someone-who-does-not-exist")).profile.name, "");
});

test("parallel writes to one account don't lose each other", async () => {
  const u = (await createUser({ name: "C", email: email("c"), password: "secret123" }))!;
  await Promise.all(Array.from({ length: 8 }, () => mutate(u.id, (db) => void (db.xp += 5))));
  assert.equal((await readDb(u.id)).xp, 40);
});

test("session tokens can't be forged or reused after expiry", async () => {
  const token = await createSessionToken("user123");
  assert.equal(await verifySessionToken(token), "user123");
  const [payload, mac] = token.split(".");
  const forged = Buffer.from(JSON.stringify({ uid: "someone-else", exp: Date.now() + 1e9 })).toString("base64url");
  assert.equal(await verifySessionToken(`${forged}.${mac}`), null, "changed user id");
  assert.equal(await verifySessionToken(`${payload}.${mac.slice(0, -2)}xx`), null, "changed signature");
  assert.equal(await verifySessionToken(await createSessionToken("user123", -1)), null, "expired");
  assert.equal(await verifySessionToken(undefined), null);
  assert.equal(await verifySessionToken("garbage"), null);
});

test("sign-in attempts are rate limited", async () => {
  const key = `test:${Math.random()}`;
  for (let i = 0; i < 3; i++) assert.ok(await underLimit(key, 3, 60));
  assert.ok(!(await underLimit(key, 3, 60)));
});

test("dates follow the user's timezone, not the server's", () => {
  assert.equal(safeTz("Not/AZone"), "UTC");
  assert.equal(safeTz(undefined), "UTC");
  assert.match(today("Pacific/Kiritimati"), /^\d{4}-\d{2}-\d{2}$/);
  // UTC+14 and UTC-11 are never on the same calendar day.
  assert.notEqual(today("Pacific/Kiritimati"), today("Pacific/Pago_Pago"));
});

test("crisis lines match where the user is", () => {
  assert.match(helplineFor("Asia/Kolkata"), /14416/);
  assert.match(helplineFor("America/New_York"), /988/);
  assert.match(helplineFor("Europe/London"), /116 123/);
  assert.match(helplineFor("Asia/Tokyo"), /findahelpline/);
});

test("time apart reads naturally", () => {
  const now = Date.parse("2026-11-05T12:00:00Z");
  assert.equal(ago("2026-11-05T11:59:30Z", now), "just now");
  assert.equal(ago("2026-11-05T09:00:00Z", now), "3 hours ago");
  assert.equal(ago("2026-11-04T10:00:00Z", now), "yesterday");
  assert.equal(ago("2026-11-01T12:00:00Z", now), "4 days ago");
});
