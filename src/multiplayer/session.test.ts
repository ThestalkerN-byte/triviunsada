import { describe, expect, it } from "vitest";
import type { Question } from "@/domain/types";
import {
  createLobby,
  disconnectPlayer,
  endGame,
  joinPlayer,
  recordAnswer,
  revealQuestion,
  startQuestion,
} from "./session";

const question: Question = {
  id: "q1",
  careerId: "historia",
  text: "¿Cuál es la capital de Grecia?",
  timeLimitSeconds: 20,
  options: [
    { id: "a", text: "Atenas" },
    { id: "b", text: "Roma" },
  ],
  correctOptionId: "a",
};

const nextQuestion: Question = {
  ...question,
  id: "q2",
  text: "¿En qué año cayó Constantinopla?",
  options: [
    { id: "c", text: "1453" },
    { id: "d", text: "1492" },
  ],
  correctOptionId: "c",
};

function lobbyWith(names: string[]) {
  return names.reduce((room, nickname, index) => {
    const joined = joinPlayer(room, `p${index}`, nickname);
    if (!joined.ok) throw new Error(joined.error);
    return joined.room;
  }, createLobby());
}

function playing() {
  const started = startQuestion(lobbyWith(["Ana", "Luis"]), { id: question.id, index: 0 }, 1_000);
  if (!started.ok || started.room.phase !== "question") throw new Error("no abrió");
  return started.room;
}

describe("sala competitiva", () => {
  it("rechaza un nickname repetido sin distinguir mayúsculas", () => {
    const room = lobbyWith(["Ana"]);
    expect(joinPlayer(room, "otro", "ana")).toEqual({
      ok: false,
      error: "Ese nickname ya está en la sala.",
    });
  });

  it("rechaza a quien entra cuando la partida ya empezó", () => {
    expect(joinPlayer(playing(), "tarde", "Mora")).toEqual({
      ok: false,
      error: "La partida ya empezó.",
    });
  });

  it("no empieza sin jugadores", () => {
    expect(startQuestion(createLobby(), { id: question.id, index: 0 }, 0)).toEqual({
      ok: false,
      error: "Tiene que haber al menos un jugador.",
    });
  });

  it("suma más a la respuesta correcta más rápida y 0 a la incorrecta", () => {
    const room = recordAnswer(
      recordAnswer(playing(), "p0", question.id, "a", 1_000, question),
      "p1",
      question.id,
      "b",
      1_000,
      question,
    );
    const revealed = revealQuestion(room, question);
    if (revealed.phase !== "reveal") throw new Error("no reveló");

    expect(revealed.roundPoints).toEqual([
      { nickname: "Ana", points: 1000 },
      { nickname: "Luis", points: 0 },
    ]);

    const slower = revealQuestion(
      recordAnswer(playing(), "p0", question.id, "a", 11_000, question),
      question,
    );
    if (slower.phase !== "reveal") throw new Error("no reveló");
    expect(slower.roundPoints[0]?.points).toBe(750);
    expect(slower.roundPoints[0]?.points).toBeLessThan(1000);
  });

  it("ignora una respuesta duplicada y una de otra pregunta", () => {
    const once = recordAnswer(playing(), "p0", question.id, "a", 1_000, question);
    expect(recordAnswer(once, "p0", question.id, "b", 2_000, question)).toBe(once);
    expect(recordAnswer(once, "p1", "otra", "a", 2_000, question)).toBe(once);
  });

  it("deja en 0 a quien no responde cuando se cierra el tiempo", () => {
    const room = recordAnswer(playing(), "p0", question.id, "a", 22_000, question);
    if (room.phase !== "question") throw new Error("cambió de fase");
    expect(room.answers).toHaveLength(0);

    const revealed = revealQuestion(room, question);
    if (revealed.phase !== "reveal") throw new Error("no reveló");
    expect(revealed.roundPoints).toEqual([
      { nickname: "Ana", points: 0 },
      { nickname: "Luis", points: 0 },
    ]);
  });

  it("ordena el ranking por puntos y, si empatan, por nickname", () => {
    const first = revealQuestion(
      recordAnswer(
        recordAnswer(playing(), "p0", question.id, "a", 1_000, question),
        "p1",
        question.id,
        "a",
        11_000,
        question,
      ),
      question,
    );
    if (first.phase !== "reveal") throw new Error("no reveló");
    expect(first.leaderboard.map((entry) => entry.nickname)).toEqual(["Ana", "Luis"]);

    const tied = revealQuestion(playing(), question);
    if (tied.phase !== "reveal") throw new Error("no reveló");
    expect(tied.leaderboard.map((entry) => entry.nickname)).toEqual(["Ana", "Luis"]);

    const continued = startQuestion(first, { id: nextQuestion.id, index: 1 }, 30_000);
    if (!continued.ok || continued.room.phase !== "question") throw new Error("no siguió");
    const second = revealQuestion(
      recordAnswer(continued.room, "p1", nextQuestion.id, "c", 30_000, nextQuestion),
      nextQuestion,
    );
    if (second.phase !== "reveal") throw new Error("no reveló");
    expect(second.leaderboard).toEqual([
      { nickname: "Luis", score: 1750 },
      { nickname: "Ana", score: 1000 },
    ]);

    const ended = endGame(second);
    if (ended.phase !== "ended") throw new Error("no cerró");
    expect(ended.leaderboard).toEqual(second.leaderboard);
  });

  it("saca del lobby a quien se desconecta y conserva el puntaje si la partida ya empezó", () => {
    const lobby = lobbyWith(["Ana"]);
    const empty = disconnectPlayer(lobby, "p0");
    if (empty.phase !== "lobby") throw new Error("no es lobby");
    expect(empty.players).toHaveLength(0);

    const live = playing();
    expect(disconnectPlayer(live, "p0")).toBe(live);
  });
});
