"use client";

import { trackApi } from "@/lib/activity";

/** Session expired or signed out in another tab: go sign in again, then come back here. */
export function toSignIn() {
  const here = window.location.pathname + window.location.search;
  // A full page load on purpose: it drops all in-memory state from the old session.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.href = `/signin${here === "/home" ? "" : `?next=${encodeURIComponent(here)}`}`;
}

/**
 * Calls the app's API. Successful changes are also logged as a step the
 * companion notices (pass `label` when the body doesn't say what it was, e.g. a task's title).
 */
export async function api<T = { ok: boolean }>(url: string, method: string, body?: unknown, label?: string): Promise<T> {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (res.status === 401) toSignIn();
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
  if (method !== "GET") trackApi(url, method, body, label);
  return data;
}
