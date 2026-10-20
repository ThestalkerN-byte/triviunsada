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
  const percentage =
    summary.total > 0
      ? Math.round((summary.correct / summary.total) * 100)
      : 0;

  const resultMessage =
    percentage === 100
      ? "¡Excelente! ¡Respuesta perfecta!"
      : percentage >= 70
        ? "¡Muy buen trabajo! Vas por buen camino."
        : percentage >= 40
          ? "¡Bien! Seguí practicando para mejorar."
          : "¡A no bajar los brazos! Cada intento suma.";

  return (
    <section className="mx-auto mt-8 grid w-full max-w-4xl gap-6 sm:mt-10">
      <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-blue-950 via-blue-800 to-indigo-900 text-white shadow-xl">
        <div className="p-7 text-center sm:p-10">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl border border-amber-300/50 bg-amber-400 text-4xl shadow-lg">
            🏆
          </div>

          <p className="mt-6 text-sm font-bold uppercase tracking-[0.2em] text-amber-300">
            Trivia UNSAdA
          </p>

          <h2 className="mt-3 text-3xl font-black sm:text-4xl">
            ¡Trivia finalizada!
          </h2>

          <p className="mt-3 text-lg text-blue-100">
            {resultMessage}
          </p>

          <div className="mx-auto mt-8 grid max-w-lg grid-cols-2 gap-4">
            <div className="rounded-2xl border border-white/15 bg-white/10 p-5">
              <p className="text-sm font-medium text-blue-100">
                Respuestas correctas
              </p>
              <p className="mt-2 text-4xl font-black text-emerald-300">
                {summary.correct}
                <span className="text-xl text-white/70">
                  {" "}/ {summary.total}
                </span>
              </p>
            </div>

            <div className="rounded-2xl border border-white/15 bg-white/10 p-5">
              <p className="text-sm font-medium text-blue-100">
                Tu resultado
              </p>
              <p className="mt-2 text-4xl font-black text-amber-300">
                {percentage}%
              </p>
            </div>
          </div>

          <div className="mx-auto mt-6 max-w-lg">
            <div className="h-3 overflow-hidden rounded-full bg-blue-950/70">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-300 to-amber-300 transition-all duration-700"
                style={{ width: `${percentage}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-blue-100 bg-white p-5 shadow-lg sm:p-8">
        <div className="mb-6">
          <p className="text-sm font-bold uppercase tracking-[0.15em] text-amber-600">
            Repaso de respuestas
          </p>
          <h3 className="mt-2 text-2xl font-extrabold text-blue-950">
            ¿Cómo te fue?
          </h3>
        </div>

        <ul className="grid gap-4">
          {summary.rows.map((row, index) => (
            <li
              key={row.questionId}
              className={`rounded-2xl border-2 p-5 ${
                row.correct
                  ? "border-emerald-200 bg-emerald-50"
                  : "border-red-200 bg-red-50"
              }`}
            >
              <div className="flex items-start gap-3">
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xl font-black text-white ${
                    row.correct ? "bg-emerald-600" : "bg-red-600"
                  }`}
                >
                  {row.correct ? "✓" : "✕"}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Pregunta {index + 1}
                  </p>

                  <p className="mt-1 text-lg font-bold leading-snug text-slate-900">
                    {row.text}
                  </p>

                  <p
                    className={`mt-3 font-bold ${
                      row.correct ? "text-emerald-800" : "text-red-800"
                    }`}
                  >
                    {row.correct ? "¡Correcta!" : "Incorrecta"}
                  </p>

                  {!row.correct && (
                    <p className="mt-2 text-sm text-slate-700">
                      Tu respuesta:{" "}
                      <span className="font-semibold">
                        {row.selectedOptionText ?? "Sin respuesta"}
                      </span>
                    </p>
                  )}

                  <p className="mt-2 text-sm text-slate-700">
                    Respuesta correcta:{" "}
                    <span className="font-bold text-emerald-800">
                      {row.correctOptionText}
                    </span>
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          className="inline-flex min-h-14 flex-1 items-center justify-center rounded-2xl bg-gradient-to-r from-blue-950 to-blue-700 px-6 font-bold text-white shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl"
          onClick={begin}
        >
          ↻ Jugar de nuevo
        </button>

        <button
          type="button"
          className="inline-flex min-h-14 flex-1 items-center justify-center rounded-2xl border-2 border-amber-300 bg-amber-50 px-6 font-bold text-blue-950 transition hover:bg-amber-100"
          onClick={() => selectCareer(null)}
        >
          Elegir otra carrera
        </button>
      </div>

      <p className="pb-4 text-center text-sm text-slate-500">
        UNSAdA · Universidad y territorio
      </p>
    </section>
  );
}


  
if (!careerId) {
  const careerIcons = ["🎓", "💻", "🔬", "🌎", "⚙️", "📚", "📊", "🧪"];

  
const getCareerIcon = (name: string, index: number) => {
  const normalized = name.toLowerCase();

  if (normalized.includes("agropecuarias")) return "🌾";
  if (normalized.includes("mantenimiento industrial")) return "⚙️";
  if (normalized.includes("gestión ambiental") || normalized.includes("gestion ambiental")) return "🌎";

  return careerIcons[index % careerIcons.length];
};

  return (
    <section className="mx-auto mt-8 grid w-full max-w-5xl gap-7 sm:mt-10">
      <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-blue-950 via-blue-800 to-indigo-900 p-7 text-white shadow-xl sm:p-10">
        <div className="flex items-center gap-5">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-amber-300/50 bg-amber-400 text-3xl shadow-lg">
            🎓
          </div>

          <div>
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-amber-300">
              Trivia UNSAdA
            </p>
            <h2 className="mt-2 text-3xl font-black sm:text-4xl">
              Elegí tu carrera
            </h2>
          </div>
        </div>

        <p className="mt-5 max-w-2xl text-base leading-relaxed text-blue-100 sm:text-lg">
          Explorá las distintas áreas de conocimiento, poné a prueba lo que
          sabés y descubrí todo lo que podés aprender en nuestra universidad.
        </p>

        <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold">
          <span className="text-amber-300">✦</span>
          {bank.careers.length} carreras disponibles
        </div>
      </div>

      {bank.careers.length === 0 ? (
        <div className="rounded-3xl border-2 border-dashed border-blue-200 bg-white p-10 text-center shadow-sm">
          <div className="text-5xl">📚</div>
          <h3 className="mt-4 text-xl font-bold text-blue-950">
            Próximamente
          </h3>
          <p className="mt-2 text-slate-600">
            Todavía no hay carreras disponibles para jugar.
          </p>
        </div>
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2">
          {bank.careers.map((career, index) => {
            const count = questionsForCareer(bank, career.id).length;
            const icon = getCareerIcon(career.name, index);

            return (
              <li key={career.id}>
                <button
                  type="button"
                  
className="group relative flex min-h-44 w-full flex-col overflow-hidden rounded-2xl border border-slate-200 border-t-4 border-t-amber-400 bg-white p-5 text-left shadow-sm transition duration-200 hover:-translate-y-1 hover:border-blue-300 hover:border-t-amber-500 hover:shadow-lg focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-blue-700 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 sm:p-6"

                  disabled={count === 0}
                  onClick={() => selectCareer(career.id)}
                >
                  <div className="flex w-full items-start justify-between gap-4">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-100 to-amber-100 text-3xl transition duration-200 group-hover:scale-110">
                      {icon}
                    </div>

                    <span
                      className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                        count > 0
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {count === 0 ? "Sin preguntas" : "Disponible"}
                    </span>
                  </div>

                  <span className="mt-5 text-xl font-extrabold leading-snug text-blue-950 transition group-hover:text-blue-700 sm:text-2xl">
                    {career.name}
                  </span>

                  <div className="mt-3 flex w-full items-center justify-between gap-3">
                    <span className="text-sm font-medium text-slate-600">
                      {count === 0
                        ? "Próximamente"
                        : count === 1
                          ? "1 pregunta disponible"
                          : `${count} preguntas disponibles`}
                    </span>

                    <span className="text-2xl font-bold text-amber-600 transition group-hover:translate-x-1">
                      →
                    </span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-center">
        <p className="font-semibold text-blue-950">
          ✨ Descubrí, aprendé y encontrá tu lugar en UNSAdA.
        </p>
      </div>
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
  <section className="mt-8 grid w-full max-w-2xl gap-6">
    <div className="overflow-hidden rounded-2xl border border-slate-200 border-t-4 border-t-amber-400 bg-white shadow-sm">
      <div className="p-6 sm:p-8">
        <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-amber-700">
          Modo individual
        </p>

        <h2 className="mt-3 text-3xl font-black leading-tight text-blue-950 sm:text-4xl">
          {selected.name}
        </h2>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-2 rounded-xl bg-blue-50 px-4 py-3 text-sm font-bold text-blue-950">
            <span aria-hidden="true">📚</span>
            {questions.length === 1
              ? "1 pregunta disponible"
              : `${questions.length} preguntas disponibles`}
          </span>
        </div>

        {questions.length === 0 ? (
          <p className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            Esta carrera todavía no tiene preguntas disponibles.
          </p>
        ) : (
          <p className="mt-5 text-sm leading-6 text-slate-600">
            Poné a prueba tus conocimientos y comprobá cuánto sabés.
          </p>
        )}

        {startError ? (
          <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-800">
            {startError}
          </p>
        ) : null}

        <div className="mt-7 flex flex-wrap gap-3">
          {questions.length > 0 ? (
            <button type="button" className={primaryClass} onClick={begin}>
              Empezar partida
            </button>
          ) : null}

          <button
            type="button"
            className={secondaryClass}
            onClick={() => selectCareer(null)}
          >
            Elegir otra carrera
          </button>
        </div>
      </div>
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
  const progress = Math.round(
    ((question.index + 1) / question.total) * 100,
  );

  const optionColors = [
    "border-blue-200 bg-blue-50 hover:bg-blue-100 hover:border-blue-500",
    "border-amber-200 bg-amber-50 hover:bg-amber-100 hover:border-amber-500",
    "border-emerald-200 bg-emerald-50 hover:bg-emerald-100 hover:border-emerald-500",
    "border-violet-200 bg-violet-50 hover:bg-violet-100 hover:border-violet-500",
  ];

  const letterColors = [
    "bg-blue-600",
    "bg-amber-500",
    "bg-emerald-600",
    "bg-violet-600",
  ];

  return (
    <section className="mx-auto mt-8 grid w-full max-w-5xl gap-6 sm:mt-10">
      <div className="overflow-hidden rounded-3xl bg-gradient-to-r from-blue-950 via-blue-800 to-indigo-900 p-6 text-white shadow-xl sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-5">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-amber-300">
              UNSAdA · Trivia universitaria
            </p>
            <h2 className="mt-3 text-2xl font-extrabold sm:text-3xl">
              ¡Poné a prueba tus conocimientos!
            </h2>
            <p className="mt-2 text-blue-100">
              Pregunta {question.index + 1} de {question.total}
            </p>
          </div>

          <div
            className={`flex h-24 w-24 shrink-0 flex-col items-center justify-center rounded-2xl border-2 shadow-lg ${
              remaining <= 5
                ? "border-red-300 bg-red-600 text-white"
                : "border-amber-300 bg-amber-400 text-blue-950"
            }`}
            aria-live="off"
          >
            <span className="text-4xl font-black tabular-nums">
              {remaining}
            </span>
            <span className="text-xs font-bold uppercase">segundos</span>
          </div>
        </div>

        <div className="mt-7">
          <div className="mb-2 flex justify-between text-sm font-semibold">
            <span className="text-blue-100">Tu progreso</span>
            <span className="text-amber-300">{progress}%</span>
          </div>
          <div
            className="h-3 overflow-hidden rounded-full bg-blue-950/70"
            role="progressbar"
            aria-label="Progreso de la trivia"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-amber-300 to-yellow-400 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-amber-200 bg-white p-5 shadow-xl sm:p-9">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-amber-100 px-4 py-2 text-sm font-bold text-amber-900">
          <span aria-hidden="true">✦</span>
          <span>Elegí la respuesta correcta</span>
        </div>

        <h3 className="text-2xl font-extrabold leading-snug text-blue-950 sm:text-4xl">
          {question.text}
        </h3>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {question.options.map((option, index) => (
            <button
              key={option.id}
              type="button"
              className={`group flex min-h-24 w-full items-center gap-4 rounded-2xl border-2 p-4 text-left text-base font-semibold text-slate-900 shadow-sm transition duration-200 hover:-translate-y-1 hover:shadow-lg focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-blue-700 sm:p-5 sm:text-lg ${
                optionColors[index % optionColors.length]
              }`}
              onClick={() => onAnswer(option.id)}
            >
              <span
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-xl font-black text-white shadow-md transition group-hover:scale-110 ${
                  letterColors[index % letterColors.length]
                }`}
              >
                {String.fromCharCode(65 + index)}
              </span>

              <span className="flex-1 leading-relaxed">
                {option.text}
              </span>

              <span className="text-2xl text-slate-500 transition group-hover:translate-x-1 group-hover:text-blue-950">
                →
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-center gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-center text-sm font-medium text-blue-900">
        <span className="text-xl text-amber-500" aria-hidden="true">★</span>
        Universidad y territorio · Aprendé, participá y superate
        <span className="text-xl text-amber-500" aria-hidden="true">★</span>
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
