"use client";

/**
 * What the person is doing in the app, step by step: pages they open and
 * things they do (finishing a task, ticking a habit…). The floating companion
 * reacts to it, and the chat sends the recent steps along so replies know
 * what just happened. Kept for this browser tab only (sessionStorage).
 */

export type ActivityType =
  | "page"
  | "task-added"
  | "task-done"
  | "task-undone"
  | "task-removed"
  | "goal-added"
  | "goal-progress"
  | "goal-done"
  | "goal-removed"
  | "habit-added"
  | "habit-toggled"
  | "habit-removed"
  | "person-added"
  | "person-contacted"
  | "memory-added"
  | "checkin"
  | "look-changed"
  | "profile-updated"
  | "quiz-answered"
  | "idle"
  | "back";

export type Activity = { type: ActivityType; label: string; at: number; path: string };

const KEY = "mochi-activity";
const MAX = 40;
const listeners = new Set<(a: Activity) => void>();

function load(): Activity[] {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) ?? "[]") as Activity[];
  } catch {
    return [];
  }
}

export function track(type: ActivityType, label = "") {
  if (typeof window === "undefined") return;
  const a: Activity = { type, label: label.slice(0, 120), at: Date.now(), path: window.location.pathname };
  const list = load();
  // Don't log the same page twice in a row (refreshes, re-renders).
  const last = list.at(-1);
  if (type === "page" && last?.type === "page" && last.path === a.path) return;
  list.push(a);
  try {
    sessionStorage.setItem(KEY, JSON.stringify(list.slice(-MAX)));
  } catch {
    /* storage full or blocked: reactions still work */
  }
  listeners.forEach((l) => l(a));
}

export function onActivity(fn: (a: Activity) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function recentActivity(n = 12): Activity[] {
  return typeof window === "undefined" ? [] : load().slice(-n);
}

const PAGE_NAMES: Record<string, string> = {
  "/home": "Home (chat)",
  "/tasks": "Tasks & habits",
  "/goals": "Goals",
  "/me": "About me",
  "/insights": "Insights",
  "/settings": "Settings",
};
export const pageName = (path: string) => PAGE_NAMES[path] ?? path;

/** One line per step, for the chat: "3 min ago: finished task “Gym”". */
export function describeActivity(list: Activity[], now = Date.now()): string[] {
  const verb: Record<ActivityType, (l: string) => string> = {
    page: () => "",
    "task-added": (l) => `added a task “${l}”`,
    "task-done": (l) => `finished the task “${l}”`,
    "task-undone": (l) => `un-ticked the task “${l}”`,
    "task-removed": (l) => `deleted a task${l ? ` “${l}”` : ""}`,
    "goal-added": (l) => `added a goal “${l}”`,
    "goal-progress": (l) => `updated progress on the goal “${l}”`,
    "goal-done": (l) => `completed the goal “${l}”`,
    "goal-removed": (l) => `deleted a goal${l ? ` “${l}”` : ""}`,
    "habit-added": (l) => `started a habit “${l}”`,
    "habit-toggled": (l) => `ticked/unticked the habit “${l}”`,
    "habit-removed": (l) => `deleted a habit${l ? ` “${l}”` : ""}`,
    "person-added": (l) => `added ${l} to the people in their life`,
    "person-contacted": (l) => `marked that they talked to ${l}`,
    "memory-added": (l) => `told you to remember “${l}”`,
    checkin: (l) => `checked in feeling ${l}`,
    "look-changed": () => "changed how you look (your colour/accessory)",
    "profile-updated": () => "updated their About me",
    "quiz-answered": (l) => `answered a quiz question (${l})`,
    idle: () => "went quiet for a while",
    back: () => "came back after a break",
  };
  return list.map((a) => {
    const ago = Math.round((now - a.at) / 60_000);
    const when = ago < 1 ? "just now" : `${ago} min ago`;
    return `${when}: ${a.type === "page" ? `opened ${pageName(a.path)}` : verb[a.type](a.label)}`;
  });
}

/** Turns an API call the UI made into a step, so every page is covered from one place. */
export function trackApi(url: string, method: string, body: unknown, label?: string) {
  if (window.location.pathname === "/welcome") return; // onboarding saves as it goes; those aren't steps
  const b = (body ?? {}) as Record<string, unknown>;
  const m = /^\/api\/items\/(tasks|goals|habits|people|memories)(?:\/[^/]+)?$/.exec(url);
  const name = label ?? String(b.title ?? b.name ?? b.text ?? "");
  if (m) {
    const c = m[1];
    const single = { tasks: "task", goals: "goal", habits: "habit", people: "person", memories: "memory" }[c] as "task" | "goal" | "habit" | "person" | "memory";
    if (method === "POST") return track(`${single}-added` as ActivityType, name);
    if (method === "DELETE" && single !== "person" && single !== "memory") return track(`${single}-removed` as ActivityType, name);
    if (method === "PATCH" && c === "tasks" && typeof b.done === "boolean") return track(b.done ? "task-done" : "task-undone", name);
    if (method === "PATCH" && c === "goals") return track(b.status === "done" ? "goal-done" : "goal-progress", name);
    if (method === "PATCH" && c === "people" && b.lastContact) return track("person-contacted", name);
    return;
  }
  if (/^\/api\/habits\//.test(url)) return track("habit-toggled", name);
  if (url === "/api/checkin") return track("checkin", name);
  if (url === "/api/profile" && method === "PUT") {
    if (b.companion) return track("look-changed");
    if (b.profile) return track("profile-updated");
  }
}
