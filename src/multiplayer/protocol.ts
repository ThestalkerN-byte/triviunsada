import type { Question } from "@/domain/types";

export type LobbyPlayer = {
  nickname: string;
};

export type PublicQuestion = {
  id: string;
  text: string;
  timeLimitSeconds: number;
  options: { id: string; text: string }[];
  index: number;
  total: number;
  startedAt: number;
};

export type RoundScore = {
  nickname: string;
  points: number;
};

export type LeaderboardEntry = {
  nickname: string;
  score: number;
};

export type HostToPlayerMessage =
  | { type: "lobby:update"; players: LobbyPlayer[] }
  | { type: "question:start"; question: PublicQuestion }
  | {
      type: "question:reveal";
      correctOptionId: string;
      roundPoints: RoundScore[];
      leaderboard: LeaderboardEntry[];
    }
  | { type: "game:ended"; leaderboard: LeaderboardEntry[] }
  | { type: "join:rejected"; reason: string };

export type PlayerToHostMessage =
  | { type: "player:join"; nickname: string }
  | {
      type: "player:answer";
      questionId: string;
      optionId: string;
      answeredAt: number;
    };

export function toPublicQuestion(
  question: Question,
  index: number,
  total: number,
  startedAt: number,
): PublicQuestion {
  return {
    id: question.id,
    text: question.text,
    timeLimitSeconds: question.timeLimitSeconds,
    options: question.options.map((option) => ({
      id: option.id,
      text: option.text,
    })),
    index,
    total,
    startedAt,
  };
}
