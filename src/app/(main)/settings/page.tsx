import { SettingsForm } from "@/components/settings-form";
import { pageDb } from "@/lib/page-data";

export default async function SettingsPage() {
  const db = await pageDb();
  return <SettingsForm companion={db.companion} />;
}
