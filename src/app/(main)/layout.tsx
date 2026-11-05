import { redirect } from "next/navigation";
import { Shell } from "@/components/shell";
import { levelFor, streak } from "@/lib/progress";
import { pageDb } from "@/lib/page-data";
import { today } from "@/lib/store";

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const db = await pageDb();
  if (!db.onboarded) redirect("/welcome");
  const lv = levelFor(db.xp);
  return (
    <Shell name={db.companion.name} level={lv.level} pct={lv.pct} streak={streak(db.tasks, db.checkins, today())}>
      {children}
    </Shell>
  );
}
