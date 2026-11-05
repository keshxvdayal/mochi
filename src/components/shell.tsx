"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { Flame, Heart, ListChecks, LogOut, MessageCircleHeart, Settings2, Sparkles, Target, UserRound } from "lucide-react";
import { signOut } from "@/app/(auth)/actions";
import { Progress } from "@/components/ui";
import { api } from "@/lib/client-api";

const NAV = [
  { href: "/", label: "Home", icon: MessageCircleHeart },
  { href: "/tasks", label: "Tasks", icon: ListChecks },
  { href: "/goals", label: "Goals", icon: Target },
  { href: "/me", label: "About me", icon: UserRound },
  { href: "/insights", label: "Insights", icon: Sparkles },
  { href: "/settings", label: "Settings", icon: Settings2 },
];

export function Shell({ name, level, pct, streak, timezone, children }: { name: string; level: number; pct: number; streak: number; timezone: string; children: React.ReactNode }) {
  const path = usePathname();
  // Keep "today" right when someone travels: the browser knows their current timezone.
  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && tz !== timezone) api("/api/profile", "PUT", { timezone: tz }).catch(() => {});
  }, [timezone]);
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  return (
    <div className="min-h-screen pb-24 md:pb-0">
      <header className="sticky top-0 z-30 px-3 pt-3 sm:px-6">
        <div className="glass mx-auto flex max-w-7xl items-center gap-3 rounded-3xl px-4 py-2.5">
          <Link href="/" className="flex items-center gap-2 pr-2">
            <span className="candy grid h-9 w-9 place-items-center rounded-2xl text-white shadow">
              <Heart className="h-4 w-4 fill-white" />
            </span>
            <span className="text-lg font-extrabold tracking-tight">{name}</span>
          </Link>
          <nav className="hidden flex-1 items-center gap-1 md:flex">
            {NAV.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-1.5 rounded-2xl px-3 py-2 text-sm font-bold transition ${active(href) ? "bg-grape text-white shadow-[0_6px_16px_-8px_rgba(122,92,240,0.9)]" : "text-muted hover:bg-grape-soft hover:text-grape"}`}
              >
                <Icon className="h-4 w-4" /> {label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <span className="flex items-center gap-1 rounded-2xl bg-orange-50 px-2.5 py-1.5 text-sm font-extrabold text-orange-500" title="Day streak">
              <Flame className="h-4 w-4 fill-orange-400" /> {streak}
            </span>
            <div className="hidden w-32 sm:block" title={`Level ${level}`}>
              <div className="mb-1 flex justify-between text-[11px] font-extrabold text-muted">
                <span>LV {level}</span>
                <span>{pct}%</span>
              </div>
              <Progress value={pct} className="h-2" />
            </div>
            <form action={signOut}>
              <button type="submit" title="Sign out" aria-label="Sign out" className="grid h-9 w-9 place-items-center rounded-2xl text-muted transition hover:bg-grape-soft hover:text-grape">
                <LogOut className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-3 py-5 sm:px-6">{children}</main>

      <nav className="glass fixed inset-x-3 bottom-3 z-30 flex justify-around rounded-3xl px-2 py-2 md:hidden">
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className={`flex flex-col items-center gap-0.5 rounded-2xl px-2 py-1 text-[10px] font-bold ${active(href) ? "text-grape" : "text-muted"}`}>
            <Icon className="h-5 w-5" /> {label.split(" ")[0]}
          </Link>
        ))}
      </nav>
    </div>
  );
}
