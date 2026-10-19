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
  "inline-flex min-h-14 items-center justify-center rounded-full bg-accent px-6 text-xl font-medium text-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50";
const secondaryClass =
  "inline-flex min-h-14 items-center justify-center rounded-full border border-line bg-card px-6 text-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

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
      <section className="mt-8 grid gap-4">
        <h2 className="text-3xl">Elegí una carrera</h2>
        {bank.careers.length === 0 ? (
          <div className="grid gap-4">
            <p className="text-xl">Todavía no hay carreras para jugar.</p>
          </div>
        ) : (
          <ul className="grid gap-3">
            {bank.careers.map((career) => {
              const count = questionsForCareer(bank, career.id).length;
              return (
                <li key={career.id}>
                  <button
                    type="button"
                    className="grid w-full gap-1 rounded-3xl border border-line bg-card px-5 py-5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={count === 0}
                    onClick={() => setSelectedId(career.id)}
                  >
                    <span className="text-3xl">{career.name}</span>
                    <span className="text-lg">
                      {count === 0
                        ? "Sin preguntas"
                        : count === 1
                          ? "1 pregunta"
                          : `${count} preguntas`}
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

  const count = questionsForCareer(bank, selected.id).length;

  return (
    <section className="mt-8 grid max-w-3xl gap-4">
      <h2 className="text-4xl">{selected.name}</h2>
      <p className="text-2xl">
        {count === 0 ? "Esta carrera no tiene preguntas." : count === 1 ? "1 pregunta" : `${count} preguntas`}
      </p>
      {roomError ? (
        <p role="alert" className="text-xl text-red-800">
          {roomError}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        {count > 0 ? (
          <button type="button" className={primaryClass} onClick={() => void openRoom(selected.id)}>
            Abrir sala
          </button>
        ) : null}
        <button type="button" className={secondaryClass} onClick={() => setSelectedId(null)}>
          Elegir otra carrera
        </button>
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

  return (
    <section className="mt-8 grid gap-8">
      {room.phase === "lobby" ? (
        <>
          <p className="text-2xl">PIN de la sala</p>
          <p className="text-7xl tracking-[0.18em] sm:text-8xl" aria-label={`PIN ${pin}`}>
            {pin.slice(0, 3)} {pin.slice(3)}
          </p>
          <div>
            <h2 className="text-3xl">
              {room.players.length === 1 ? "1 jugador" : `${room.players.length} jugadores`}
            </h2>
            <ul className="mt-4 grid gap-2">
              {room.players.map((player) => (
                <li key={player.id} className="text-4xl">
                  {player.nickname}
                </li>
              ))}
            </ul>
          </div>
          <button
            type="button"
            className={primaryClass}
            disabled={room.players.length === 0}
            onClick={onBegin}
          >
            Empezar
          </button>
        </>
      ) : null}

      {room.phase === "question" && question ? (
        <>
          <p className="text-2xl">
            Pregunta {room.questionIndex + 1} de {questions.length}
          </p>
          <p className="text-7xl leading-none" aria-live="off">
            {remainingSeconds(room.startedAt, question.timeLimitSeconds, now || room.startedAt)}
            <span className="ml-3 text-3xl">segundos</span>
          </p>
          <h2 className="text-4xl leading-tight sm:text-6xl">{question.text}</h2>
          <ul className="grid gap-3">
            {question.options.map((option) => (
              <li
                key={option.id}
                className="rounded-3xl border border-line bg-card px-5 py-4 text-2xl break-words sm:text-3xl"
              >
                {option.text}
              </li>
            ))}
          </ul>
          <p className="text-2xl">
            Respondieron {room.answers.length} de {room.players.length}
          </p>
          <button type="button" className={primaryClass} onClick={onClose}>
            Cerrar pregunta
          </button>
        </>
      ) : null}

      {room.phase === "reveal" && question ? (
        <>
          <p className="text-2xl">
            Pregunta {room.questionIndex + 1} de {questions.length}
          </p>
          <h2 className="text-4xl leading-tight sm:text-5xl">{question.text}</h2>
          <p className="rounded-3xl border border-accent bg-card px-5 py-4 text-3xl break-words">
            Respuesta correcta:{" "}
            {question.options.find((option) => option.id === room.correctOptionId)?.text}
          </p>
          <Leaderboard title="Esta ronda" rows={room.roundPoints.map((row) => ({ nickname: row.nickname, score: row.points }))} />
          <Leaderboard title="Ranking" rows={room.leaderboard} />
          {room.questionIndex + 1 < questions.length ? (
            <button type="button" className={primaryClass} onClick={onAdvance}>
              Siguiente
            </button>
          ) : (
            <button type="button" className={primaryClass} onClick={onFinish}>
              Cerrar partida
            </button>
          )}
        </>
      ) : null}

      {room.phase === "ended" ? (
        <>
          <h2 className="text-5xl">Ranking final</h2>
          <Leaderboard title="Ranking" rows={room.leaderboard} />
          <button type="button" className={primaryClass} onClick={onReset}>
            Nueva sala
          </button>
        </>
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
