import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { signIn } from "@/app/(auth)/actions";
import { AuthForm } from "@/components/auth-form";
import { currentUserId } from "@/lib/session";

export const metadata: Metadata = { title: "Sign in · Mochi" };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await currentUserId()) redirect("/home");
  const { next } = await searchParams;
  return <AuthForm mode="signin" action={signIn} next={next} />;
}
