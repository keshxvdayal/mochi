import { redirect } from "next/navigation";
import { Onboarding } from "@/components/onboarding";
import { pageDb } from "@/lib/page-data";

export default async function Welcome() {
  const db = await pageDb();
  if (db.onboarded) redirect("/home");
  return <Onboarding companion={db.companion} profile={db.profile} />;
}
