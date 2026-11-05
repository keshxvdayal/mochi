import { connection } from "next/server";
import { readDb } from "@/lib/store";
import { requireUserId } from "@/lib/session";

/** The signed-in person's data for a page, read at request time. Signed out → /signin. */
export async function pageDb() {
  await connection();
  return readDb(await requireUserId());
}
