"use client";

/** Session expired or signed out in another tab: go sign in again, then come back here. */
export function toSignIn() {
  const here = window.location.pathname + window.location.search;
  // A full page load on purpose: it drops all in-memory state from the old session.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.href = `/signin${here === "/" ? "" : `?next=${encodeURIComponent(here)}`}`;
}

export async function api<T = { ok: boolean }>(url: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (res.status === 401) toSignIn();
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
  return data;
}
