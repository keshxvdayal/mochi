export const btn = {
  candy: "candy inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-bold text-white shadow-[0_8px_20px_-8px_rgba(122,92,240,0.7)] transition hover:brightness-105 active:scale-[0.97] disabled:opacity-50",
  soft: "inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-4 py-2.5 text-sm font-bold text-ink shadow-sm ring-1 ring-line transition hover:bg-grape-soft active:scale-[0.97] disabled:opacity-50",
  ghost: "inline-flex items-center justify-center gap-1.5 rounded-xl px-2.5 py-1.5 text-sm font-semibold text-muted transition hover:bg-grape-soft hover:text-grape disabled:opacity-50",
};

export const fieldBase =
  "rounded-2xl border-2 border-line bg-white/90 px-4 py-2.5 text-[15px] outline-none transition placeholder:text-muted/60 focus:border-grape/50 focus:ring-4 focus:ring-grape/10";
export const field = `${fieldBase} w-full`;

export function Card({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <div className={`glass rounded-3xl ${className}`}>{children}</div>;
}

export function Title({ emoji, title, subtitle, action }: { emoji: string; title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="flex items-center gap-2 text-3xl font-extrabold tracking-tight">
          <span className="wiggle inline-block">{emoji}</span> {title}
        </h1>
        {subtitle && <p className="mt-1 text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Pill({ children, tone = "grape" }: { children: React.ReactNode; tone?: "grape" | "pink" | "mint" | "amber" | "rose" | "sky" }) {
  const tones = {
    grape: "bg-violet-100 text-violet-700",
    pink: "bg-pink-100 text-pink-700",
    mint: "bg-emerald-100 text-emerald-700",
    amber: "bg-amber-100 text-amber-800",
    rose: "bg-rose-100 text-rose-700",
    sky: "bg-sky-100 text-sky-700",
  };
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${tones[tone]}`}>{children}</span>;
}

export function Progress({ value, className = "" }: { value: number; className?: string }) {
  return (
    <div className={`h-2.5 overflow-hidden rounded-full bg-violet-100 ${className}`}>
      <div className="candy h-full rounded-full transition-all duration-700" style={{ width: `${Math.max(3, Math.min(100, value))}%` }} />
    </div>
  );
}

export function Empty({ emoji, title, children }: { emoji: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-3xl border-2 border-dashed border-violet-200 bg-white/50 px-6 py-10 text-center">
      <div className="text-4xl">{emoji}</div>
      <p className="mt-2 font-bold">{title}</p>
      {children && <div className="mx-auto mt-1 max-w-md text-sm text-muted">{children}</div>}
    </div>
  );
}
