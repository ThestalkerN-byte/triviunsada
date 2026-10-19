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
  "inline-flex min-h-14 items-center justify-center rounded-full bg-accent px-5 text-lg font-medium text-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50";
const fieldClass =
  "w-full rounded-xl border border-line bg-paper px-3 py-3 text-lg outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const optionClass =
  "min-h-14 w-full rounded-2xl border border-line bg-card px-4 py-3 text-left text-lg break-words focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60";

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
      setFormError("El PIN tiene 6 dígitos.");
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
      setView({ status: "rejected", reason: "No se pudo entrar a la sala." });
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
        if (message.type === "question:start") setNow(Date.now());
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
      if (error.type === "peer-unavailable") fail("No hay una sala con ese PIN.");
      else fail("No se pudo entrar a la sala.");
    });
  }

  function choose(event: MouseEvent<HTMLButtonElement>) {
    const optionId = event.currentTarget.dataset.option;
    const connection = connectionRef.current;
    if (!optionId || !connection?.open || view.status !== "question" || view.sent) return;
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
      <form className="mt-8 grid max-w-md gap-4" onSubmit={(event) => void enter(event)}>
        <label className="grid gap-2" htmlFor="pin">
          PIN
          <input
            id="pin"
            className={fieldClass}
            inputMode="numeric"
            autoComplete="off"
            maxLength={6}
            value={pin}
            onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
          />
        </label>
        <label className="grid gap-2" htmlFor="nickname">
          Nickname
          <input
            id="nickname"
            className={fieldClass}
            maxLength={24}
            value={nickname}
            onChange={(event) => setNickname(event.target.value)}
          />
        </label>
        {formError || view.status === "rejected" ? (
          <p role="alert" className="text-red-800">
            {view.status === "rejected" ? view.reason : formError}
          </p>
        ) : null}
        <button type="submit" className={primaryClass}>
          Entrar
        </button>
      </form>
    );
  }

  if (view.status === "connecting") return <p className="mt-8 text-xl">Entrando a la sala…</p>;
  if (view.status === "cut") return <p className="mt-8 text-xl">Se cortó la sala.</p>;

  if (view.status === "lobby") {
    return (
      <section className="mt-8 grid gap-4">
        <h2 className="text-3xl">Estás en la sala</h2>
        <ul className="grid gap-2">
          {view.players.map((player) => (
            <li key={player.nickname} className="text-2xl">
              {player.nickname}
            </li>
          ))}
        </ul>
        <p>Esperá a que empiece la pregunta.</p>
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
        <p>
          Pregunta {view.question.index + 1} de {view.question.total}
        </p>
        <p className="text-5xl leading-none" aria-live="off">
          {remaining}
          <span className="ml-2 text-lg">segundos</span>
        </p>
        <h2 className="text-3xl leading-tight">{view.question.text}</h2>
        <div className="grid gap-3">
          {view.question.options.map((option) => (
            <button
              key={option.id}
              type="button"
              className={optionClass}
              data-option={option.id}
              disabled={view.sent}
              onClick={choose}
            >
              {option.text}
            </button>
          ))}
        </div>
        {view.sent ? <p>Respuesta enviada</p> : null}
      </section>
    );
  }

  if (view.status === "reveal") {
    const mine = view.roundPoints.find((row) => row.nickname === nickname.trim());
    const correct = view.question.options.find((option) => option.id === view.correctOptionId);
    return (
      <section className="mt-8 grid gap-6">
        <h2 className="text-3xl leading-tight">{view.question.text}</h2>
        <p className="text-2xl">Sumaste {mine?.points ?? 0}</p>
        <p>Respuesta correcta: {correct?.text}</p>
        <Ranking rows={view.leaderboard} />
        <p>Esperá la siguiente pregunta.</p>
      </section>
    );
  }

  return (
    <section className="mt-8 grid gap-6">
      <h2 className="text-3xl">Ranking final</h2>
      <Ranking rows={view.leaderboard} />
    </section>
  );
}

function Ranking({ rows }: { rows: LeaderboardEntry[] }) {
  return (
    <ol className="grid gap-2">
      {rows.map((row, index) => (
        <li key={`${row.nickname}-${index}`} className="flex justify-between gap-4 text-xl">
          <span>
            {index + 1}. {row.nickname}
          </span>
          <span>{row.score}</span>
        </li>
      ))}
    </ol>
  );
}

function applyHostMessage(current: PlayerView, message: HostToPlayerMessage): PlayerView {
  if (message.type === "lobby:update") {
    if (current.status === "question" || current.status === "reveal" || current.status === "ended") {
      return current;
    }
    return { status: "lobby", players: message.players };
  }
  if (message.type === "question:start") {
    return { status: "question", question: message.question, sent: false };
  }
  if (message.type === "question:reveal") {
    const question = current.status === "question" || current.status === "reveal" ? current.question : null;
    if (!question) return current;
    return {
      status: "reveal",
      question,
      correctOptionId: message.correctOptionId,
      roundPoints: message.roundPoints,
      leaderboard: message.leaderboard,
    };
  }
  if (message.type === "game:ended") return { status: "ended", leaderboard: message.leaderboard };
  return { status: "rejected", reason: message.reason };
}

function readHostMessage(raw: unknown): HostToPlayerMessage | null {
  if (typeof raw !== "object" || raw === null || !("type" in raw)) return null;
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
