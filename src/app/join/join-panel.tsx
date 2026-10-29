
"use client";

import { remainingSeconds } from "@/domain/attempt";
import type {
  HostToPlayerMessage,
  LeaderboardEntry,
  LobbyPlayer,
  PublicQuestion,
  RoundScore,
} from "@/multiplayer/protocol";
import { peerIdFromPin } from "@/multiplayer/pin";
import { nicknameError } from "@/multiplayer/session";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Clock,
  Gamepad2,
  GraduationCap,
  Hourglass,
  Medal,
  Trophy,
  Users,
  WifiOff,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { FormEvent, MouseEvent } from "react";
import type { DataConnection, Peer } from "peerjs";

const primaryClass =
  "inline-flex min-h-14 w-full items-center justify-center gap-3 rounded-xl bg-plum-700 px-6 py-4 text-lg font-extrabold text-white shadow-md transition duration-200 hover:-translate-y-0.5 hover:opacity-90 hover:shadow-lg focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-plum-700 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0";

const fieldClass =
  "w-full rounded-xl border-2 border-sand-100 bg-white px-4 py-4 text-lg font-semibold text-ink-900 outline-none transition placeholder:text-slate-400 focus:border-plum-700 focus:ring-4 focus:ring-plum-100";

const optionClass =
  "flex min-h-20 w-full items-center gap-4 rounded-2xl border-2 p-4 text-left text-lg font-semibold text-ink-900 transition duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-plum-700 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0";

const heroClass =
  "rounded-3xl bg-gradient-to-br from-primary-900 via-primary-700 to-[#17635F] text-white shadow-xl";

const optionColors = [
  "border-primary-500 bg-primary-100 hover:border-primary-700",
  "border-joy-500 bg-joy-100 hover:border-joy-600",
  "border-sage-300 bg-sand-50 hover:border-sage-300",
  "border-plum-700 bg-plum-100 hover:border-plum-700",
];

type PlayerView =
  | { status: "form" }
  | { status: "connecting" }
  | { status: "rejected"; reason: string }
  | { status: "lobby"; players: LobbyPlayer[] }
  | { status: "question"; question: PublicQuestion; sent: boolean }
  | {
      status: "reveal";
      question: PublicQuestion;
      correctOptionId: string;
      roundPoints: RoundScore[];
      leaderboard: LeaderboardEntry[];
    }
  | { status: "ended"; leaderboard: LeaderboardEntry[] }
  | { status: "cut" };

