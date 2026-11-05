# Mochi: a 3D companion for everyone

A cute 3D companion that lives on your screen, gets to know your life, and helps with it. It works for students, working people, business owners, job seekers, parents, homemakers and retirees. It talks out loud with a natural, mood-matched voice and lip-sync, and shows how it feels.

## Run it

```bash
cp .env.example .env.local    # add GEMINI_API_KEY
npm install
npm run dev                   # http://localhost:3000
```

Everyone signs up with an email and password and gets their own companion. The first visit walks you through designing it (name, colour, eyes, accessory) and telling it about yourself: life stage, what you do, what you want help with, your dreams, your routine, and the language it should talk in. Each account's data is private to it; locally it lives in `data/`, apart from what is sent to Gemini for each reply.

## Deploy on Vercel

1. Import the repo into Vercel and add `GEMINI_API_KEY` under Settings → Environment Variables.
2. Storage → Create Database → **Neon (Postgres)** → connect it to the project (Production). This adds `DATABASE_URL`; Mochi creates its table on first use. Upstash Redis works too (`KV_REST_API_URL` / `KV_REST_API_TOKEN`).
3. Redeploy. Visitors land on the sign-in page and each gets their own account.

Optional: set `AUTH_SECRET` (any long random string) to sign session cookies; otherwise one is generated and kept in the database. `MOCHI_CHAT_LIMIT_PER_HOUR` (default 60) caps messages per person so one account can't use up your Gemini quota.

## What's in it

| Page | |
|---|---|
| **Home** | The companion (tap it!), a speech bubble, a daily mood check-in, a **Today** panel with habit check-offs and tasks due, quick-action tiles tuned to your life stage and focus areas, and the chat |
| **Tasks** | Daily habits with streaks and 7-day history, tasks with steps/due dates/XP, and competitive challenges |
| **Goals** | Goals with milestones and progress; "make a plan" hands it to your companion |
| **About me** | Life stage, focus areas, language, profile; the people in your life; everything your companion remembers |
| **Insights** | Level, streak, 7-day chart with moods, habit consistency, what you're doing right / what needs attention, honest review |
| **Settings** | Name, colour, eyes, accessory, coaching style, natural vs instant voice, voice choice, live mood preview |

In the chat, replies can include cards: quiz games, day plans (timeline), new tasks/challenges/habits, goals, message drafts with a copy button, pros/cons decisions, and "I'll remember…" notes.

## How it works

- **The character** (`src/components/companion/mochi-model.tsx`) is built in code with three.js / React Three Fiber; no downloaded model. Detailed textured eyes with lashes, a plush fur rim, two-part ears with floppy tips, a sprout flower that blooms when happy and wilts when sad, paw pads and toe beans, anime blush lines, six accessories, and a cushion stage. Twelve moods each set a pose (smile, eye shape, brows, blush, ears, arms, bloom, tilt, bounce) that the face eases into every frame, plus mood effects (hearts, tears, anger mark, sparkles, Z's, thought dots). It blinks, follows your cursor, breathes, and does idle things on its own (looks around, twitches ears, hops, stretches, spins).
- **Voice**: the natural voice is Gemini text-to-speech with a style cue from the current mood (`src/lib/tts.ts`). The browser plays it through Web Audio and drives the mouth from the real loudness of the audio. The first sentence is sent as soon as it is written; the rest in larger chunks. If the natural voice is unavailable (quota, network) it falls back to the browser's voice for that part. "Instant voice" uses the browser voice only, with mouth movement from word boundaries.
- **The brain** (`src/lib/ai.ts`): Gemini with tools (`remember`, `add_task`, `complete_task`, `add_habit`, `check_habit`, `plan_day`, `create_quiz`, `update_goal`, `update_person`, `draft_message`, `weigh_decision`). Tool inputs are validated with zod before they run. Each turn gets your profile, life stage, focus areas, habits, goals, open tasks, people, recent check-ins, week stats, dated memories, and how long you've known each other and since you last talked. The prompt asks it to talk like a friend rather than an assistant: mirror your length and energy, use what it knows without reciting it, follow up on things you mentioned, and skip stock phrases. Replies start with a `[mood:…]` tag that drives the face.
- **Reliability**: models are tried in order (3.5 Flash → 3.8 Flash → Flash latest → 2.5 Flash). A model that is overloaded, out of quota, or slow to start (8s) is skipped and cooled down (2 min, or 10 min for quota errors), so the next message goes straight to one that works.

## Tests

```bash
npm test     # accounts, data isolation, session tampering, concurrent writes, timezones, mood-tag stream parser, levels, streaks, habit streaks, weekly stats, friend reminders, speech splitting, profile migration, personalised quick actions
TEST_DATABASE_URL=postgres://… npm test   # also runs the Postgres storage tests
npm run lint
```

## Notes

- Free Gemini keys have small per-minute and per-day quotas, and the natural voice uses a request per spoken chunk. If replies get slow or the voice switches to the browser voice, you've hit a limit; it recovers on its own.
- **Accounts** (`src/lib/auth.ts`, `src/lib/session.ts`, `src/proxy.ts`): scrypt-hashed passwords, a signed httpOnly session cookie (30 days), sign-in attempts limited to 10 per 15 minutes per email. Every page and API route reads and writes only the signed-in person's data.
- **Storage** (`src/lib/kv.ts`): Postgres (Neon) or Upstash Redis in production, JSON files in `data/` locally. Each account is one document written with compare-and-set, so parallel requests never overwrite each other.
- **Timezones**: "today", greetings, streaks and the companion's sense of time follow each person's own timezone (from their browser), not the server's.
- It isn't a therapist. If you mention being in danger, it points you to people who can help, using a crisis line for where you are (e.g. India: Tele-MANAS 14416, US/Canada: 988, UK: Samaritans 116 123).
