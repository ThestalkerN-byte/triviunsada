import type { Question, QuestionBank } from "./types";

export type AttemptAnswer = {
  questionId: string;
  selectedOptionId: string | null;
  correct: boolean;
};

export type Attempt = {
  careerId: string;
  questionIds: string[];
  answers: AttemptAnswer[];
};

export type AttemptStart =
  | { ok: true; attempt: Attempt }
  | { ok: false; error: string };

export type AttemptSummaryRow = {
  questionId: string;
  text: string;
  correct: boolean;
  selectedOptionText: string | null;
  correctOptionText: string;
};

export type AttemptSummary = {
  correct: number;
  total: number;
  rows: AttemptSummaryRow[];
};

export function questionsForCareer(bank: QuestionBank, careerId: string): Question[] {
  return bank.questions.filter((question) => question.careerId === careerId);
}


export function startAttempt(
  bank: QuestionBank,
  careerId: string,
  questionCount: number = 5,
): AttemptStart {
  if (!bank.careers.some((career) => career.id === careerId)) {
    return { ok: false, error: "No existe esa carrera." };
  }

  const questions = questionsForCareer(bank, careerId);

  if (questions.length === 0) {
    return { ok: false, error: "Esta carrera no tiene preguntas." };
  }

  // Mezclar las preguntas aleatoriamente.
  const shuffledQuestions = [...questions];

  for (let i = shuffledQuestions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffledQuestions[i], shuffledQuestions[j]] = [
      shuffledQuestions[j],
      shuffledQuestions[i],
    ];
  }

  // No superar la cantidad de preguntas disponibles.
  const selectedQuestions = shuffledQuestions.slice(
    0,
    Math.min(questionCount, shuffledQuestions.length),
  );

  return {
    ok: true,
    attempt: {
      careerId,
      questionIds: selectedQuestions.map((question) => question.id),
      answers: [],
    },
  };
}


export function answerAttempt(
  attempt: Attempt,
  question: Question,
  optionId: string,
): Attempt {
  if (attempt.questionIds[attempt.answers.length] !== question.id) return attempt;
  if (!question.options.some((option) => option.id === optionId)) return attempt;

  return {
    ...attempt,
    answers: [
      ...attempt.answers,
      {
        questionId: question.id,
        selectedOptionId: optionId,
        correct: optionId === question.correctOptionId,
      },
    ],
  };
}

export function timeoutAttempt(attempt: Attempt, question: Question): Attempt {
  if (attempt.questionIds[attempt.answers.length] !== question.id) return attempt;

  return {
    ...attempt,
    answers: [
      ...attempt.answers,
      {
        questionId: question.id,
        selectedOptionId: null,
        correct: false,
      },
    ],
  };
}

export function summarizeAttempt(
  questions: Question[],
  attempt: Attempt,
): AttemptSummary {
  const rows = questions.map((question) => {
    const answer = attempt.answers.find((item) => item.questionId === question.id);
    const selected = question.options.find(
      (option) => option.id === answer?.selectedOptionId,
    );
    const correctOption = question.options.find(
      (option) => option.id === question.correctOptionId,
    );

    return {
      questionId: question.id,
      text: question.text,
      correct: answer?.correct ?? false,
      selectedOptionText: selected?.text ?? null,
      correctOptionText: correctOption?.text ?? "",
    };
  });

  return {
    correct: rows.filter((row) => row.correct).length,
    total: rows.length,
    rows,
  };
}

export function remainingSeconds(
  startedAt: number,
  timeLimitSeconds: number,
  now: number,
): number {
  if (timeLimitSeconds <= 0) return 0;
  const elapsed = Math.floor((now - startedAt) / 1000);
  if (elapsed <= 0) return timeLimitSeconds;
  return Math.max(0, timeLimitSeconds - elapsed);
}