export function JoinPanel() {
  const [pin, setPin] = useState("");
  const [nickname, setNickname] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [view, setView] = useState<PlayerView>({ status: "form" });
  const [now, setNow] = useState(0);
  const nicknameRef = useRef("");
  const peerRef = useRef<Peer | null>(null);
  const connectionRef = useRef<DataConnection | null>(null);
  const generationRef = useRef(0);
  const outcomeRef = useRef<"pending" | "rejected" | "in">("pending");

  function leave() {
    generationRef.current += 1;
    connectionRef.current?.close();
    connectionRef.current = null;
    peerRef.current?.destroy();
    peerRef.current = null;
  }

  useEffect(() => {
    return () => {
      generationRef.current += 1;
      connectionRef.current?.close();
      peerRef.current?.destroy();
    };
  }, []);

  useEffect(() => {
    if (view.status !== "question") return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [view.status]);

  async function enter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const digits = pin.trim();

    if (!/^\d{6}$/.test(digits)) {
      setFormError("El PIN debe tener exactamente 6 dígitos.");
      return;
    }

    const nameError = nicknameError(nickname);
    if (nameError) {
      setFormError(nameError);
      return;
    }

    const trimmed = nickname.trim();
    setFormError(null);
    leave();

    const generation = generationRef.current;
    nicknameRef.current = trimmed;
    outcomeRef.current = "pending";
    setView({ status: "connecting" });

    let PeerCtor: typeof Peer;

    try {
      ({ default: PeerCtor } = await import("peerjs"));
    } catch {
      if (generationRef.current !== generation) return;
      setView({
        status: "rejected",
        reason: "No se pudo conectar. Intentá nuevamente.",
      });
      return;
    }

    if (generationRef.current !== generation) return;

    const peer = new PeerCtor();
    peerRef.current = peer;
    let settled = false;

    const fail = (reason: string) => {
      if (settled || generationRef.current !== generation) return;
      settled = true;
      peer.destroy();
      setView({ status: "rejected", reason });
    };

    peer.on("open", () => {
      if (generationRef.current !== generation) return;

      const connection = peer.connect(peerIdFromPin(digits), {
        reliable: true,
        serialization: "json",
      });

      connectionRef.current = connection;

      connection.on("open", () => {
        connection.send({ type: "player:join", nickname: trimmed });
      });

      connection.on("data", (raw) => {
        const message = readHostMessage(raw);
        if (!message || generationRef.current !== generation) return;

        if (message.type === "join:rejected") {
          settled = true;
          outcomeRef.current = "rejected";
          setView({ status: "rejected", reason: message.reason });
          connection.close();
          peer.destroy();
          return;
        }

        outcomeRef.current = "in";
        settled = true;
        setView((current) => applyHostMessage(current, message));

        if (message.type === "question:start") {
          setNow(Date.now());
        }
      });

      connection.on("close", () => {
        if (generationRef.current !== generation) return;
        if (outcomeRef.current === "rejected") return;

        if (outcomeRef.current === "pending") {
          fail("No hay una sala con ese PIN.");
          return;
        }

        setView({ status: "cut" });
      });
    });

    peer.on("error", (error) => {
      if (error.type === "peer-unavailable") {
        fail("No hay una sala con ese PIN.");
      } else {
        fail("No se pudo entrar a la sala. Intentá nuevamente.");
      }
    });
  }

  function choose(event: MouseEvent<HTMLButtonElement>) {
    const optionId = event.currentTarget.dataset.option;
    const connection = connectionRef.current;

    if (
      !optionId ||
      !connection?.open ||
      view.status !== "question" ||
      view.sent
    ) {
      return;
    }

    connection.send({
      type: "player:answer",
      questionId: view.question.id,
      optionId,
      answeredAt: Date.now(),
    });

    setView({ ...view, sent: true });
  }

  if (view.status === "form" || view.status === "rejected") {
    return (
      <section className="mt-8 overflow-hidden rounded-3xl border border-sand-100 bg-white shadow-xl">
        <div className={`${heroClass} rounded-none px-6 py-8 sm:px-9 sm:py-10`}>
          <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-bold uppercase tracking-widest text-sage-300">
            <GraduationCap className="h-4 w-4" aria-hidden />
            Trivia UNSAdA
          </div>

          <h2 className="mt-6 text-3xl font-black sm:text-4xl">
            ¡Sumate a la trivia!
          </h2>

          <p className="mt-3 max-w-md leading-7 text-white/80">
            Ingresá el PIN que te compartió el anfitrión, elegí tu nickname y
            preparate para competir.
          </p>
        </div>

        <form
          className="grid gap-5 p-6 sm:p-9"
          onSubmit={(event) => void enter(event)}
        >
          <label className="grid gap-2" htmlFor="pin">
            <span className="text-sm font-extrabold uppercase tracking-wider text-ink-900">
              Código de la sala
            </span>

            <input
              id="pin"
              className={`${fieldClass} text-center text-3xl tracking-[0.3em]`}
              inputMode="numeric"
              autoComplete="off"
              maxLength={6}
              placeholder="000000"
              value={pin}
              onChange={(event) =>
                setPin(event.target.value.replace(/\D/g, "").slice(0, 6))
              }
              aria-describedby="pin-help"
            />

            <span id="pin-help" className="text-sm text-slate-500">
              El código tiene 6 números.
            </span>
          </label>

          <label className="grid gap-2" htmlFor="nickname">
            <span className="text-sm font-extrabold uppercase tracking-wider text-ink-900">
              Tu nickname
            </span>

            <input
              id="nickname"
              className={fieldClass}
              maxLength={24}
              autoComplete="nickname"
              placeholder="¿Cómo te llamás?"
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
            />
          </label>

          {formError || view.status === "rejected" ? (
            <div
              role="alert"
              className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800"
            >
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
              <span>
                {view.status === "rejected" ? view.reason : formError}
              </span>
            </div>
          ) : null}

          <button type="submit" className={primaryClass}>
            Entrar a la sala
            <ArrowRight className="h-5 w-5" aria-hidden />
          </button>

          <p className="text-center text-xs leading-5 text-slate-500">
            Asegurate de ingresar el PIN correcto para encontrar la partida.
          </p>
        </form>
      </section>
    );
  }

  if (view.status === "connecting") {
    return (
      <section
        className={`${heroClass} mt-8 p-8 text-center sm:p-12`}
        aria-live="polite"
      >
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-white/10">
          <Gamepad2 className="h-10 w-10" aria-hidden />
        </div>
        <h2 className="mt-6 text-3xl font-black">Conectando a la sala...</h2>
        <p className="mt-3 leading-7 text-white/80">
          Estamos buscando la partida. Un momento, por favor.
        </p>
        <div className="mx-auto mt-6 h-2 max-w-xs overflow-hidden rounded-full bg-white/15">
          <div className="h-full w-2/3 animate-pulse rounded-full bg-sage-300" />
        </div>
      </section>
    );
  }

  if (view.status === "cut") {
    return (
      <section className="mt-8 rounded-3xl border-2 border-red-200 bg-white p-8 text-center shadow-lg sm:p-12">
        <WifiOff className="mx-auto h-12 w-12 text-primary-900" aria-hidden />
        <h2 className="mt-5 text-3xl font-black text-primary-900">
          Se perdió la conexión
        </h2>
        <p className="mt-3 leading-7 text-slate-600">
          La conexión con la sala se interrumpió. Volvé a ingresar desde la
          pantalla de inicio para intentar nuevamente.
        </p>
      </section>
    );
  }

  if (view.status === "lobby") {
    return (
      <section className="mt-8 grid gap-6">
        <div className={`${heroClass} p-7 sm:p-10`}>
          <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-bold uppercase tracking-widest text-sage-300">
            <Check className="h-4 w-4" aria-hidden />
            Conexión exitosa
          </span>

          <h2 className="mt-6 text-3xl font-black sm:text-4xl">
            ¡Ya estás en la sala!
          </h2>

          <p className="mt-3 leading-7 text-white/80">
            Esperá a que el anfitrión comience la partida. ¡Mucha suerte!
          </p>

          <div className="mt-7 flex items-center gap-4 rounded-2xl border border-white/10 bg-white/10 p-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-plum-700 text-2xl font-black text-white">
              {nickname.trim().slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-widest text-white/80">
                Estás jugando como
              </p>
              <p className="mt-1 break-words text-xl font-extrabold text-white">
                {nickname.trim()}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border-2 border-sand-100 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-plum-700">
                Sala de juego
              </p>
              <h3 className="mt-2 text-2xl font-black text-primary-900">
                Participantes
              </h3>
            </div>

            <span className="inline-flex items-center gap-2 rounded-2xl bg-plum-100 px-4 py-3 font-black text-primary-900">
              <Users className="h-5 w-5" aria-hidden />
              {view.players.length}
            </span>
          </div>

          <ul className="mt-5 grid gap-3 sm:grid-cols-2">
            {view.players.map((player, index) => (
              <li
                key={player.nickname}
                className={`flex items-center gap-3 rounded-2xl border p-4 ${
                  player.nickname === nickname.trim()
                    ? "border-plum-700 bg-plum-100"
                    : "border-sand-100 bg-sand-50"
                }`}
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-900 font-black text-white">
                  {index + 1}
                </span>
                <span className="break-words font-bold text-primary-900">
                  {player.nickname}
                </span>
                {player.nickname === nickname.trim() ? (
                  <span className="ml-auto text-xs font-extrabold text-plum-700">
                    VOS
                  </span>
                ) : null}
              </li>
            ))}
          </ul>

          <div className="mt-6 rounded-2xl bg-sand-50 p-4 text-center">
            <Hourglass className="mx-auto h-6 w-6 text-primary-900" aria-hidden />
            <p className="mt-2 font-bold text-primary-900">
              Esperando que empiece la partida...
            </p>
          </div>
        </div>
      </section>
    );
  }

  if (view.status === "question") {
    const remaining = remainingSeconds(
      view.question.startedAt,
      view.question.timeLimitSeconds,
      now || view.question.startedAt,
    );

    return (
      <section className="mt-8 grid gap-6">
        <div className={`${heroClass} p-6 sm:p-9`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-bold uppercase tracking-widest text-sage-300">
              <GraduationCap className="h-4 w-4" aria-hidden />
              Trivia UNSAdA
            </span>
            <span className="rounded-full bg-white/10 px-4 py-2 text-sm font-bold text-white/80">
              Pregunta {view.question.index + 1} de {view.question.total}
            </span>
          </div>

          <div className="mt-7 rounded-2xl border border-white/10 bg-white/5 px-5 py-6 text-center">
            <p className="text-xs font-bold uppercase tracking-widest text-white/80">
              Tiempo restante
            </p>
            <p
              className={`mt-2 text-7xl font-black tabular-nums sm:text-8xl ${
                remaining <= 5 ? "text-red-300" : "text-sage-300"
              }`}
              aria-live="off"
            >
              {remaining}
              <span className="ml-2 text-2xl font-bold">s</span>
            </p>
            <div className="mx-auto mt-4 h-2 max-w-md overflow-hidden rounded-full bg-white/15">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  remaining <= 5 ? "bg-red-400" : "bg-sage-300"
                }`}
                style={{
                  width: `${Math.max(
                    0,
                    Math.min(
                      100,
                      (remaining / view.question.timeLimitSeconds) * 100,
                    ),
                  )}%`,
                }}
              />
            </div>
          </div>
        </div>

        <div className="rounded-3xl border-2 border-sand-100 bg-white p-6 shadow-sm sm:p-9">
          <p className="text-xs font-black uppercase tracking-widest text-plum-700">
            Tu desafío
          </p>
          <h2 className="mt-4 break-words text-2xl font-black leading-tight text-primary-900 sm:text-4xl">
            {view.question.text}
          </h2>

          <div className="mt-7 grid gap-3">
            {view.question.options.map((option, index) => (
              <button
                key={option.id}
                type="button"
                className={`${optionClass} ${
                  optionColors[index % optionColors.length]
                } ${view.sent ? "border-sand-100 bg-sand-100" : ""}`}
                data-option={option.id}
                disabled={view.sent}
                onClick={choose}
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white font-black text-ink-900 shadow-sm">
                  {String.fromCharCode(65 + index)}
                </span>
                <span className="break-words">{option.text}</span>
              </button>
            ))}
          </div>

          {view.sent ? (
            <div
              className="mt-6 flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-800"
              aria-live="polite"
            >
              <Check className="h-6 w-6 shrink-0" aria-hidden />
              <div>
                <p className="font-extrabold">¡Respuesta enviada!</p>
                <p className="mt-1 text-sm">
                  Esperá a que termine el tiempo para ver los resultados.
                </p>
              </div>
            </div>
          ) : (
            <p className="mt-5 text-center text-sm text-slate-500">
              Elegí una opción para enviar tu respuesta.
            </p>
          )}
        </div>
      </section>
    );
  }

  if (view.status === "reveal") {
    const mine = view.roundPoints.find(
      (row) => row.nickname === nickname.trim(),
    );
    const correct = view.question.options.find(
      (option) => option.id === view.correctOptionId,
    );

    return (
      <section className="mt-8 grid gap-6">
        <div className={`${heroClass} p-7 sm:p-9`}>
          <span className="inline-flex items-center gap-2 rounded-full bg-emerald-400/15 px-4 py-2 text-sm font-bold text-emerald-200">
            <Check className="h-4 w-4" aria-hidden />
            Respuesta revelada
          </span>

          <p className="mt-6 text-xs font-bold uppercase tracking-widest text-white/80">
            Pregunta {view.question.index + 1} de {view.question.total}
          </p>

          <h2 className="mt-3 break-words text-2xl font-black leading-tight sm:text-3xl">
            {view.question.text}
          </h2>

          <div className="mt-6 rounded-2xl border-2 border-emerald-300/40 bg-emerald-400/10 p-5">
            <p className="text-xs font-bold uppercase tracking-widest text-emerald-200">
              Respuesta correcta
            </p>
            <p className="mt-2 flex items-start gap-2 break-words text-xl font-extrabold text-white">
              <Check className="mt-1 h-6 w-6 shrink-0" aria-hidden />
              {correct?.text ?? "Respuesta no disponible"}
            </p>
          </div>
        </div>

        <div className="rounded-3xl border-2 border-plum-700 bg-plum-100 p-6 text-center shadow-sm sm:p-8">
          <p className="text-sm font-black uppercase tracking-widest text-plum-700">
            Tu resultado en esta ronda
          </p>
          <p className="mt-3 text-6xl font-black text-primary-900">
            +{mine?.points ?? 0}
          </p>
          <p className="mt-2 font-semibold text-slate-600">puntos obtenidos</p>
        </div>

        <Ranking
          rows={view.leaderboard}
          icon={<Trophy className="h-7 w-7 text-plum-700" aria-hidden />}
          title="Ranking general"
        />

        <div className="rounded-2xl border border-sand-100 bg-sand-50 p-5 text-center">
          <p className="inline-flex items-center gap-2 font-bold text-primary-900">
            <Clock className="h-5 w-5" aria-hidden />
            Esperá la siguiente pregunta
          </p>
          <p className="mt-1 text-sm text-slate-600">
            El anfitrión continuará la partida.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="mt-8 grid gap-6">
      <div className={`${heroClass} p-8 text-center sm:p-12`}>
        <Trophy className="mx-auto h-16 w-16 text-joy-500" aria-hidden />
        <p className="mt-5 text-xs font-bold uppercase tracking-[0.2em] text-sage-300">
          Trivia UNSAdA
        </p>
        <h2 className="mt-3 text-4xl font-black sm:text-5xl">
          ¡Partida finalizada!
        </h2>
        <p className="mt-4 leading-7 text-white/80">
          ¡Gracias por participar! Estos son los resultados finales.
        </p>
      </div>

      <Ranking
        rows={view.leaderboard}
        icon={<Trophy className="h-7 w-7 text-plum-700" aria-hidden />}
        title="Ranking final"
      />
    </section>
  );
}

function Ranking({
  rows,
  title = "Clasificación",
  icon,
}: {
  rows: LeaderboardEntry[];
  title?: string;
  icon?: ReactNode;
}) {
  return (
    <section className="rounded-3xl border-2 border-sand-100 bg-white p-6 shadow-sm sm:p-8">
      <p className="text-xs font-black uppercase tracking-widest text-plum-700">
        Trivia UNSAdA
      </p>
      <h2 className="mt-2 flex items-center gap-3 text-2xl font-black text-primary-900 sm:text-3xl">
        {icon}
        {title}
      </h2>

      {rows.length === 0 ? (
        <p className="mt-5 rounded-2xl bg-sand-50 p-5 text-slate-500">
          Todavía no hay resultados para mostrar.
        </p>
      ) : (
        <ol className="mt-6 grid gap-3">
          {rows.map((row, index) => (
            <li
              key={`${row.nickname}-${index}`}
              className={`flex items-center justify-between gap-4 rounded-2xl border p-4 ${
                index === 0
                  ? "border-joy-500 bg-sand-50"
                  : "border-sand-100 bg-sand-50"
              }`}
            >
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl font-black ${
                    index === 0
                      ? "bg-joy-500 text-ink-900"
                      : "bg-primary-900 text-white"
                  }`}
                >
                  {index === 0 ? (
                    <Trophy className="h-5 w-5" aria-hidden />
                  ) : index === 1 || index === 2 ? (
                    <Medal className="h-5 w-5" aria-hidden />
                  ) : (
                    index + 1
                  )}
                </span>
                <span className="break-words font-bold text-primary-900">
                  {row.nickname}
                </span>
              </div>

              <span className="shrink-0 text-lg font-black tabular-nums text-ink-900">
                {row.score} <span className="text-sm font-semibold">pts</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function applyHostMessage(
  current: PlayerView,
  message: HostToPlayerMessage,
): PlayerView {
  if (message.type === "lobby:update") {
    if (
      current.status === "question" ||
      current.status === "reveal" ||
      current.status === "ended"
    ) {
      return current;
    }
    return { status: "lobby", players: message.players };
  }

  if (message.type === "question:start") {
    return { status: "question", question: message.question, sent: false };
  }

  if (message.type === "question:reveal") {
    const question =
      current.status === "question" || current.status === "reveal"
        ? current.question
        : null;

    if (!question) return current;

    return {
      status: "reveal",
      question,
      correctOptionId: message.correctOptionId,
      roundPoints: message.roundPoints,
      leaderboard: message.leaderboard,
    };
  }

  if (message.type === "game:ended") {
    return { status: "ended", leaderboard: message.leaderboard };
  }

  return { status: "rejected", reason: message.reason };
}

function readHostMessage(raw: unknown): HostToPlayerMessage | null {
  if (typeof raw !== "object" || raw === null || !("type" in raw)) {
    return null;
  }

  const message = raw as HostToPlayerMessage;

  if (
    message.type === "lobby:update" ||
    message.type === "question:start" ||
    message.type === "question:reveal" ||
    message.type === "game:ended" ||
    message.type === "join:rejected"
  ) {
    return message;
  }

  return null;
}
