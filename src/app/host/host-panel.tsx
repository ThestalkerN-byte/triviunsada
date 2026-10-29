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
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  ChartColumn,
  Check,
  Circle,
  ClipboardList,
  Cog,
  Copy,
  Flag,
  FlaskConical,
  Gamepad2,
  Globe,
  GraduationCap,
  Laptop,
  Medal,
  Rocket,
  RotateCcw,
  Sprout,
  TestTube,
  Trophy,
  Users,
} from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import type { DataConnection, Peer } from "peerjs";

const primaryClass =
  "inline-flex min-h-14 items-center justify-center gap-3 rounded-xl bg-joy-500 px-7 py-4 text-lg font-extrabold text-ink-900 shadow-md transition duration-200 hover:-translate-y-0.5 hover:bg-joy-600 hover:shadow-lg focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-joy-500 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0";

const heroClass =
  "rounded-3xl bg-gradient-to-br from-primary-900 via-primary-700 to-[#17635F] text-white shadow-xl";

const optionColors = [
  "border-primary-500 bg-primary-100",
  "border-joy-500 bg-joy-100",
  "border-sage-300 bg-sand-50",
  "border-plum-700 bg-plum-100",
];

const careerFallbackIcons = [
  GraduationCap,
  Laptop,
  FlaskConical,
  Globe,
  Cog,
  BookOpen,
  ChartColumn,
  TestTube,
];

