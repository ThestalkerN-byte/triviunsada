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
import type { LucideIcon } from "lucide-react";
import ArrowRight from "lucide-react/icons/arrow-right";
import BookOpen from "lucide-react/icons/book-open";
import ChartColumn from "lucide-react/icons/chart-column";
import Check from "lucide-react/icons/check";
import Cog from "lucide-react/icons/cog";
import FlaskConical from "lucide-react/icons/flask-conical";
import Globe from "lucide-react/icons/globe";
import GraduationCap from "lucide-react/icons/graduation-cap";
import Laptop from "lucide-react/icons/laptop";
import RotateCcw from "lucide-react/icons/rotate-ccw";
import Sparkles from "lucide-react/icons/sparkles";
import Sprout from "lucide-react/icons/sprout";
import TestTube from "lucide-react/icons/test-tube";
import Trophy from "lucide-react/icons/trophy";
import X from "lucide-react/icons/x";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

const primaryClass =
  "inline-flex min-h-12 items-center justify-center rounded-full bg-primary-700 px-5 font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 disabled:cursor-not-allowed disabled:opacity-50";
const secondaryClass =
  "inline-flex min-h-12 items-center justify-center rounded-full border border-sand-100 bg-white px-5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500";

const careerIcons: LucideIcon[] = [
  GraduationCap,
  Laptop,
  FlaskConical,
  Globe,
  Cog,
  BookOpen,
  ChartColumn,
  TestTube,
];

function getCareerIcon(name: string, index: number): LucideIcon {
  const normalized = name.toLowerCase();

  if (normalized.includes("agropecuarias")) return Sprout;
  if (normalized.includes("mantenimiento industrial")) return Cog;
  if (
    normalized.includes("gestión ambiental") ||
    normalized.includes("gestion ambiental")
  ) {
    return Globe;
  }

  return careerIcons[index % careerIcons.length];
}

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
  const [questionCount, setQuestionCount] = useState(5);
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

  const started = startAttempt(stored.bank, careerId, questionCount);

  if (!started.ok) {
    setStartError(started.error);
    return;
  }

  const tick = Date.now();
  setNow(tick);
  setStartError(null);
  setSession({
    status: "playing",
    attempt: started.attempt,
    startedAt: tick,
  });
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

    const attemptedQuestions = questions.filter((question) =>
  session.attempt.questionIds.includes(question.id),
);

