"use client";

import { questionsForCareer, remainingSeconds } from "@/domain/attempt";
import type { Question } from "@/domain/types";
import { toPublicQuestion, type HostToPlayerMessage, type PlayerToHostMessage } from "@/multiplayer/protocol";
import { createSessionPin, peerIdFromPin } from "@/multiplayer/pin";
import {
  createLobby,
  disconnectPlayer,
  endGame,
  joinPlayer,
  recordAnswer,
  revealQuestion,
  startQuestion,
  type Room,
} from "@/multiplayer/session";
import {
  BANK_STORAGE_KEY,
  createBrowserBankRepository,
  type LoadBankResult,
} from "@/persistence/bank-repository";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { DataConnection, Peer } from "peerjs";

const primaryClass =
  "inline-flex min-h-14 items-center justify-center gap-3 rounded-xl bg-amber-400 px-7 py-4 text-lg font-extrabold text-blue-950 shadow-md transition duration-200 hover:-translate-y-0.5 hover:bg-amber-300 hover:shadow-lg focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-amber-400 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0";

const secondaryClass =
  "inline-flex min-h-14 items-center justify-center rounded-xl border-2 border-slate-200 bg-white px-6 py-4 text-base font-bold text-blue-950 transition hover:border-blue-300 hover:bg-blue-50 focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-blue-700";
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

