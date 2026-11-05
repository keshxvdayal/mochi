import { z } from "zod";

export const MOODS = ["neutral", "happy", "excited", "love", "proud", "sad", "worried", "angry", "surprised", "thinking", "sleepy", "playful"] as const;
export type Mood = (typeof MOODS)[number];

export const BODY_COLORS = {
  peach: { body: "#ffc9b0", belly: "#fff1e8", ear: "#ff9fb2", label: "Peach" },
  lilac: { body: "#cdb8ff", belly: "#f3edff", ear: "#ff9fd0", label: "Lilac" },
  mint: { body: "#a8ebd0", belly: "#ecfff6", ear: "#ffb3c7", label: "Mint" },
  sky: { body: "#a9d6ff", belly: "#eef7ff", ear: "#ffb0c8", label: "Sky" },
  butter: { body: "#ffe39a", belly: "#fffaea", ear: "#ffab9e", label: "Butter" },
  rose: { body: "#ffb3cf", belly: "#fff0f6", ear: "#ff7fa8", label: "Rose" },
} as const;
export type BodyColor = keyof typeof BODY_COLORS;

export const LIFE_STAGES = {
  student: { label: "Student", emoji: "🎓", org: "School / college", role: "Course & year" },
  working: { label: "Working", emoji: "💼", org: "Company", role: "Role" },
  business: { label: "Running a business", emoji: "🏪", org: "Business", role: "What it does" },
  "job-seeking": { label: "Looking for work", emoji: "🔎", org: "Last workplace / college", role: "Roles you want" },
  parent: { label: "Parent", emoji: "👨‍👩‍👧", org: "Family", role: "Kids & their ages" },
  homemaker: { label: "Homemaker", emoji: "🏡", org: "Household", role: "What fills your day" },
  retired: { label: "Retired", emoji: "🌅", org: "Former work", role: "What you did" },
  other: { label: "Something else", emoji: "✨", org: "Where you spend your days", role: "What you do there" },
} as const;
export type LifeStage = keyof typeof LIFE_STAGES;

export const FOCUS_AREAS = {
  career: { label: "Career & work", emoji: "💼" },
  learning: { label: "Learning & skills", emoji: "📚" },
  health: { label: "Health & fitness", emoji: "💪" },
  mind: { label: "Mental wellbeing", emoji: "🧘" },
  relationships: { label: "Friends & love", emoji: "💞" },
  family: { label: "Family", emoji: "🏠" },
  money: { label: "Money", emoji: "💰" },
  productivity: { label: "Habits & productivity", emoji: "⏰" },
  creativity: { label: "Creativity", emoji: "🎨" },
  confidence: { label: "Confidence", emoji: "🦁" },
  social: { label: "Social media", emoji: "📱" },
  purpose: { label: "Purpose & spirituality", emoji: "🌱" },
} as const;
export type FocusArea = keyof typeof FOCUS_AREAS;

export const LANGUAGES = ["English", "Hinglish", "Hindi", "Bengali", "Tamil", "Telugu", "Marathi", "Gujarati", "Kannada", "Malayalam", "Punjabi", "Urdu", "Spanish", "French", "German", "Arabic", "Portuguese", "Japanese"] as const;

export const ProfileSchema = z.object({
  name: z.string().max(60),
  age: z.string().max(10),
  city: z.string().max(80),
  lifeStage: z.enum(Object.keys(LIFE_STAGES) as [LifeStage, ...LifeStage[]]),
  occupation: z.string().max(160).describe("What they do, in their words"),
  organization: z.string().max(160),
  role: z.string().max(160),
  aspirations: z.string().max(600).describe("What they're working toward"),
  dream: z.string().max(800).describe("Who they want to become"),
  strengths: z.string().max(600),
  weaknesses: z.string().max(600),
  interests: z.string().max(600),
  values: z.string().max(600),
  routine: z.string().max(600).describe("Typical day: wake/sleep times, commitments"),
  health: z.string().max(600).describe("Anything about health they want considered"),
  about: z.string().max(1500),
  focusAreas: z.array(z.enum(Object.keys(FOCUS_AREAS) as [FocusArea, ...FocusArea[]])).max(12),
  language: z.string().max(40),
});
export type Profile = z.infer<typeof ProfileSchema>;

export const ACCESSORIES = {
  none: { label: "None", emoji: "🚫" },
  bow: { label: "Bow", emoji: "🎀" },
  scarf: { label: "Scarf", emoji: "🧣" },
  glasses: { label: "Glasses", emoji: "👓" },
  headphones: { label: "Headphones", emoji: "🎧" },
  beanie: { label: "Beanie", emoji: "🧢" },
  crown: { label: "Flower crown", emoji: "🌼" },
} as const;
export type Accessory = keyof typeof ACCESSORIES;

export const EYE_COLORS = { violet: "#7a5cf0", amber: "#e2963b", ocean: "#2f8fe8", emerald: "#22b07d", rose: "#ec5c95", cocoa: "#9a6440" } as const;
export type EyeColor = keyof typeof EYE_COLORS;

