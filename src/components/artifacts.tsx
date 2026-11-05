"use client";

import Link from "next/link";
import { useState } from "react";
import { Brain, CalendarClock, Check, Copy, Gamepad2, ListChecks, Repeat, Scale, Send, Target, Trophy, X } from "lucide-react";
import { setMood } from "@/lib/companion-state";
import type { Artifact } from "@/lib/types";

export function ArtifactView({ artifact, messageId }: { artifact: Artifact; messageId: string | null }) {
  switch (artifact.kind) {
    case "quiz":
      return <Quiz quiz={artifact} messageId={messageId} />;
    case "task":
      return (
        <Link href="/tasks" className="pop flex items-center gap-3 rounded-2xl bg-white p-3 ring-1 ring-line transition hover:ring-violet-300">
          <span className={`grid h-9 w-9 place-items-center rounded-xl ${artifact.isChallenge ? "bg-amber-100 text-amber-600" : "bg-emerald-100 text-emerald-600"}`}>
            {artifact.isChallenge ? <Trophy className="h-4 w-4" /> : <ListChecks className="h-4 w-4" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] font-extrabold uppercase tracking-wider text-muted">{artifact.isChallenge ? "New challenge" : "Added to your tasks"}</span>
            <span className="block truncate text-sm font-bold">{artifact.title}</span>
          </span>
        </Link>
      );
    case "goal":
      return (
        <Link href="/goals" className="pop flex items-center gap-3 rounded-2xl bg-white p-3 ring-1 ring-line transition hover:ring-violet-300">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-violet-100 text-violet-600">
            <Target className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] font-extrabold uppercase tracking-wider text-muted">Goal updated</span>
            <span className="block truncate text-sm font-bold">{artifact.title}</span>
          </span>
        </Link>
      );
    case "memory":
      return (
        <p className="pop inline-flex items-center gap-1.5 rounded-full bg-pink-50 px-3 py-1 text-xs font-bold text-pink-600">
          <Brain className="h-3.5 w-3.5" /> I&apos;ll remember: {artifact.text}
        </p>
      );
    case "draft":
      return <Draft draft={artifact} />;
    case "decision":
      return <Decision d={artifact} />;
    case "habit":
      return (
        <div className="pop flex items-center gap-3 rounded-2xl bg-white p-3 ring-1 ring-line">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-sky-100 text-lg">{artifact.emoji || <Repeat className="h-4 w-4 text-sky-600" />}</span>
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] font-extrabold uppercase tracking-wider text-muted">New daily habit</span>
            <span className="block truncate text-sm font-bold">{artifact.title}</span>
          </span>
          <span className="text-xs font-bold text-sky-600">Tap it on Home each day ✓</span>
        </div>
      );
    case "plan":
      return (
        <div className="pop rounded-3xl bg-white p-4 ring-1 ring-line">
          <p className="mb-3 flex items-center gap-2 font-extrabold"><CalendarClock className="h-4 w-4 text-violet-500" /> {artifact.title}</p>
          <ol className="relative space-y-3 border-l-2 border-dashed border-violet-200 pl-5">
            {artifact.blocks.map((b, i) => (
              <li key={i} className="relative">
                <span className="candy absolute -left-[27px] top-1 h-3 w-3 rounded-full ring-4 ring-white" />
                <p className="text-xs font-extrabold text-violet-500">{b.time}</p>
                <p className="text-sm font-bold">{b.title}</p>
                {b.note && <p className="text-[13px] text-muted">{b.note}</p>}
              </li>
            ))}
          </ol>
        </div>
      );
  }
}

