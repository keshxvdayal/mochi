import { AboutMe } from "@/components/about-me";
import { pageDb } from "@/lib/page-data";

export default async function MePage() {
  const db = await pageDb();
  return <AboutMe profile={db.profile} people={db.people} memories={[...db.memories].reverse()} companionName={db.companion.name} />;
}
