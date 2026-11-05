import { connection } from "next/server";
import { readDb } from "@/lib/store";

/** Read the data for a page at request time (never at build time: it's your live data). */
export async function pageDb() {
  await connection();
  return readDb();
}