export const GEMINI_VOICES = {
  Leda: "Youthful",
  Zephyr: "Bright",
  Puck: "Upbeat",
  Aoede: "Breezy",
  Laomedeia: "Upbeat",
  Achernar: "Soft",
  Sulafat: "Warm",
  Autonoe: "Bright",
  Callirrhoe: "Easy-going",
  Vindemiatrix: "Gentle",
  Fenrir: "Excitable",
  Umbriel: "Easy-going",
} as const;

export const CompanionSchema = z.object({
  name: z.string().min(1).max(30),
  color: z.enum(Object.keys(BODY_COLORS) as [BodyColor, ...BodyColor[]]),
  eyeColor: z.enum(Object.keys(EYE_COLORS) as [EyeColor, ...EyeColor[]]),
  accessory: z.enum(Object.keys(ACCESSORIES) as [Accessory, ...Accessory[]]),
  voiceOn: z.boolean(),
  voiceEngine: z.enum(["natural", "browser"]),
  geminiVoice: z.string().max(40),
  voiceName: z.string().max(120),
  pitch: z.number().min(0.5).max(2),
  rate: z.number().min(0.5).max(1.6),
  style: z.enum(["gentle", "balanced", "tough-love"]),
});
export type CompanionSettings = z.infer<typeof CompanionSchema>;

export const PersonSchema = z.object({
  name: z.string().min(1).max(80),
  relation: z.string().max(80),
  closeness: z.number().int().min(1).max(5),
  lastContact: z.string().max(10).nullable(),
  birthday: z.string().max(10).nullable(),
  notes: z.string().max(1500),
});
export type Person = z.infer<typeof PersonSchema> & { id: string; createdAt: string };

export const GoalSchema = z.object({
  title: z.string().min(1).max(160),
  why: z.string().max(600),
  category: z.string().max(40),
  targetDate: z.string().max(10).nullable(),
  progress: z.number().int().min(0).max(100),
  status: z.enum(["active", "done", "paused"]),
  milestones: z.array(z.object({ id: z.string(), title: z.string().max(160), done: z.boolean() })).max(20),
});
export type Goal = z.infer<typeof GoalSchema> & { id: string; createdAt: string };

export const TaskSchema = z.object({
  title: z.string().min(1).max(200),
  notes: z.string().max(1500),
  due: z.string().max(10).nullable(),
  priority: z.enum(["low", "medium", "high"]),
  category: z.string().max(40),
  goalId: z.string().nullable(),
  kind: z.enum(["task", "challenge"]),
  xp: z.number().int().min(0).max(500),
  steps: z.array(z.object({ text: z.string().max(300), done: z.boolean() })).max(30),
  done: z.boolean(),
});
export type Task = z.infer<typeof TaskSchema> & { id: string; createdAt: string; doneAt: string | null; source: "me" | "companion" };

export type Memory = { id: string; text: string; category: string; createdAt: string };
export type CheckIn = { id: string; date: string; mood: number; energy: number; note: string };

export const HabitSchema = z.object({
  title: z.string().min(1).max(80),
  emoji: z.string().max(8),
  log: z.array(z.string().max(10)).max(2000),
});
export type Habit = z.infer<typeof HabitSchema> & { id: string; createdAt: string };

export type QuizQuestion = { q: string; options: string[]; answer: number; explain: string };
export type Artifact =
  | { id: string; kind: "quiz"; title: string; questions: QuizQuestion[]; answers: (number | null)[]; xpEarned: number }
  | { id: string; kind: "task"; taskId: string; title: string; isChallenge: boolean }
  | { id: string; kind: "draft"; to: string; channel: string; text: string }
  | { id: string; kind: "memory"; text: string }
  | { id: string; kind: "goal"; goalId: string; title: string }
  | { id: string; kind: "decision"; question: string; options: { label: string; pros: string[]; cons: string[] }[]; leaning: string }
  | { id: string; kind: "habit"; habitId: string; title: string; emoji: string }
  | { id: string; kind: "plan"; title: string; blocks: { time: string; title: string; note: string }[] };

export type ChatMessage = { id: string; role: "user" | "assistant"; text: string; mood: Mood | null; artifacts: Artifact[]; at: string };

export type Db = {
  version: 1;
  onboarded: boolean;
  profile: Profile;
  companion: CompanionSettings;
  xp: number;
  people: Person[];
  goals: Goal[];
  tasks: Task[];
  memories: Memory[];
  checkins: CheckIn[];
  habits: Habit[];
  messages: ChatMessage[];
};

export const emptyProfile = (): Profile => ({
  name: "", age: "", city: "", lifeStage: "other", occupation: "", organization: "", role: "", aspirations: "", dream: "",
  strengths: "", weaknesses: "", interests: "", values: "", routine: "", health: "", about: "", focusAreas: [], language: "English",
});

export const defaultCompanion = (): CompanionSettings => ({
  name: "Mochi", color: "peach", eyeColor: "violet", accessory: "none", voiceOn: true, voiceEngine: "natural", geminiVoice: "Leda", voiceName: "", pitch: 1.35, rate: 1.05, style: "balanced",
});