const summary = summarizeAttempt(attemptedQuestions, session.attempt);
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
        <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-primary-900 via-primary-700 to-[#17635F] text-white shadow-xl">
          <div className="p-7 text-center sm:p-10">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl border border-joy-500/50 bg-joy-500 text-ink-900 shadow-lg">
              <Trophy className="h-8 w-8" aria-hidden="true" />
            </div>

            <p className="mt-6 text-sm font-bold uppercase tracking-[0.2em] text-joy-500">
              Trivia UNSAdA
            </p>

            <h2 className="mt-3 text-3xl font-black sm:text-4xl">
              ¡Trivia finalizada!
            </h2>

            <p className="mt-3 text-lg text-white/80">
              {resultMessage}
            </p>

            <div className="mx-auto mt-8 grid max-w-lg grid-cols-2 gap-4">
              <div className="rounded-2xl border border-white/15 bg-white/10 p-5">
                <p className="text-sm font-medium text-white/80">
                  Respuestas correctas
                </p>
                <p className="mt-2 text-4xl font-black text-sage-300">
                  {summary.correct}
                  <span className="text-xl text-white/70">
                    {" "}/ {summary.total}
                  </span>
                </p>
              </div>

              <div className="rounded-2xl border border-white/15 bg-white/10 p-5">
                <p className="text-sm font-medium text-white/80">
                  Tu resultado
                </p>
                <p className="mt-2 text-4xl font-black text-joy-500">
                  {percentage}%
                </p>
              </div>
            </div>

            <div className="mx-auto mt-6 max-w-lg">
              <div className="h-3 overflow-hidden rounded-full bg-primary-900/70">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-joy-500 to-sage-300 transition-all duration-700"
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-sand-100 bg-white p-5 shadow-lg sm:p-8">
          <div className="mb-6">
            <p className="text-sm font-bold uppercase tracking-[0.15em] text-joy-600">
              Repaso de respuestas
            </p>
            <h3 className="mt-2 text-2xl font-extrabold text-primary-900">
              ¿Cómo te fue?
            </h3>
          </div>

          <ul className="grid gap-4">
            {summary.rows.map((row, index) => (
              <li
                key={row.questionId}
                className={`rounded-2xl border-2 p-5 ${
                  row.correct
                    ? "border-sage-300 bg-primary-100"
                    : "border-red-200 bg-red-50"
                }`}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white ${
                      row.correct ? "bg-primary-700" : "bg-red-600"
                    }`}
                  >
                    {row.correct ? (
                      <Check className="h-5 w-5" aria-hidden="true" />
                    ) : (
                      <X className="h-5 w-5" aria-hidden="true" />
                    )}
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold uppercase tracking-wider text-ink-400">
                      Pregunta {index + 1}
                    </p>

                    <p className="mt-1 text-lg font-bold leading-snug text-ink-900">
                      {row.text}
                    </p>

                    <p
                      className={`mt-3 font-bold ${
                        row.correct ? "text-primary-700" : "text-red-800"
                      }`}
                    >
                      {row.correct ? "¡Correcta!" : "Incorrecta"}
                    </p>

                    {!row.correct && (
                      <p className="mt-2 text-sm text-ink-600">
                        Tu respuesta:{" "}
                        <span className="font-semibold">
                          {row.selectedOptionText ?? "Sin respuesta"}
                        </span>
                      </p>
                    )}

                    <p className="mt-2 text-sm text-ink-600">
                      Respuesta correcta:{" "}
                      <span className="font-bold text-primary-700">
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
            className="inline-flex min-h-14 flex-1 items-center justify-center gap-2 rounded-2xl bg-primary-700 px-6 font-bold text-white shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
            onClick={begin}
          >
            <RotateCcw className="h-5 w-5" aria-hidden="true" />
            Jugar de nuevo
          </button>

          <button
            type="button"
            className="inline-flex min-h-14 flex-1 items-center justify-center rounded-2xl bg-joy-500 px-6 font-bold text-ink-900 transition hover:bg-joy-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
            onClick={() => selectCareer(null)}
          >
            Elegir otra carrera
          </button>
        </div>

        <p className="pb-4 text-center text-sm text-ink-400">
          UNSAdA · Universidad y territorio
        </p>
      </section>
    );
  }

  if (!careerId) {
    return (
      <section className="mx-auto mt-8 grid w-full max-w-5xl gap-7 sm:mt-10">
        <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-primary-900 via-primary-700 to-[#17635F] p-7 text-white shadow-xl sm:p-10">
          <div className="flex items-center gap-5">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-joy-500/50 bg-joy-500 text-ink-900 shadow-lg">
              <GraduationCap className="h-8 w-8" aria-hidden="true" />
            </div>

            <div>
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-joy-500">
                Trivia UNSAdA
              </p>
              <h2 className="mt-2 text-3xl font-black sm:text-4xl">
                Elegí tu carrera
              </h2>
            </div>
          </div>

          <p className="mt-5 max-w-2xl text-base leading-relaxed text-white/80 sm:text-lg">
            Explorá las distintas áreas de conocimiento, poné a prueba lo que
            sabés y descubrí todo lo que podés aprender en nuestra universidad.
          </p>

          <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold">
            <Sparkles className="h-4 w-4 text-joy-500" aria-hidden="true" />
            {bank.careers.length} carreras disponibles
          </div>
        </div>

        {bank.careers.length === 0 ? (
          <div className="rounded-3xl border-2 border-dashed border-primary-100 bg-white p-10 text-center shadow-sm">
            <BookOpen className="mx-auto h-12 w-12 text-primary-700" aria-hidden="true" />
            <h3 className="mt-4 text-xl font-bold text-primary-900">
              Próximamente
            </h3>
            <p className="mt-2 text-ink-600">
              Todavía no hay carreras disponibles para jugar.
            </p>
          </div>
        ) : (
          <ul className="grid gap-5 sm:grid-cols-2">
            {bank.careers.map((career, index) => {
              const count = questionsForCareer(bank, career.id).length;
              const Icon = getCareerIcon(career.name, index);

              return (
                <li key={career.id}>
                  <button
                    type="button"
                    className="group relative flex min-h-44 w-full flex-col overflow-hidden rounded-2xl border border-sand-100 border-t-4 border-t-joy-500 bg-white p-5 text-left shadow-sm transition duration-200 hover:-translate-y-1 hover:border-primary-100 hover:border-t-joy-600 hover:shadow-lg focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-primary-500 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 sm:p-6"
                    disabled={count === 0}
                    onClick={() => selectCareer(career.id)}
                  >
                    <div className="flex w-full items-start justify-between gap-4">
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary-100 text-primary-700 transition duration-200 group-hover:scale-110">
                        <Icon className="h-8 w-8" aria-hidden="true" />
                      </div>

                      <span
                        className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                          count > 0
                            ? "bg-primary-100 text-primary-700"
                            : "bg-sand-100 text-ink-400"
                        }`}
                      >
                        {count === 0 ? "Sin preguntas" : "Disponible"}
                      </span>
                    </div>

                    <span className="mt-5 text-xl font-extrabold leading-snug text-primary-900 transition group-hover:text-primary-700 sm:text-2xl">
                      {career.name}
                    </span>

                    <div className="mt-3 flex w-full items-center justify-between gap-3">
                      <span className="text-sm font-medium text-ink-600">
                        {count === 0
                          ? "Próximamente"
                          : count === 1
                            ? "1 pregunta disponible"
                            : `${count} preguntas disponibles`}
                      </span>

                      <ArrowRight className="h-6 w-6 text-joy-500 transition group-hover:translate-x-1" aria-hidden="true" />
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <div className="rounded-2xl border border-joy-100 bg-joy-100 p-5 text-center">
          <p className="inline-flex items-center justify-center gap-2 font-semibold text-primary-900">
            <Sparkles className="h-5 w-5 text-joy-600" aria-hidden="true" />
            Descubrí, aprendé y encontrá tu lugar en UNSAdA.
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
    <div className="overflow-hidden rounded-2xl border border-sand-100 border-t-4 border-t-joy-500 bg-white shadow-sm">
      <div className="p-6 sm:p-8">
        <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-joy-600">
          Modo individual
        </p>

        <h2 className="mt-3 text-3xl font-black leading-tight text-primary-900 sm:text-4xl">
          {selected.name}
        </h2>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-2 rounded-xl bg-primary-100 px-4 py-3 text-sm font-bold text-primary-900">
            <BookOpen className="h-5 w-5" aria-hidden="true" />
            {questions.length === 1
              ? "1 pregunta disponible"
              : `${questions.length} preguntas disponibles`}
          </span>
        </div>

        {questions.length === 0 ? (
          <p className="mt-5 rounded-xl border border-joy-100 bg-joy-100 p-4 text-sm text-ink-900">
            Esta carrera todavía no tiene preguntas disponibles.
          </p>
        ) : (
          <>
            <p className="mt-5 text-sm leading-6 text-ink-600">
              Poné a prueba tus conocimientos y comprobá cuánto sabés.
            </p>

            <div className="mt-6">
              <p className="text-sm font-extrabold text-primary-900">
                ¿Cuántas preguntas querés responder?
              </p>

              <div className="mt-3 grid grid-cols-3 gap-3">
                {[5, 10, 15].map((count) => {
                  const selectedCount = questionCount === count;
                  const availableCount = Math.min(count, questions.length);

                  return (
                    <button
                      key={count}
                      type="button"
                      aria-pressed={selectedCount}
                      onClick={() => setQuestionCount(count)}
                      className={`rounded-xl border-2 px-3 py-4 text-center transition ${
                        selectedCount
                          ? "border-joy-500 bg-primary-100 text-primary-900 shadow-sm"
                          : "border-sand-100 bg-white text-ink-600 hover:border-joy-300 hover:bg-sand-50"
                      }`}
                    >
                      <span className="block text-2xl font-black">
                        {count}
                      </span>
                      <span className="mt-1 block text-xs font-bold">
                        {count === 1 ? "pregunta" : "preguntas"}
                      </span>
                      {questions.length < count ? (
                        <span className="mt-2 block text-xs font-medium">
                          Jugarás {availableCount}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>

              <p className="mt-3 text-xs leading-5 text-ink-600">
                Las preguntas se eligen al azar. Si hay menos preguntas
                disponibles que las seleccionadas, jugarás todas las
                disponibles.
              </p>
            </div>
          </>
        )}

        {startError ? (
          <p
            role="alert"
            className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-800"
          >
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
    "border-primary-100 bg-primary-100 hover:bg-primary-100 hover:border-primary-500",
    "border-joy-100 bg-joy-100 hover:bg-joy-100 hover:border-joy-500",
    "border-sage-300 bg-primary-100 hover:bg-primary-100 hover:border-sage-300",
    "border-plum-100 bg-plum-100 hover:bg-plum-100 hover:border-plum-700",
  ];

  const letterColors = [
    "bg-primary-700 text-white",
    "bg-joy-500 text-ink-900",
    "bg-sage-300 text-ink-900",
    "bg-plum-700 text-white",
  ];

  return (
    <section className="mx-auto mt-8 grid w-full max-w-5xl gap-6 sm:mt-10">
      <div className="overflow-hidden rounded-3xl bg-gradient-to-r from-primary-900 via-primary-700 to-[#17635F] p-6 text-white shadow-xl sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-5">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-joy-500">
              UNSAdA · Trivia universitaria
            </p>
            <h2 className="mt-3 text-2xl font-extrabold sm:text-3xl">
              ¡Poné a prueba tus conocimientos!
            </h2>
            <p className="mt-2 text-white/80">
              Pregunta {question.index + 1} de {question.total}
            </p>
          </div>

          <div
            className={`flex h-24 w-24 shrink-0 flex-col items-center justify-center rounded-2xl border-2 shadow-lg ${
              remaining <= 5
                ? "border-red-300 bg-red-600 text-white"
                : "border-joy-500 bg-joy-500 text-ink-900"
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
            <span className="text-white/80">Tu progreso</span>
            <span className="text-joy-500">{progress}%</span>
          </div>
          <div
            className="h-3 overflow-hidden rounded-full bg-primary-900/70"
            role="progressbar"
            aria-label="Progreso de la trivia"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-joy-500 to-sage-300 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-sand-100 bg-white p-5 shadow-xl sm:p-9">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-joy-100 px-4 py-2 text-sm font-bold text-ink-900">
          <Sparkles className="h-4 w-4 text-joy-600" aria-hidden="true" />
          <span>Elegí la respuesta correcta</span>
        </div>

        <h3 className="text-2xl font-extrabold leading-snug text-primary-900 sm:text-4xl">
          {question.text}
        </h3>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {question.options.map((option, index) => (
            <button
              key={option.id}
              type="button"
              className={`group flex min-h-24 w-full items-center gap-4 rounded-2xl border-2 p-4 text-left text-base font-semibold text-ink-900 shadow-sm transition duration-200 hover:-translate-y-1 hover:shadow-lg focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-primary-500 sm:p-5 sm:text-lg ${
                optionColors[index % optionColors.length]
              }`}
              onClick={() => onAnswer(option.id)}
            >
              <span
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-xl font-black shadow-md transition group-hover:scale-110 ${
                  letterColors[index % letterColors.length]
                }`}
              >
                {String.fromCharCode(65 + index)}
              </span>

              <span className="flex-1 leading-relaxed">
                {option.text}
              </span>

              <ArrowRight className="h-6 w-6 text-ink-400 transition group-hover:translate-x-1 group-hover:text-primary-900" aria-hidden="true" />
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-center gap-3 rounded-2xl border border-primary-100 bg-primary-100 p-4 text-center text-sm font-medium text-primary-900">
        <Sparkles className="h-5 w-5 text-joy-500" aria-hidden="true" />
        Universidad y territorio · Aprendé, participá y superate
        <Sparkles className="h-5 w-5 text-joy-500" aria-hidden="true" />
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