export function HostPanel() {
  const stored = useSyncExternalStore(subscribeBank, getBankSnapshot, getBankServerSnapshot);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [link, setLink] = useState<"idle" | "opening" | "live" | "failed">("idle");
  const [pin, setPin] = useState<string | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [roomError, setRoomError] = useState<string | null>(null);
  const [now, setNow] = useState(0);

  const generationRef = useRef(0);
  const peerRef = useRef<Peer | null>(null);
  const connectionsRef = useRef(new Map<string, DataConnection>());
  const roomRef = useRef<Room | null>(null);
  const questionsRef = useRef<Question[]>([]);
  const closeQuestionRef = useRef<() => void>(() => {});

  function sendAll(message: HostToPlayerMessage) {
    for (const connection of connectionsRef.current.values()) {
      if (connection.open) connection.send(message);
    }
  }

  function sendLobby(next: Extract<Room, { phase: "lobby" }>) {
    sendAll({
      type: "lobby:update",
      players: next.players.map((player) => ({ nickname: player.nickname })),
    });
  }

  function publish(next: Room) {
    roomRef.current = next;
    setRoom(next);
  }

  function showQuestion(next: Extract<Room, { phase: "question" }>) {
    const question = questionsRef.current[next.questionIndex];
    if (!question) return;
    publish(next);
    setNow(next.startedAt);
    sendAll({
      type: "question:start",
      question: toPublicQuestion(
        question,
        next.questionIndex,
        questionsRef.current.length,
        next.startedAt,
      ),
    });
  }

  function closeQuestion() {
    const current = roomRef.current;
    if (!current || current.phase !== "question") return;
    const question = questionsRef.current[current.questionIndex];
    if (!question || question.id !== current.questionId) return;
    const revealed = revealQuestion(current, question);
    if (revealed === current || revealed.phase !== "reveal") return;
    publish(revealed);
    sendAll({
      type: "question:reveal",
      correctOptionId: revealed.correctOptionId,
      roundPoints: revealed.roundPoints,
      leaderboard: revealed.leaderboard,
    });
  }

  useEffect(() => {
    closeQuestionRef.current = closeQuestion;
  });

  function begin() {
    const current = roomRef.current;
    const question = questionsRef.current[0];
    if (!current || !question) return;
    const started = startQuestion(current, { id: question.id, index: 0 }, Date.now());
    if (!started.ok || started.room.phase !== "question") return;
    showQuestion(started.room);
  }

  function advance() {
    const current = roomRef.current;
    if (!current || current.phase !== "reveal") return;
    const index = current.questionIndex + 1;
    const question = questionsRef.current[index];
    if (!question) return;
    const started = startQuestion(current, { id: question.id, index }, Date.now());
    if (!started.ok || started.room.phase !== "question") return;
    showQuestion(started.room);
  }

  function finish() {
    const current = roomRef.current;
    if (!current) return;
    const ended = endGame(current);
    if (ended === current || ended.phase !== "ended") return;
    publish(ended);
    sendAll({ type: "game:ended", leaderboard: ended.leaderboard });
  }

  function bindConnection(connection: DataConnection) {
    const drop = () => {
      connectionsRef.current.delete(connection.peer);
      const current = roomRef.current;
      if (!current) return;
      const next = disconnectPlayer(current, connection.peer);
      if (next === current) return;
      publish(next);
      if (next.phase === "lobby") sendLobby(next);
    };

    connection.on("data", (raw) => {
      const message = readPlayerMessage(raw);
      const current = roomRef.current;
      if (!message || !current) return;

      if (message.type === "player:join") {
        const joined = joinPlayer(current, connection.peer, message.nickname);
        if (!joined.ok || joined.room.phase !== "lobby") {
          connection.send({
            type: "join:rejected",
            reason: joined.ok ? "La partida ya empezó." : joined.error,
          });
          connection.close();
          return;
        }
        connectionsRef.current.set(connection.peer, connection);
        publish(joined.room);
        sendLobby(joined.room);
        return;
      }

      const question = questionsRef.current.find((item) => item.id === message.questionId);
      if (!question) return;
      const next = recordAnswer(
        current,
        connection.peer,
        message.questionId,
        message.optionId,
        Date.now(),
        question,
      );
      if (next === current) return;
      publish(next);
    });
    connection.on("close", drop);
    connection.on("error", drop);
  }

  function stopPeer() {
    generationRef.current += 1;
    peerRef.current?.destroy();
    peerRef.current = null;
    connectionsRef.current.clear();
    roomRef.current = null;
    questionsRef.current = [];
    setQuestions([]);
  }

  function resetRoom() {
    stopPeer();
    setRoom(null);
    setPin(null);
    setNow(0);
    setLink("idle");
    setRoomError(null);
  }

  async function openRoom(careerId: string) {
    if (!stored?.ok) return;
    const questions = questionsForCareer(stored.bank, careerId);
    if (questions.length === 0) return;
    stopPeer();
    const generation = generationRef.current;
    questionsRef.current = questions;
    setQuestions(questions);
    setRoomError(null);
    setLink("opening");

    let PeerCtor: typeof Peer;
    try {
      ({ default: PeerCtor } = await import("peerjs"));
    } catch {
      if (generationRef.current !== generation) return;
      setLink("failed");
      setRoomError("No se pudo abrir la sala.");
      return;
    }
    if (generationRef.current !== generation) return;
    openWithPin(PeerCtor, generation, 0);
  }

  function openWithPin(PeerCtor: typeof Peer, generation: number, tries: number) {
    if (generationRef.current !== generation) return;
    const nextPin = createSessionPin();
    const peer = new PeerCtor(peerIdFromPin(nextPin));
    peerRef.current = peer;
    let opened = false;

    peer.on("open", () => {
      if (generationRef.current !== generation) {
        peer.destroy();
        return;
      }
      opened = true;
      const lobby = createLobby();
      publish(lobby);
      setPin(nextPin);
      setLink("live");
    });

    peer.on("error", (error) => {
      if (generationRef.current !== generation) return;
      if (!opened && error.type === "unavailable-id" && tries < 7) {
        peer.destroy();
        openWithPin(PeerCtor, generation, tries + 1);
        return;
      }
      if (!opened) {
        peer.destroy();
        setLink("failed");
        setRoomError("No se pudo abrir la sala.");
      }
    });

    peer.on("connection", (connection) => {
      if (generationRef.current !== generation) {
        connection.close();
        return;
      }
      bindConnection(connection);
    });
  }

  useEffect(() => {
    return () => {
      generationRef.current += 1;
      peerRef.current?.destroy();
    };
  }, []);

  useEffect(() => {
    if (room?.phase !== "question") return;
    const timer = window.setInterval(() => {
      const current = roomRef.current;
      if (!current || current.phase !== "question") return;
      const question = questionsRef.current[current.questionIndex];
      if (!question) return;
      const tick = Date.now();
      setNow(tick);
      if (remainingSeconds(current.startedAt, question.timeLimitSeconds, tick) > 0) return;
      closeQuestionRef.current();
    }, 250);
    return () => window.clearInterval(timer);
  }, [room?.phase]);

  if (stored === null) return <p className="mt-8 text-2xl">Cargando el banco…</p>;

  if (!stored.ok) {
    return (
      <div className="mt-8 grid max-w-xl gap-4">
        <p role="alert" className="text-xl text-red-800">
          {stored.error} No se puede abrir una sala hasta corregir el banco.
        </p>
      </div>
    );
  }

  const bank = stored.bank;
  const selected = bank.careers.find((career) => career.id === selectedId) ?? null;

  if (link === "opening") {
    return <p className="mt-10 text-3xl">Generando el PIN…</p>;
  }

  if (link === "live" && room && pin) {
    return (
      <LiveRoom
        pin={pin}
        room={room}
        now={now}
        questions={questions}
        onBegin={begin}
        onClose={closeQuestion}
        onAdvance={advance}
        onFinish={finish}
        onReset={resetRoom}
      />
    );
  }

  
if (!selected) {
  return (
    <section className="mt-8">
      <div className="mb-8 rounded-3xl bg-gradient-to-br from-blue-950 via-blue-900 to-indigo-900 p-7 text-white shadow-xl sm:p-10">
        <span className="inline-flex rounded-full border border-amber-200/30 bg-white/10 px-4 py-2 text-xs font-bold uppercase tracking-widest text-amber-200">
          🎓 Trivia UNSAdA · Multijugador
        </span>

        <h2 className="mt-5 text-3xl font-black sm:text-5xl">
          Crear una sala
        </h2>

        <p className="mt-4 max-w-2xl text-base leading-7 text-blue-100 sm:text-lg">
          Elegí una carrera, generá un PIN e invitá a tus compañeros a competir
          y demostrar cuánto saben.
        </p>

        <div className="mt-6 flex flex-wrap gap-3 text-sm font-semibold text-blue-50">
          <span className="rounded-full bg-white/10 px-4 py-2">🎮 Partida en vivo</span>
          <span className="rounded-full bg-white/10 px-4 py-2">🏆 Ranking de jugadores</span>
        </div>
      </div>

      <div className="mb-5">
        <p className="text-sm font-black uppercase tracking-widest text-amber-700">
          Paso 1
        </p>
        <h3 className="mt-2 text-2xl font-black text-blue-950 sm:text-3xl">
          Elegí una carrera
        </h3>
        <p className="mt-2 text-slate-600">
          Seleccioná el tema de las preguntas para tu partida.
        </p>
      </div>

      {bank.careers.length === 0 ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-slate-700">
          Todavía no hay carreras para jugar.
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {bank.careers.map((career, index) => {
            const count = questionsForCareer(bank, career.id).length;

            return (
              <li key={career.id}>
                <button
                  type="button"
                  className="group relative flex min-h-52 w-full flex-col overflow-hidden rounded-3xl border-2 border-slate-200 bg-white p-6 text-left shadow-sm transition duration-300 hover:-translate-y-1 hover:border-blue-400 hover:shadow-xl focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-blue-700 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
                  disabled={count === 0}
                  onClick={() => setSelectedId(career.id)}
                >
                  <div className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-blue-400 opacity-10 blur-2xl transition group-hover:opacity-30" />

                  <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-100 text-3xl">
                    {career.name.toLowerCase().includes("agropecuarias")
  ? "🌾"
  : career.name.toLowerCase().includes("mantenimiento industrial")
    ? "⚙️"
    : career.name.toLowerCase().includes("gestión ambiental") ||
        career.name.toLowerCase().includes("gestion ambiental")
      ? "🌎"
      : ["🎓", "💻", "🔬", "🌎", "⚙️", "📚", "📊", "🧪"][index % 8]}
                  </div>

                  <h4 className="relative mt-5 text-lg font-extrabold leading-snug text-blue-950">
                    {career.name}
                  </h4>

                  <div className="relative mt-auto flex w-full items-center justify-between gap-2 pt-5">
                    <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                      count === 0
                        ? "bg-slate-100 text-slate-500"
                        : "bg-emerald-100 text-emerald-800"
                    }`}>
                      {count === 0
                        ? "Sin preguntas"
                        : count === 1
                          ? "1 pregunta"
                          : `${count} preguntas`}
                    </span>

                    <span className="font-bold text-blue-800 transition group-hover:translate-x-1">
                      →
                    </span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}


  const count = questionsForCareer(bank, selected.id).length;

  
return (
  <section className="mt-8 max-w-3xl">
    <div className="rounded-3xl bg-gradient-to-br from-blue-950 via-blue-900 to-indigo-900 p-7 text-white shadow-xl sm:p-10">
      <span className="inline-flex rounded-full bg-white/10 px-4 py-2 text-xs font-bold uppercase tracking-widest text-amber-200">
        Paso 2 · Configuración
      </span>

      <h2 className="mt-5 text-3xl font-black sm:text-4xl">
        {selected.name}
      </h2>

      <div className="mt-6 inline-flex items-center gap-3 rounded-2xl border border-white/15 bg-white/10 px-5 py-4">
        <span className="text-3xl">📝</span>
        <div>
          <p className="text-2xl font-black text-amber-300">{count}</p>
          <p className="text-sm text-blue-100">
            {count === 1 ? "pregunta disponible" : "preguntas disponibles"}
          </p>
        </div>
      </div>

      {roomError ? (
        <p role="alert" className="mt-5 rounded-xl border border-red-300/30 bg-red-500/15 p-4 text-sm font-semibold text-red-100">
          {roomError}
        </p>
      ) : null}

      <div className="mt-8 flex flex-wrap gap-3">
        {count > 0 ? (
          <button
            type="button"
            className={primaryClass}
            onClick={() => void openRoom(selected.id)}
          >
            🚀 Abrir sala
          </button>
        ) : null}

        <button
          type="button"
          className="inline-flex min-h-14 items-center justify-center rounded-xl border border-white/30 bg-white/10 px-6 py-4 font-bold text-white transition hover:bg-white/20"
          onClick={() => setSelectedId(null)}
        >
          ← Elegir otra carrera
        </button>
      </div>
    </div>
  </section>
);
}


function LiveRoom({
  pin,
  room,
  now,
  questions,
  onBegin,
  onClose,
  onAdvance,
  onFinish,
  onReset,
}: {
  pin: string;
  room: Room;
  now: number;
  questions: Question[];
  onBegin: () => void;
  onClose: () => void;
  onAdvance: () => void;
  onFinish: () => void;
  onReset: () => void;
}) {
  const question =
    room.phase === "question" || room.phase === "reveal"
      ? questions[room.questionIndex]
      : undefined;

  const secondsLeft =
    room.phase === "question" && question
      ? remainingSeconds(
          room.startedAt,
          question.timeLimitSeconds,
          now || room.startedAt,
        )
      : 0;

  return (
    <section className="mt-8 grid gap-6">
      {room.phase === "lobby" ? (
        <div className="grid gap-6">
          <div className="rounded-3xl bg-gradient-to-br from-blue-950 via-blue-900 to-indigo-900 p-7 text-white shadow-xl sm:p-10">
            <span className="rounded-full border border-amber-200/30 bg-white/10 px-4 py-2 text-xs font-bold uppercase tracking-widest text-amber-200">
              🎮 Trivia UNSAdA
            </span>

            <p className="mt-8 text-sm font-bold uppercase tracking-widest text-blue-200">
              Compartí este código con los jugadores
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-4">
              <p
                className="text-6xl font-black tracking-[0.14em] text-amber-300 sm:text-8xl"
                aria-label={`PIN ${pin}`}
              >
                {pin.slice(0, 3)} {pin.slice(3)}
              </p>

              <button
                type="button"
                className="rounded-xl border border-white/25 bg-white/10 px-4 py-3 font-bold text-white transition hover:bg-white/20"
                onClick={() => {
                  void navigator.clipboard?.writeText(pin);
                }}
              >
                📋 Copiar PIN
              </button>
            </div>

            <p className="mt-4 text-sm leading-6 text-blue-100">
              Compartí el PIN para que tus compañeros puedan sumarse a la partida.
            </p>
          </div>

          <div className="rounded-3xl border-2 border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-amber-700">
                  Participantes
                </p>
                <h2 className="mt-2 text-2xl font-black text-blue-950 sm:text-3xl">
                  Jugadores conectados
                </h2>
              </div>
              <span className="rounded-2xl bg-blue-100 px-4 py-3 text-lg font-black text-blue-950">
                👥 {room.players.length}
              </span>
            </div>

            {room.players.length === 0 ? (
              <div className="mt-6 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 px-5 py-10 text-center">
                <div className="text-4xl">🎮</div>
                <p className="mt-3 font-bold text-blue-950">
                  Esperando a los jugadores...
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  Cuando alguien ingrese el PIN, aparecerá acá.
                </p>
              </div>
            ) : (
              <ul className="mt-6 grid gap-3 sm:grid-cols-2">
                {room.players.map((player, index) => (
                  <li
                    key={player.id}
                    className="flex items-center gap-4 rounded-2xl border border-blue-100 bg-blue-50 p-4"
                  >
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-950 text-xl font-black text-white">
                      {index + 1}
                    </span>
                    <span className="break-words font-bold text-blue-950">
                      {player.nickname}
                    </span>
                    <span className="ml-auto text-emerald-600">●</span>
                  </li>
                ))}
              </ul>
            )}

            <button
              type="button"
              className={`${primaryClass} mt-7 w-full sm:w-auto`}
              disabled={room.players.length === 0}
              onClick={onBegin}
            >
              🚀 Empezar partida
            </button>
          </div>
        </div>
      ) : null}

      {room.phase === "question" && question ? (
        <div className="grid gap-6">
          <div className="rounded-3xl bg-gradient-to-br from-blue-950 via-blue-900 to-indigo-900 p-6 text-white shadow-xl sm:p-9">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="rounded-full border border-amber-200/30 bg-white/10 px-4 py-2 text-xs font-bold uppercase tracking-widest text-amber-200">
                🎓 Trivia UNSAdA
              </span>
              <span className="rounded-full bg-white/10 px-4 py-2 text-sm font-bold text-blue-100">
                Pregunta {room.questionIndex + 1} de {questions.length}
              </span>
            </div>

            <div className="mt-7 rounded-2xl border border-white/10 bg-white/5 px-5 py-7 text-center">
              <p className="text-xs font-bold uppercase tracking-widest text-blue-200">
                Tiempo restante
              </p>
              <p
                className={`mt-2 text-7xl font-black tabular-nums sm:text-8xl ${
                  secondsLeft <= 5 ? "text-red-300" : "text-amber-300"
                }`}
                aria-live="off"
              >
                {secondsLeft}
                <span className="ml-2 text-2xl font-bold">s</span>
              </p>
              <div className="mx-auto mt-5 h-2 w-full max-w-md overflow-hidden rounded-full bg-white/15">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    secondsLeft <= 5 ? "bg-red-400" : "bg-amber-300"
                  }`}
                  style={{
                    width: `${Math.max(
                      0,
                      Math.min(
                        100,
                        (secondsLeft / question.timeLimitSeconds) * 100,
                      ),
                    )}%`,
                  }}
                />
              </div>
            </div>
          </div>

          <div className="rounded-3xl border-2 border-slate-200 bg-white p-6 shadow-sm sm:p-9">
            <p className="text-xs font-black uppercase tracking-widest text-amber-700">
              Pregunta actual
            </p>
            <h2 className="mt-4 break-words text-2xl font-black leading-tight text-blue-950 sm:text-4xl">
              {question.text}
            </h2>

            <ul className="mt-7 grid gap-3 sm:grid-cols-2">
              {question.options.map((option, index) => {
                const optionColors = [
                  "border-blue-200 bg-blue-50",
                  "border-amber-200 bg-amber-50",
                  "border-emerald-200 bg-emerald-50",
                  "border-violet-200 bg-violet-50",
                ];

                return (
                  <li
                    key={option.id}
                    className={`flex min-h-20 items-center gap-4 rounded-2xl border-2 p-4 ${optionColors[index % optionColors.length]}`}
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-lg font-black text-blue-950 shadow-sm">
                      {String.fromCharCode(65 + index)}
                    </span>
                    <span className="break-words font-semibold text-slate-800">
                      {option.text}
                    </span>
                  </li>
                );
              })}
            </ul>

            <div className="mt-7 flex flex-col gap-4 rounded-2xl bg-slate-50 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
                  Participación
                </p>
                <p className="mt-1 text-xl font-black text-blue-950">
                  {room.answers.length} de {room.players.length} respuestas
                </p>
              </div>
              <button
                type="button"
                className={primaryClass}
                onClick={onClose}
              >
                ✓ Cerrar pregunta
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {room.phase === "reveal" && question ? (
        <div className="grid gap-6">
          <div className="rounded-3xl bg-gradient-to-br from-blue-950 via-blue-900 to-indigo-900 p-7 text-white shadow-xl sm:p-9">
            <span className="inline-flex rounded-full bg-emerald-400/15 px-4 py-2 text-sm font-bold text-emerald-200">
              ✓ Respuesta revelada
            </span>

            <p className="mt-6 text-sm font-bold uppercase tracking-widest text-blue-200">
              Pregunta {room.questionIndex + 1} de {questions.length}
            </p>

            <h2 className="mt-3 break-words text-2xl font-black leading-tight sm:text-4xl">
              {question.text}
            </h2>

            <div className="mt-6 rounded-2xl border-2 border-emerald-300/40 bg-emerald-400/10 p-5">
              <p className="text-xs font-bold uppercase tracking-widest text-emerald-200">
                Respuesta correcta
              </p>
              <p className="mt-2 break-words text-xl font-extrabold text-white sm:text-2xl">
                ✓ {question.options.find((option) => option.id === room.correctOptionId)?.text}
              </p>
            </div>
          </div>

          <Leaderboard
            title="🏅 Resultados de la ronda"
            rows={room.roundPoints.map((row) => ({
              nickname: row.nickname,
              score: row.points,
            }))}
          />

          <Leaderboard title="🏆 Ranking general" rows={room.leaderboard} />

          <div>
            {room.questionIndex + 1 < questions.length ? (
              <button type="button" className={primaryClass} onClick={onAdvance}>
                Siguiente pregunta →
              </button>
            ) : (
              <button type="button" className={primaryClass} onClick={onFinish}>
                🏁 Cerrar partida
              </button>
            )}
          </div>
        </div>
      ) : null}

      {room.phase === "ended" ? (
        <div className="grid gap-6">
          <div className="rounded-3xl bg-gradient-to-br from-blue-950 via-blue-900 to-indigo-900 p-8 text-center text-white shadow-xl sm:p-12">
            <div className="text-6xl">🏆</div>
            <p className="mt-5 text-xs font-bold uppercase tracking-[0.2em] text-amber-200">
              Trivia UNSAdA
            </p>
            <h2 className="mt-3 text-4xl font-black sm:text-5xl">
              ¡Partida finalizada!
            </h2>
            <p className="mt-4 text-blue-100">
              Estos son los resultados finales de la competencia.
            </p>
          </div>

          <Leaderboard title="🏆 Ranking final" rows={room.leaderboard} />

          <button type="button" className={primaryClass} onClick={onReset}>
            ↻ Crear nueva sala
          </button>
        </div>
      ) : null}
    </section>
  );
}


function Leaderboard({
  title,
  rows,
}: {
  title: string;
  rows: { nickname: string; score: number }[];
}) {
  return (
    <div>
      <h3 className="text-3xl">{title}</h3>
      <ol className="mt-3 grid gap-2">
        {rows.map((row, index) => (
          <li key={`${row.nickname}-${index}`} className="flex justify-between gap-6 text-4xl">
            <span>
              {index + 1}. {row.nickname}
            </span>
            <span>{row.score}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function readPlayerMessage(raw: unknown): PlayerToHostMessage | null {
  if (typeof raw !== "object" || raw === null) return null;
  const message = raw as { type?: unknown; nickname?: unknown; questionId?: unknown; optionId?: unknown; answeredAt?: unknown };
  if (message.type === "player:join" && typeof message.nickname === "string") {
    return { type: "player:join", nickname: message.nickname };
  }
  if (
    message.type === "player:answer" &&
    typeof message.questionId === "string" &&
    typeof message.optionId === "string" &&
    typeof message.answeredAt === "number"
  ) {
    return {
      type: "player:answer",
      questionId: message.questionId,
      optionId: message.optionId,
      answeredAt: message.answeredAt,
    };
  }
  return null;
}