function Draft({ draft }: { draft: Extract<Artifact, { kind: "draft" }> }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="pop rounded-2xl bg-white p-4 ring-1 ring-line">
      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-muted">
        <Send className="h-3.5 w-3.5" /> For {draft.to} · {draft.channel}
      </p>
      <p className="whitespace-pre-wrap rounded-xl bg-emerald-50 px-3.5 py-2.5 text-[15px] leading-relaxed">{draft.text}</p>
      <button
        onClick={async () => {
          await navigator.clipboard.writeText(draft.text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="mt-2 inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-sm font-bold text-emerald-700 hover:bg-emerald-50"
      >
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? "Copied!" : "Copy message"}
      </button>
    </div>
  );
}

function Decision({ d }: { d: Extract<Artifact, { kind: "decision" }> }) {
  return (
    <div className="pop rounded-2xl bg-white p-4 ring-1 ring-line">
      <p className="mb-3 flex items-center gap-1.5 font-extrabold">
        <Scale className="h-4 w-4 text-violet-500" /> {d.question}
      </p>
      <div className={`grid gap-2 ${d.options.length > 2 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
        {d.options.map((o) => (
          <div key={o.label} className="rounded-xl bg-violet-50/60 p-3">
            <p className="mb-1.5 text-sm font-extrabold">{o.label}</p>
            {o.pros.map((p) => (
              <p key={p} className="flex gap-1.5 text-[13px] leading-snug text-emerald-700"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {p}</p>
            ))}
            {o.cons.map((c) => (
              <p key={c} className="flex gap-1.5 text-[13px] leading-snug text-rose-600"><X className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {c}</p>
            ))}
          </div>
        ))}
      </div>
      <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">💭 {d.leaning}</p>
    </div>
  );
}

function Quiz({ quiz, messageId }: { quiz: Extract<Artifact, { kind: "quiz" }>; messageId: string | null }) {
  const [answers, setAnswers] = useState<(number | null)[]>(quiz.answers);
  const [xp, setXp] = useState(quiz.xpEarned);
  const first = answers.findIndex((a) => a === null);
  const [step, setStep] = useState(first === -1 ? quiz.questions.length : first);
  const done = step >= quiz.questions.length;
  const score = answers.filter((a, i) => a === quiz.questions[i].answer).length;

  async function choose(choice: number) {
    if (answers[step] !== null) return;
    const q = quiz.questions[step];
    const correct = choice === q.answer;
    setAnswers((a) => a.map((x, i) => (i === step ? choice : x)));
    setMood(correct ? "excited" : "worried");
    if (correct) setXp((x) => x + 10);
    if (messageId) {
      await fetch("/api/quiz", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messageId, artifactId: quiz.id, question: step, choice }) });
    }
  }

  return (
    <div className="pop overflow-hidden rounded-3xl bg-white ring-1 ring-line">
      <div className="candy flex items-center justify-between px-4 py-2.5 text-white">
        <p className="flex items-center gap-2 font-extrabold"><Gamepad2 className="h-4 w-4" /> {quiz.title}</p>
        <p className="text-sm font-bold">{done ? "Finished" : `${step + 1}/${quiz.questions.length}`} · +{xp} XP</p>
      </div>
      {done ? (
        <div className="p-5 text-center">
          <p className="text-4xl">{score === quiz.questions.length ? "🏆" : score >= quiz.questions.length / 2 ? "🌟" : "💪"}</p>
          <p className="mt-1 text-lg font-extrabold">{score} / {quiz.questions.length} correct</p>
          <p className="text-sm text-muted">{score === quiz.questions.length ? "Perfect! You're unstoppable." : "Nice try! Ask me for another round to level up."}</p>
          <div className="mt-3 flex flex-wrap justify-center gap-1.5">
            {quiz.questions.map((q, i) => (
              <button key={i} onClick={() => setStep(i)} className={`h-7 w-7 rounded-full text-xs font-bold ${answers[i] === q.answer ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>{i + 1}</button>
            ))}
          </div>
        </div>
      ) : (
        <div className="p-4">
          <p className="mb-3 font-bold leading-snug">{quiz.questions[step].q}</p>
          <div className="grid gap-2">
            {quiz.questions[step].options.map((o, i) => {
              const picked = answers[step];
              const isAnswer = i === quiz.questions[step].answer;
              const tone = picked === null ? "bg-violet-50 hover:bg-violet-100" : isAnswer ? "bg-emerald-100 text-emerald-800 ring-2 ring-emerald-300" : picked === i ? "bg-rose-100 text-rose-700" : "bg-gray-50 opacity-60";
              return (
                <button key={i} disabled={picked !== null} onClick={() => choose(i)} className={`rounded-2xl px-4 py-2.5 text-left text-sm font-semibold transition ${tone}`}>
                  <span className="mr-2 font-extrabold text-violet-400">{"ABCD"[i]}</span> {o}
                </button>
              );
            })}
          </div>
          {answers[step] !== null && (
            <div className="pop mt-3 rounded-2xl bg-amber-50 px-3.5 py-2.5 text-sm">
              <p className="font-bold">{answers[step] === quiz.questions[step].answer ? "Correct! +10 XP 🎉" : "Not quite!"}</p>
              <p className="text-ink/80">{quiz.questions[step].explain}</p>
              <button onClick={() => setStep(step + 1)} className="mt-2 rounded-xl bg-white px-3 py-1.5 text-sm font-bold text-violet-700 ring-1 ring-violet-200">
                {step + 1 < quiz.questions.length ? "Next question →" : "See my score"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
