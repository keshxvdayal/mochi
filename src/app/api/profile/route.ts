import { withUser } from "@/lib/session";
import { mutate, safeTz } from "@/lib/store";
import { CompanionSchema, ProfileSchema } from "@/lib/types";

export async function PUT(req: Request) {
  return withUser(async (uid) => {
    const body = (await req.json().catch(() => ({}))) as { profile?: unknown; companion?: unknown; onboarded?: boolean; timezone?: string };
    const profile = body.profile === undefined ? null : ProfileSchema.partial().safeParse(body.profile);
    const companion = body.companion === undefined ? null : CompanionSchema.partial().safeParse(body.companion);
    if (profile && !profile.success) return Response.json({ error: "Some profile fields are too long." }, { status: 400 });
    if (companion && !companion.success) return Response.json({ error: "Invalid companion settings." }, { status: 400 });
    await mutate(uid, (db) => {
      if (profile?.success) db.profile = { ...db.profile, ...profile.data };
      if (companion?.success) db.companion = { ...db.companion, ...companion.data };
      if (typeof body.onboarded === "boolean") db.onboarded = body.onboarded;
      if (typeof body.timezone === "string" && body.timezone) db.timezone = safeTz(body.timezone);
    });
    return Response.json({ ok: true });
  });
}