function getCareerIcon(name: string, index: number) {
  const normalized = name.toLowerCase();
  if (normalized.includes("agropecuarias")) return Sprout;
  if (normalized.includes("mantenimiento industrial")) return Cog;
  if (normalized.includes("gestión ambiental") || normalized.includes("gestion ambiental")) {
    return Globe;
  }
  return careerFallbackIcons[index % careerFallbackIcons.length];
}

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
        <div className={`${heroClass} mb-8 p-7 sm:p-10`}>
          <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-bold uppercase tracking-widest text-sage-300">
            <GraduationCap className="h-4 w-4" aria-hidden />
            Trivia UNSAdA · Multijugador
          </span>

          <h2 className="mt-5 text-3xl font-black sm:text-5xl">
            Crear una sala
          </h2>

          <p className="mt-4 max-w-2xl text-base leading-7 text-white/80 sm:text-lg">
            Elegí una carrera, generá un PIN e invitá a tus compañeros a competir
            y demostrar cuánto saben.
          </p>

          <div className="mt-6 flex flex-wrap gap-3 text-sm font-semibold text-white/80">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2">
              <Gamepad2 className="h-4 w-4 text-joy-500" aria-hidden />
              Partida en vivo
            </span>
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2">
              <Trophy className="h-4 w-4 text-joy-500" aria-hidden />
              Ranking de jugadores
            </span>
          </div>
        </div>

        <div className="mb-5">
          <p className="text-sm font-black uppercase tracking-widest text-joy-500">
            Paso 1
          </p>
          <h3 className="mt-2 text-2xl font-black text-primary-900 sm:text-3xl">
            Elegí una carrera
          </h3>
          <p className="mt-2 text-slate-600">
            Seleccioná el tema de las preguntas para tu partida.
          </p>
        </div>

        {bank.careers.length === 0 ? (
          <div className="rounded-2xl border border-sand-100 bg-sand-50 p-6 text-slate-700">
            Todavía no hay carreras para jugar.
          </div>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {bank.careers.map((career, index) => {
              const count = questionsForCareer(bank, career.id).length;
              const CareerIcon = getCareerIcon(career.name, index);

              return (
                <li key={career.id}>
                  <button
                    type="button"
                    className="group relative flex min-h-52 w-full flex-col overflow-hidden rounded-3xl border-2 border-sand-100 bg-white p-6 text-left shadow-sm transition duration-300 hover:-translate-y-1 hover:border-joy-500 hover:shadow-xl focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-joy-500 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
                    disabled={count === 0}
                    onClick={() => setSelectedId(career.id)}
                  >
                    <div className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-joy-500 opacity-10 blur-2xl transition group-hover:opacity-30" />

                    <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-100 text-primary-900">
                      <CareerIcon className="h-7 w-7" aria-hidden />
                    </div>

                    <h4 className="relative mt-5 text-lg font-extrabold leading-snug text-primary-900">
                      {career.name}
                    </h4>

                    <div className="relative mt-auto flex w-full items-center justify-between gap-2 pt-5">
                      <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                        count === 0
                          ? "bg-sand-100 text-slate-500"
                          : "bg-sage-300/30 text-ink-900"
                      }`}>
                        {count === 0
                          ? "Sin preguntas"
                          : count === 1
                            ? "1 pregunta"
                            : `${count} preguntas`}
                      </span>

                      <ArrowRight className="h-5 w-5 text-primary-900 transition group-hover:translate-x-1" aria-hidden />
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
      <div className={`${heroClass} p-7 sm:p-10`}>
        <span className="inline-flex rounded-full bg-white/10 px-4 py-2 text-xs font-bold uppercase tracking-widest text-sage-300">
          Paso 2 · Configuración
        </span>

        <h2 className="mt-5 text-3xl font-black sm:text-4xl">
          {selected.name}
        </h2>

        <div className="mt-6 inline-flex items-center gap-3 rounded-2xl border border-white/15 bg-white/10 px-5 py-4">
          <ClipboardList className="h-8 w-8 text-joy-500" aria-hidden />
          <div>
            <p className="text-2xl font-black text-joy-500">{count}</p>
            <p className="text-sm text-white/80">
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
              <Rocket className="h-5 w-5" aria-hidden />
              Abrir sala
            </button>
          ) : null}

          <button
            type="button"
            className="inline-flex min-h-14 items-center justify-center gap-2 rounded-xl border border-white/30 bg-white/10 px-6 py-4 font-bold text-white transition hover:bg-white/20"
            onClick={() => setSelectedId(null)}
          >
            <ArrowLeft className="h-5 w-5" aria-hidden />
            Elegir otra carrera
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
          <div className={`${heroClass} p-7 sm:p-10`}>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-bold uppercase tracking-widest text-sage-300">
              <Gamepad2 className="h-4 w-4" aria-hidden />
              Trivia UNSAdA
            </span>

            <p className="mt-8 text-sm font-bold uppercase tracking-widest text-white/80">
              Compartí este código con los jugadores
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-4">
              <p
                className="text-6xl font-black tracking-[0.14em] text-joy-500 sm:text-8xl"
                aria-label={`PIN ${pin}`}
              >
                {pin.slice(0, 3)} {pin.slice(3)}
              </p>

              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-xl border border-white/25 bg-white/10 px-4 py-3 font-bold text-white transition hover:bg-white/20"
                onClick={() => {
                  void navigator.clipboard?.writeText(pin);
                }}
              >
                <Copy className="h-5 w-5" aria-hidden />
                Copiar PIN
              </button>
            </div>

            <p className="mt-4 text-sm leading-6 text-white/80">
              Compartí el PIN para que tus compañeros puedan sumarse a la partida.
            </p>
          </div>

          <div className="rounded-3xl border-2 border-sand-100 bg-white p-6 shadow-sm sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-joy-500">
                  Participantes
                </p>
                <h2 className="mt-2 text-2xl font-black text-primary-900 sm:text-3xl">
                  Jugadores conectados
                </h2>
              </div>
              <span className="inline-flex items-center gap-2 rounded-2xl bg-primary-100 px-4 py-3 text-lg font-black text-primary-900">
                <Users className="h-5 w-5" aria-hidden />
                {room.players.length}
              </span>
            </div>

            {room.players.length === 0 ? (
              <div className="mt-6 rounded-2xl border-2 border-dashed border-sand-100 bg-sand-50 px-5 py-10 text-center">
                <Gamepad2 className="mx-auto h-10 w-10 text-primary-900" aria-hidden />
                <p className="mt-3 font-bold text-primary-900">
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
                    className="flex items-center gap-4 rounded-2xl border border-sand-100 bg-sand-50 p-4"
                  >
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary-900 text-xl font-black text-white">
                      {index + 1}
                    </span>
                    <span className="break-words font-bold text-primary-900">
                      {player.nickname}
                    </span>
                    <Circle className="ml-auto h-3 w-3 fill-sage-300 text-sage-300" aria-label="En línea" />
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
              <Rocket className="h-5 w-5" aria-hidden />
              Empezar partida
            </button>
          </div>
        </div>
      ) : null}

      {room.phase === "question" && question ? (
        <div className="grid gap-6">
          <div className={`${heroClass} p-6 sm:p-9`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-bold uppercase tracking-widest text-sage-300">
                <GraduationCap className="h-4 w-4" aria-hidden />
                Trivia UNSAdA
              </span>
              <span className="rounded-full bg-white/10 px-4 py-2 text-sm font-bold text-white/80">
                Pregunta {room.questionIndex + 1} de {questions.length}
              </span>
            </div>

            <div className="mt-7 rounded-2xl border border-white/10 bg-white/5 px-5 py-7 text-center">
              <p className="text-xs font-bold uppercase tracking-widest text-white/80">
                Tiempo restante
              </p>
              <p
                className={`mt-2 text-7xl font-black tabular-nums sm:text-8xl ${
                  secondsLeft <= 5 ? "text-red-300" : "text-sage-300"
                }`}
                aria-live="off"
              >
                {secondsLeft}
                <span className="ml-2 text-2xl font-bold">s</span>
              </p>
              <div className="mx-auto mt-5 h-2 w-full max-w-md overflow-hidden rounded-full bg-white/15">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    secondsLeft <= 5 ? "bg-red-400" : "bg-sage-300"
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

          <div className="rounded-3xl border-2 border-sand-100 bg-white p-6 shadow-sm sm:p-9">
            <p className="text-xs font-black uppercase tracking-widest text-joy-500">
              Pregunta actual
            </p>
            <h2 className="mt-4 break-words text-2xl font-black leading-tight text-primary-900 sm:text-4xl">
              {question.text}
            </h2>

            <ul className="mt-7 grid gap-3 sm:grid-cols-2">
              {question.options.map((option, index) => (
                <li
                  key={option.id}
                  className={`flex min-h-20 items-center gap-4 rounded-2xl border-2 p-4 ${optionColors[index % optionColors.length]}`}
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-lg font-black text-ink-900 shadow-sm">
                    {String.fromCharCode(65 + index)}
                  </span>
                  <span className="break-words font-semibold text-slate-800">
                    {option.text}
                  </span>
                </li>
              ))}
            </ul>

            <div className="mt-7 flex flex-col gap-4 rounded-2xl bg-sand-50 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
                  Participación
                </p>
                <p className="mt-1 text-xl font-black text-primary-900">
                  {room.answers.length} de {room.players.length} respuestas
                </p>
              </div>
              <button
                type="button"
                className={primaryClass}
                onClick={onClose}
              >
                <Check className="h-5 w-5" aria-hidden />
                Cerrar pregunta
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {room.phase === "reveal" && question ? (
        <div className="grid gap-6">
          <div className={`${heroClass} p-7 sm:p-9`}>
            <span className="inline-flex items-center gap-2 rounded-full bg-emerald-400/15 px-4 py-2 text-sm font-bold text-emerald-200">
              <Check className="h-4 w-4" aria-hidden />
              Respuesta revelada
            </span>

            <p className="mt-6 text-sm font-bold uppercase tracking-widest text-white/80">
              Pregunta {room.questionIndex + 1} de {questions.length}
            </p>

            <h2 className="mt-3 break-words text-2xl font-black leading-tight sm:text-4xl">
              {question.text}
            </h2>

            <div className="mt-6 rounded-2xl border-2 border-emerald-300/40 bg-emerald-400/10 p-5">
              <p className="text-xs font-bold uppercase tracking-widest text-emerald-200">
                Respuesta correcta
              </p>
              <p className="mt-2 flex items-start gap-2 break-words text-xl font-extrabold text-white sm:text-2xl">
                <Check className="mt-1 h-6 w-6 shrink-0" aria-hidden />
                {question.options.find((option) => option.id === room.correctOptionId)?.text}
              </p>
            </div>
          </div>

          <Leaderboard
            icon={<Medal className="h-8 w-8 text-joy-500" aria-hidden />}
            title="Resultados de la ronda"
            rows={room.roundPoints.map((row) => ({
              nickname: row.nickname,
              score: row.points,
            }))}
          />

          <Leaderboard
            icon={<Trophy className="h-8 w-8 text-joy-500" aria-hidden />}
            title="Ranking general"
            rows={room.leaderboard}
          />

          <div>
            {room.questionIndex + 1 < questions.length ? (
              <button type="button" className={primaryClass} onClick={onAdvance}>
                Siguiente pregunta
                <ArrowRight className="h-5 w-5" aria-hidden />
              </button>
            ) : (
              <button type="button" className={primaryClass} onClick={onFinish}>
                <Flag className="h-5 w-5" aria-hidden />
                Cerrar partida
              </button>
            )}
          </div>
        </div>
      ) : null}

      {room.phase === "ended" ? (
        <div className="grid gap-6">
          <div className={`${heroClass} p-8 text-center sm:p-12`}>
            <Trophy className="mx-auto h-16 w-16 text-joy-500" aria-hidden />
            <p className="mt-5 text-xs font-bold uppercase tracking-[0.2em] text-sage-300">
              Trivia UNSAdA
            </p>
            <h2 className="mt-3 text-4xl font-black sm:text-5xl">
              ¡Partida finalizada!
            </h2>
            <p className="mt-4 text-white/80">
              Estos son los resultados finales de la competencia.
            </p>
          </div>

          <Leaderboard
            icon={<Trophy className="h-8 w-8 text-joy-500" aria-hidden />}
            title="Ranking final"
            rows={room.leaderboard}
          />

          <button type="button" className={primaryClass} onClick={onReset}>
            <RotateCcw className="h-5 w-5" aria-hidden />
            Crear nueva sala
          </button>
        </div>
      ) : null}
    </section>
  );
}

function Leaderboard({
  title,
  icon,
  rows,
}: {
  title: string;
  icon?: ReactNode;
  rows: { nickname: string; score: number }[];
}) {
  return (
    <div>
      <h3 className="flex items-center gap-3 text-3xl text-primary-900">
        {icon}
        {title}
      </h3>
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
