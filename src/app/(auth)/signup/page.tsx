import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { signUp } from "@/app/(auth)/actions";
import { AuthForm } from "@/components/auth-form";
import { currentUserId } from "@/lib/session";

export const metadata: Metadata = { title: "Create your account · Mochi" };

export default async function SignUpPage() {
  if (await currentUserId()) redirect("/home");
  return <AuthForm mode="signup" action={signUp} />;
}
