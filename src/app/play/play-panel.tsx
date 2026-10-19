"use client";

import {
  answerAttempt,
  questionsForCareer,
  remainingSeconds,
  startAttempt,
  summarizeAttempt,
  timeoutAttempt,
  type Attempt,
} from "@/domain/attempt";
import type { Question, QuestionBank } from "@/domain/types";
import { toPublicQuestion, type PublicQuestion } from "@/multiplayer/protocol";
import {
  BANK_STORAGE_KEY,
  createBrowserBankRepository,
  type LoadBankResult,
} from "@/persistence/bank-repository";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

const primaryClass =
  "inline-flex min-h-12 items-center justify-center rounded-full bg-accent px-5 font-medium text-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50";
const secondaryClass =
  "inline-flex min-h-12 items-center justify-center rounded-full border border-line bg-card px-5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const optionClass =
  "min-h-14 w-full rounded-2xl border border-line bg-card px-4 py-3 text-left text-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

type Session =
  | { status: "idle" }
  | { status: "playing"; attempt: Attempt; startedAt: number }
  | { status: "done"; attempt: Attempt };

let rawCache: string | null | undefined;
let bankSnapshot: LoadBankResult | null = null;

function subscribeBank(listener: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== BANK_STORAGE_KEY) return;
    rawCache = undefined;
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
}

function getBankSnapshot() {
  const raw = window.localStorage.getItem(BANK_STORAGE_KEY);
  if (raw === rawCache && bankSnapshot) return bankSnapshot;
  rawCache = raw;
  bankSnapshot = createBrowserBankRepository().load();
  return bankSnapshot;
}

function getBankServerSnapshot() {
  return null;
}

