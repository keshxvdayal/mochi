import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSessionToken, verifySessionToken } from "@/lib/auth";
import { SESSION_COOKIE, SESSION_DAYS } from "@/lib/auth-constants";

/** The signed-in user's id, or null. Works in Server Components, Server Actions and Route Handlers. */
export async function currentUserId(): Promise<string | null> {
  return verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
}

/** For pages: the signed-in user's id, or a redirect to sign in. */
export async function requireUserId(): Promise<string> {
  const id = await currentUserId();
  if (!id) redirect("/signin");
  return id;
}

/**
 * For API routes: runs `fn` with the signed-in user's id, or answers 401.
 * Every read and write in the handler goes through this id, so nobody can touch anyone else's data.
 */
export async function withUser(fn: (userId: string) => Promise<Response>): Promise<Response> {
  const id = await currentUserId();
  if (!id) return Response.json({ error: "Please sign in again." }, { status: 401 });
  return fn(id);
}

export async function startSession(userId: string) {
  (await cookies()).set(SESSION_COOKIE, await createSessionToken(userId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86_400,
  });
}

export async function endSession() {
  (await cookies()).delete(SESSION_COOKIE);
}
