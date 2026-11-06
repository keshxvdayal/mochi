import { redirect } from "next/navigation";
import { Shell } from "@/components/shell";
import { levelFor, streak } from "@/lib/progress";
import { pageDb } from "@/lib/page-data";
import { today } from "@/lib/store";

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const db = await pageDb();
  if (!db.onboarded) redirect("/welcome");
  const lv = levelFor(db.xp);
  const c = db.companion;
  const buddy = {
    color: c.color,
    eyeColor: c.eyeColor,
    accessory: c.accessory,
    userName: db.profile.name.split(" ")[0],
    voice: { voiceOn: c.voiceOn, voiceName: c.voiceName, pitch: c.pitch, rate: c.rate, voiceEngine: c.voiceEngine, geminiVoice: c.geminiVoice },
  };
  return (
    <Shell name={c.name} level={lv.level} pct={lv.pct} streak={streak(db.tasks, db.checkins, today(db.timezone))} timezone={db.timezone} buddy={buddy}>
      {children}
    </Shell>
  );
}