export function PlayPanel() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const careerId = searchParams.get("careerId");
  const stored = useSyncExternalStore(
    subscribeBank,
    getBankSnapshot,
    getBankServerSnapshot,
  );
  const [session, setSession] = useState<Session>({ status: "idle" });
  const [sessionCareerId, setSessionCareerId] = useState(careerId);
  const [now, setNow] = useState(0);
  const [startError, setStartError] = useState<string | null>(null);

  if (sessionCareerId !== careerId) {
    setSessionCareerId(careerId);
    setSession({ status: "idle" });
    setStartError(null);
  }

  const questions = useMemo(() => {
    if (!stored?.ok || !careerId) return [];
    return questionsForCareer(stored.bank, careerId);
  }, [stored, careerId]);

  useEffect(() => {
    if (session.status !== "playing") return;
    const timer = window.setInterval(() => {
      const tick = Date.now();
      setNow(tick);
      setSession((current) => advanceIfExpired(current, questions, tick));
    }, 250);
    return () => window.clearInterval(timer);
  }, [session.status, questions]);

  function selectCareer(id: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (id) params.set("careerId", id);
    else params.delete("careerId");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  function begin() {
    if (!stored?.ok || !careerId) return;
    const started = startAttempt(stored.bank, careerId);
    if (!started.ok) {
      setStartError(started.error);
      return;
    }
    const tick = Date.now();
    setNow(tick);
    setStartError(null);
    setSession({ status: "playing", attempt: started.attempt, startedAt: tick });
  }

  function choose(optionId: string) {
    if (!stored?.ok) return;
    const bank = stored.bank;
    setSession((current) => {
      if (current.status !== "playing") return current;
      const question = activeQuestion(bank, current.attempt);
      if (!question) return current;
      const next = answerAttempt(current.attempt, question, optionId);
      return sessionAfterAnswer(current, next);
    });
  }

  if (stored === null) {
    return <p className="mt-8">Cargando el banco…</p>;
  }

  if (!stored.ok) {
    return (
      <div className="mt-8 grid max-w-xl gap-4">
        <p role="alert" className="text-red-800">
          {stored.error} No se puede jugar hasta corregir el banco.
        </p>
      </div>
    );
  }

  const bank = stored.bank;
  const selected = bank.careers.find((career) => career.id === careerId) ?? null;

  if (session.status === "playing") {
    const question = activeQuestion(bank, session.attempt);
    if (!question) return null;
    const index = session.attempt.answers.length;
    const publicQuestion = toPublicQuestion(
      question,
      index,
      session.attempt.questionIds.length,
      session.startedAt,
    );
    return (
      <QuestionScreen
        question={publicQuestion}
        remaining={remainingSeconds(
          session.startedAt,
          question.timeLimitSeconds,
          now || session.startedAt,
        )}
        onAnswer={choose}
      />
    );
  }

  if (session.status === "done") {
    const summary = summarizeAttempt(questions, session.attempt);
    return (
      <section className="mt-8 grid gap-6">
        <h2 className="text-3xl">
          {summary.correct} de {summary.total}
        </h2>
        <ul className="grid gap-3">
          {summary.rows.map((row) => (
            <li key={row.questionId} className="grid gap-2 rounded-2xl border border-line bg-card p-4">
              <p className="text-lg">{row.text}</p>
              <p>{row.correct ? "Correcta" : "Incorrecta"}</p>
              <p>Elegiste: {row.selectedOptionText ?? "Sin respuesta"}</p>
              <p>Respuesta correcta: {row.correctOptionText}</p>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-3">
          <button type="button" className={primaryClass} onClick={begin}>
            Jugar de nuevo
          </button>
          <button type="button" className={secondaryClass} onClick={() => selectCareer(null)}>
            Elegir otra carrera
          </button>
        </div>
      </section>
    );
  }

  if (!careerId) {
    return (
      <section className="mt-8 grid gap-4" aria-labelledby="careers-heading">
        <h2 id="careers-heading" className="text-2xl">
          Elegí una carrera
        </h2>
        {bank.careers.length === 0 ? (
          <div className="grid gap-4">
            <p>Todavía no hay carreras para jugar.</p>
          </div>
        ) : (
          <ul className="grid gap-3">
            {bank.careers.map((career) => {
              const count = questionsForCareer(bank, career.id).length;
              return (
                <li key={career.id}>
                  <button
                    type="button"
                    className="grid w-full gap-1 rounded-2xl border border-line bg-card px-4 py-4 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={count === 0}
                    onClick={() => selectCareer(career.id)}
                  >
                    <span className="text-xl">{career.name}</span>
                    <span className="text-sm">
                      {count === 0 ? "Sin preguntas" : count === 1 ? "1 pregunta" : `${count} preguntas`}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    );
  }

  if (!selected) {
    return (
      <div className="mt-8 grid gap-4">
        <p>Esa carrera no está en el banco.</p>
        <button type="button" className={secondaryClass} onClick={() => selectCareer(null)}>
          Elegir otra carrera
        </button>
      </div>
    );
  }

  return (
    <section className="mt-8 grid max-w-xl gap-4">
      <h2 className="text-3xl">{selected.name}</h2>
      {questions.length === 0 ? (
        <p>Esta carrera no tiene preguntas.</p>
      ) : (
        <p>{questions.length === 1 ? "1 pregunta" : `${questions.length} preguntas`}</p>
      )}
      {startError ? (
        <p role="alert" className="text-red-800">
          {startError}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        {questions.length > 0 ? (
          <button type="button" className={primaryClass} onClick={begin}>
            Empezar
          </button>
        ) : null}
        <button type="button" className={secondaryClass} onClick={() => selectCareer(null)}>
          Elegir otra carrera
        </button>
      </div>
    </section>
  );
}

function QuestionScreen({
  question,
  remaining,
  onAnswer,
}: {
  question: PublicQuestion;
  remaining: number;
  onAnswer: (optionId: string) => void;
}) {
  return (
    <section className="mt-8 grid gap-6">
      <p className="text-sm">
        Pregunta {question.index + 1} de {question.total}
      </p>
      <p className="text-5xl leading-none" aria-live="off">
        {remaining}
        <span className="ml-2 text-lg">segundos</span>
      </p>
      <h2 className="text-3xl leading-tight">{question.text}</h2>
      <div className="grid gap-3">
        {question.options.map((option) => (
          <button
            key={option.id}
            type="button"
            className={optionClass}
            onClick={() => onAnswer(option.id)}
          >
            {option.text}
          </button>
        ))}
      </div>
    </section>
  );
}

function activeQuestion(bank: QuestionBank, attempt: Attempt): Question | null {
  const questionId = attempt.questionIds[attempt.answers.length];
  return questionsForCareer(bank, attempt.careerId).find((question) => question.id === questionId) ?? null;
}

function sessionAfterAnswer(current: Extract<Session, { status: "playing" }>, next: Attempt): Session {
  if (next === current.attempt) return current;
  if (next.answers.length >= next.questionIds.length) {
    return { status: "done", attempt: next };
  }
  return { status: "playing", attempt: next, startedAt: Date.now() };
}

function advanceIfExpired(current: Session, questions: Question[], now: number): Session {
  if (current.status !== "playing") return current;
  const question = questions.find(
    (item) => item.id === current.attempt.questionIds[current.attempt.answers.length],
  );
  if (!question) return current;
  if (remainingSeconds(current.startedAt, question.timeLimitSeconds, now) > 0) return current;
  const next = timeoutAttempt(current.attempt, question);
  if (next === current.attempt) return current;
  if (next.answers.length >= next.questionIds.length) {
    return { status: "done", attempt: next };
  }
  return { status: "playing", attempt: next, startedAt: now };
}
