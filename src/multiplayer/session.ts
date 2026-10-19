import { remainingSeconds } from "@/domain/attempt";
import { scoreCompetitiveAnswer } from "@/domain/scoring";
import type { Question } from "@/domain/types";
import type { LeaderboardEntry, RoundScore } from "./protocol";

export const NICKNAME_MAX = 24;

export type RoomPlayer = {
  id: string;
  nickname: string;
  score: number;
};

export type RecordedAnswer = {
  playerId: string;
  optionId: string;
  receivedAt: number;
};

export type Room =
  | { phase: "lobby"; players: RoomPlayer[] }
  | {
      phase: "question";
      players: RoomPlayer[];
      questionIndex: number;
      questionId: string;
      startedAt: number;
      answers: RecordedAnswer[];
    }
  | {
      phase: "reveal";
      players: RoomPlayer[];
      questionIndex: number;
      questionId: string;
      correctOptionId: string;
      roundPoints: RoundScore[];
      leaderboard: LeaderboardEntry[];
    }
  | { phase: "ended"; players: RoomPlayer[]; leaderboard: LeaderboardEntry[] };

export type JoinResult = { ok: true; room: Room } | { ok: false; error: string };

export function createLobby(): Room {
  return { phase: "lobby", players: [] };
}

export function nicknameError(nickname: string): string | null {
  const trimmed = nickname.trim();
  if (!trimmed) return "El nickname no puede estar vacío.";
  if (trimmed.length > NICKNAME_MAX) return "El nickname admite hasta 24 caracteres.";
  return null;
}

export function joinPlayer(room: Room, playerId: string, nickname: string): JoinResult {
  if (room.phase !== "lobby") return { ok: false, error: "La partida ya empezó." };
  const nameError = nicknameError(nickname);
  if (nameError) return { ok: false, error: nameError };

  const trimmed = nickname.trim();
  const sameName = room.players.some(
    (player) =>
      player.id !== playerId &&
      player.nickname.localeCompare(trimmed, "es", { sensitivity: "accent" }) === 0,
  );
  if (sameName) return { ok: false, error: "Ese nickname ya está en la sala." };
  if (room.players.some((player) => player.id === playerId)) return { ok: true, room };

  return {
    ok: true,
    room: {
      phase: "lobby",
      players: [...room.players, { id: playerId, nickname: trimmed, score: 0 }],
    },
  };
}

export function disconnectPlayer(room: Room, playerId: string): Room {
  if (room.phase !== "lobby") return room;
  if (!room.players.some((player) => player.id === playerId)) return room;
  return {
    phase: "lobby",
    players: room.players.filter((player) => player.id !== playerId),
  };
}

export function startQuestion(
  room: Room,
  question: { id: string; index: number },
  startedAt: number,
): JoinResult {
  if (room.phase === "lobby") {
    if (room.players.length === 0) {
      return { ok: false, error: "Tiene que haber al menos un jugador." };
    }
    if (question.index !== 0) return { ok: false, error: "Ahora no se puede abrir una pregunta." };
  } else if (room.phase === "reveal") {
    if (question.index !== room.questionIndex + 1) {
      return { ok: false, error: "Ahora no se puede abrir una pregunta." };
    }
  } else {
    return { ok: false, error: "Ahora no se puede abrir una pregunta." };
  }

  return {
    ok: true,
    room: {
      phase: "question",
      players: room.players,
      questionIndex: question.index,
      questionId: question.id,
      startedAt,
      answers: [],
    },
  };
}

export function recordAnswer(
  room: Room,
  playerId: string,
  questionId: string,
  optionId: string,
  receivedAt: number,
  question: Question,
): Room {
  if (room.phase !== "question") return room;
  if (room.questionId !== questionId || question.id !== questionId) return room;
  if (!room.players.some((player) => player.id === playerId)) return room;
  if (room.answers.some((answer) => answer.playerId === playerId)) return room;
  if (!question.options.some((option) => option.id === optionId)) return room;
  if (receivedAt < room.startedAt) return room;
  if (receivedAt > room.startedAt + question.timeLimitSeconds * 1000) return room;

  return {
    ...room,
    answers: [...room.answers, { playerId, optionId, receivedAt }],
  };
}

export function revealQuestion(room: Room, question: Question): Room {
  if (room.phase !== "question" || question.id !== room.questionId) return room;

  const roundPoints = room.players.map((player) => {
    const answer = room.answers.find((item) => item.playerId === player.id);
    const points = answer
      ? scoreCompetitiveAnswer({
          isCorrect: answer.optionId === question.correctOptionId,
          secondsRemaining: remainingSeconds(
            room.startedAt,
            question.timeLimitSeconds,
            answer.receivedAt,
          ),
          timeLimitSeconds: question.timeLimitSeconds,
        })
      : 0;
    return { nickname: player.nickname, points };
  });
  const players = room.players.map((player) => {
    const round = roundPoints.find((item) => item.nickname === player.nickname);
    return { ...player, score: player.score + (round?.points ?? 0) };
  });

  return {
    phase: "reveal",
    players,
    questionIndex: room.questionIndex,
    questionId: room.questionId,
    correctOptionId: question.correctOptionId,
    roundPoints,
    leaderboard: rankPlayers(players),
  };
}

export function endGame(room: Room): Room {
  if (room.phase !== "reveal") return room;
  return { phase: "ended", players: room.players, leaderboard: room.leaderboard };
}

function rankPlayers(players: RoomPlayer[]): LeaderboardEntry[] {
  return players
    .map((player) => ({ nickname: player.nickname, score: player.score }))
    .sort(
      (left, right) =>
        right.score - left.score || left.nickname.localeCompare(right.nickname, "es"),
    );
}
