type CompetitiveAnswer = {
  isCorrect: boolean;
  secondsRemaining: number;
  timeLimitSeconds: number;
};

export function scoreCompetitiveAnswer(answer: CompetitiveAnswer): number {
  if (
    !answer.isCorrect ||
    answer.secondsRemaining < 0 ||
    answer.timeLimitSeconds <= 0
  ) {
    return 0;
  }

  const ratio = Math.min(1, answer.secondsRemaining / answer.timeLimitSeconds);
  return Math.round(500 + 500 * ratio);
}
