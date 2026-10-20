
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
import { useEffect, useRef, useState } from "react";
import type { FormEvent, MouseEvent } from "react";
import type { DataConnection, Peer } from "peerjs";

const primaryClass =
  "inline-flex min-h-14 w-full items-center justify-center gap-3 rounded-xl bg-amber-400 px-6 py-4 text-lg font-extrabold text-blue-950 shadow-md transition duration-200 hover:-translate-y-0.5 hover:bg-amber-300 hover:shadow-lg focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-amber-400 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0";

const fieldClass =
  "w-full rounded-xl border-2 border-slate-200 bg-white px-4 py-4 text-lg font-semibold text-blue-950 outline-none transition placeholder:text-slate-400 focus:border-amber-400 focus:ring-4 focus:ring-amber-100";

const optionClass =
  "flex min-h-20 w-full items-center gap-4 rounded-2xl border-2 p-4 text-left text-lg font-semibold text-blue-950 transition duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-blue-700 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0";

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
      <section className="mt-8 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl">
        <div className="bg-gradient-to-br from-blue-950 via-blue-900 to-indigo-900 px-6 py-8 text-white sm:px-9 sm:py-10">
          <div className="inline-flex rounded-full border border-amber-200/30 bg-white/10 px-4 py-2 text-xs font-bold uppercase tracking-widest text-amber-200">
            🎓 Trivia UNSAdA
          </div>

          <h2 className="mt-6 text-3xl font-black sm:text-4xl">
            ¡Sumate a la trivia!
          </h2>

          <p className="mt-3 max-w-md leading-7 text-blue-100">
            Ingresá el PIN que te compartió el anfitrión, elegí tu nickname y
            preparate para competir.
          </p>
        </div>

        <form
          className="grid gap-5 p-6 sm:p-9"
          onSubmit={(event) => void enter(event)}
        >
          <label className="grid gap-2" htmlFor="pin">
            <span className="text-sm font-extrabold uppercase tracking-wider text-blue-950">
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
            <span className="text-sm font-extrabold uppercase tracking-wider text-blue-950">
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
              <span className="text-lg">⚠️</span>
              <span>
                {view.status === "rejected" ? view.reason : formError}
              </span>
            </div>
          ) : null}

          <button type="submit" className={primaryClass}>
            Entrar a la sala <span aria-hidden="true">→</span>
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
        className="mt-8 rounded-3xl bg-gradient-to-br from-blue-950 to-indigo-900 p-8 text-center text-white shadow-xl sm:p-12"
        aria-live="polite"
      >
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-white/10 text-4xl">
          🎮
        </div>
        <h2 className="mt-6 text-3xl font-black">Conectando a la sala...</h2>
        <p className="mt-3 leading-7 text-blue-100">
          Estamos buscando la partida. Un momento, por favor.
        </p>
        <div className="mx-auto mt-6 h-2 max-w-xs overflow-hidden rounded-full bg-white/15">
          <div className="h-full w-2/3 animate-pulse rounded-full bg-amber-300" />
        </div>
      </section>
    );
  }

  if (view.status === "cut") {
    return (
      <section className="mt-8 rounded-3xl border-2 border-red-200 bg-white p-8 text-center shadow-lg sm:p-12">
        <div className="text-5xl">📡</div>
        <h2 className="mt-5 text-3xl font-black text-blue-950">
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
        <div className="rounded-3xl bg-gradient-to-br from-blue-950 via-blue-900 to-indigo-900 p-7 text-white shadow-xl sm:p-10">
          <span className="inline-flex rounded-full border border-amber-200/30 bg-white/10 px-4 py-2 text-xs font-bold uppercase tracking-widest text-amber-200">
            ✓ Conexión exitosa
          </span>

          <h2 className="mt-6 text-3xl font-black sm:text-4xl">
            ¡Ya estás en la sala!
          </h2>

          <p className="mt-3 leading-7 text-blue-100">
            Esperá a que el anfitrión comience la partida. ¡Mucha suerte!
          </p>

          <div className="mt-7 flex items-center gap-4 rounded-2xl border border-white/10 bg-white/10 p-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-amber-400 text-2xl font-black text-blue-950">
              {nicknameRef.current.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-widest text-blue-200">
                Estás jugando como
              </p>
              <p className="mt-1 break-words text-xl font-extrabold text-white">
                {nicknameRef.current}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border-2 border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-amber-700">
                Sala de juego
              </p>
              <h3 className="mt-2 text-2xl font-black text-blue-950">
                Participantes
              </h3>
            </div>

            <span className="rounded-2xl bg-blue-100 px-4 py-3 font-black text-blue-950">
              👥 {view.players.length}
            </span>
          </div>

          <ul className="mt-5 grid gap-3 sm:grid-cols-2">
            {view.players.map((player, index) => (
              <li
                key={player.nickname}
                className={`flex items-center gap-3 rounded-2xl border p-4 ${
                  player.nickname === nicknameRef.current
                    ? "border-amber-300 bg-amber-50"
                    : "border-blue-100 bg-blue-50"
                }`}
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-950 font-black text-white">
                  {index + 1}
                </span>
                <span className="break-words font-bold text-blue-950">
                  {player.nickname}
                </span>
                {player.nickname === nicknameRef.current ? (
                  <span className="ml-auto text-xs font-extrabold text-amber-700">
                    VOS
                  </span>
                ) : null}
              </li>
            ))}
          </ul>

          <div className="mt-6 rounded-2xl bg-slate-50 p-4 text-center">
            <span className="text-xl">⏳</span>
            <p className="mt-2 font-bold text-blue-950">
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

    const optionColors = [
      "border-blue-200 bg-blue-50 hover:border-blue-400",
      "border-amber-200 bg-amber-50 hover:border-amber-400",
      "border-emerald-200 bg-emerald-50 hover:border-emerald-400",
      "border-violet-200 bg-violet-50 hover:border-violet-400",
    ];

    return (
      <section className="mt-8 grid gap-6">
        <div className="rounded-3xl bg-gradient-to-br from-blue-950 via-blue-900 to-indigo-900 p-6 text-white shadow-xl sm:p-9">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="rounded-full border border-amber-200/30 bg-white/10 px-4 py-2 text-xs font-bold uppercase tracking-widest text-amber-200">
              🎓 Trivia UNSAdA
            </span>
            <span className="rounded-full bg-white/10 px-4 py-2 text-sm font-bold text-blue-100">
              Pregunta {view.question.index + 1} de {view.question.total}
            </span>
          </div>

          <div className="mt-7 rounded-2xl border border-white/10 bg-white/5 px-5 py-6 text-center">
            <p className="text-xs font-bold uppercase tracking-widest text-blue-200">
              Tiempo restante
            </p>
            <p
              className={`mt-2 text-7xl font-black tabular-nums sm:text-8xl ${
                remaining <= 5 ? "text-red-300" : "text-amber-300"
              }`}
              aria-live="off"
            >
              {remaining}
              <span className="ml-2 text-2xl font-bold">s</span>
            </p>
            <div className="mx-auto mt-4 h-2 max-w-md overflow-hidden rounded-full bg-white/15">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  remaining <= 5 ? "bg-red-400" : "bg-amber-300"
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

        <div className="rounded-3xl border-2 border-slate-200 bg-white p-6 shadow-sm sm:p-9">
          <p className="text-xs font-black uppercase tracking-widest text-amber-700">
            Tu desafío
          </p>
          <h2 className="mt-4 break-words text-2xl font-black leading-tight text-blue-950 sm:text-4xl">
            {view.question.text}
          </h2>

          <div className="mt-7 grid gap-3">
            {view.question.options.map((option, index) => (
              <button
                key={option.id}
                type="button"
                className={`${optionClass} ${
                  optionColors[index % optionColors.length]
                } ${view.sent ? "border-slate-200 bg-slate-100" : ""}`}
                data-option={option.id}
                disabled={view.sent}
                onClick={choose}
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white font-black text-blue-950 shadow-sm">
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
              <span className="text-2xl">✓</span>
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
      (row) => row.nickname === nicknameRef.current,
    );
    const correct = view.question.options.find(
      (option) => option.id === view.correctOptionId,
    );

    return (
      <section className="mt-8 grid gap-6">
        <div className="rounded-3xl bg-gradient-to-br from-blue-950 via-blue-900 to-indigo-900 p-7 text-white shadow-xl sm:p-9">
          <span className="inline-flex rounded-full bg-emerald-400/15 px-4 py-2 text-sm font-bold text-emerald-200">
            ✓ Respuesta revelada
          </span>

          <p className="mt-6 text-xs font-bold uppercase tracking-widest text-blue-200">
            Pregunta {view.question.index + 1} de {view.question.total}
          </p>

          <h2 className="mt-3 break-words text-2xl font-black leading-tight sm:text-3xl">
            {view.question.text}
          </h2>

          <div className="mt-6 rounded-2xl border-2 border-emerald-300/40 bg-emerald-400/10 p-5">
            <p className="text-xs font-bold uppercase tracking-widest text-emerald-200">
              Respuesta correcta
            </p>
            <p className="mt-2 break-words text-xl font-extrabold text-white">
              ✓ {correct?.text ?? "Respuesta no disponible"}
            </p>
          </div>
        </div>

        <div className="rounded-3xl border-2 border-amber-200 bg-amber-50 p-6 text-center shadow-sm sm:p-8">
          <p className="text-sm font-black uppercase tracking-widest text-amber-800">
            Tu resultado en esta ronda
          </p>
          <p className="mt-3 text-6xl font-black text-blue-950">
            +{mine?.points ?? 0}
          </p>
          <p className="mt-2 font-semibold text-slate-600">puntos obtenidos</p>
        </div>

        <Ranking rows={view.leaderboard} title="🏆 Ranking general" />

        <div className="rounded-2xl border border-blue-100 bg-blue-50 p-5 text-center">
          <p className="font-bold text-blue-950">
            ⏳ Esperá la siguiente pregunta
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
      <div className="rounded-3xl bg-gradient-to-br from-blue-950 via-blue-900 to-indigo-900 p-8 text-center text-white shadow-xl sm:p-12">
        <div className="text-6xl">🏆</div>
        <p className="mt-5 text-xs font-bold uppercase tracking-[0.2em] text-amber-200">
          Trivia UNSAdA
        </p>
        <h2 className="mt-3 text-4xl font-black sm:text-5xl">
          ¡Partida finalizada!
        </h2>
        <p className="mt-4 leading-7 text-blue-100">
          ¡Gracias por participar! Estos son los resultados finales.
        </p>
      </div>

      <Ranking rows={view.leaderboard} title="🏆 Ranking final" />
    </section>
  );
}

function Ranking({
  rows,
  title = "🏅 Clasificación",
}: {
  rows: LeaderboardEntry[];
  title?: string;
}) {
  return (
    <section className="rounded-3xl border-2 border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <p className="text-xs font-black uppercase tracking-widest text-amber-700">
        Trivia UNSAdA
      </p>
      <h2 className="mt-2 text-2xl font-black text-blue-950 sm:text-3xl">
        {title}
      </h2>

      {rows.length === 0 ? (
        <p className="mt-5 rounded-2xl bg-slate-50 p-5 text-slate-500">
          Todavía no hay resultados para mostrar.
        </p>
      ) : (
        <ol className="mt-6 grid gap-3">
          {rows.map((row, index) => (
            <li
              key={`${row.nickname}-${index}`}
              className={`flex items-center justify-between gap-4 rounded-2xl border p-4 ${
                index === 0
                  ? "border-amber-300 bg-amber-50"
                  : "border-slate-100 bg-slate-50"
              }`}
            >
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl font-black ${
                    index === 0
                      ? "bg-amber-400 text-blue-950"
                      : "bg-blue-950 text-white"
                  }`}
                >
                  {index === 0
                    ? "🥇"
                    : index === 1
                      ? "🥈"
                      : index === 2
                        ? "🥉"
                        : index + 1}
                </span>
                <span className="break-words font-bold text-blue-950">
                  {row.nickname}
                </span>
              </div>

              <span className="shrink-0 text-lg font-black tabular-nums text-blue-950">
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
