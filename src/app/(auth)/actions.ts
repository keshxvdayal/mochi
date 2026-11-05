"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createUser, findUserByEmail, hashPassword, normalizeEmail, underLimit, verifyPassword } from "@/lib/auth";
import { endSession, startSession } from "@/lib/session";
import { mutate, safeTz } from "@/lib/store";

export type AuthState = { error?: string; fields?: { name?: string; email?: string } } | undefined;

const SignUp = z.object({
  name: z.string().trim().min(1, "What should I call you?").max(60, "That name is a bit long."),
  email: z.email("That email doesn't look right.").max(200),
  password: z.string().min(8, "Use at least 8 characters for your password.").max(200),
});

const SignIn = z.object({
  email: z.email("That email doesn't look right.").max(200),
  password: z.string().min(1, "Enter your password.").max(200),
});

/** Only same-site paths, so `?next=` can't send people to another website. */
function safeNext(next: FormDataEntryValue | null): string {
  const n = typeof next === "string" ? next : "";
  return n.startsWith("/") && !n.startsWith("//") && !n.startsWith("/\\") ? n : "/";
}

// Spend the same time on unknown emails as on wrong passwords, so attackers can't tell which emails have accounts.
const dummyHash = hashPassword("not-a-real-password");

export async function signUp(_prev: AuthState, form: FormData): Promise<AuthState> {
  const raw = { name: form.get("name"), email: form.get("email"), password: form.get("password") };
  const fields = { name: String(raw.name ?? ""), email: String(raw.email ?? "") };
  const parsed = SignUp.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message, fields };
  const user = await createUser({ ...parsed.data, timezone: String(form.get("timezone") ?? "") });
  if (!user) return { error: "There's already an account with that email. Try signing in.", fields };
  await startSession(user.id);
  redirect("/welcome");
}

export async function signIn(_prev: AuthState, form: FormData): Promise<AuthState> {
  const raw = { email: form.get("email"), password: form.get("password") };
  const fields = { email: String(raw.email ?? "") };
  const parsed = SignIn.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message, fields };
  const email = normalizeEmail(parsed.data.email);
  if (!(await underLimit(`signin:${email}`, 10, 15 * 60))) {
    return { error: "Too many tries. Take a breather and try again in 15 minutes.", fields };
  }
  const user = await findUserByEmail(email);
  const ok = user ? await verifyPassword(parsed.data.password, user.passwordHash) : (await verifyPassword(parsed.data.password, await dummyHash), false);
  if (!user || !ok) return { error: "That email and password don't match.", fields };
  const tz = String(form.get("timezone") ?? "");
  if (tz) await mutate(user.id, (db) => void (db.timezone = safeTz(tz)));
  await startSession(user.id);
  redirect(safeNext(form.get("next")));
}

export async function signOut() {
  await endSession();
  redirect("/signin");
}
