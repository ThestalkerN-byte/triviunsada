import { describe, expect, it } from "vitest";
import {
  answerAttempt,
  questionsForCareer,
  remainingSeconds,
  startAttempt,
  summarizeAttempt,
  timeoutAttempt,
} from "./attempt";
import type { QuestionBank } from "./types";

const bank: QuestionBank = {
  version: 1,
  careers: [
    {
      id: "vacia",
      name: "Vacía",
      createdAt: "2026-10-16T00:00:00.000Z",
      updatedAt: "2026-10-16T00:00:00.000Z",
    },
    {
      id: "his",
      name: "Historia",
      createdAt: "2026-10-16T00:00:00.000Z",
      updatedAt: "2026-10-16T00:00:00.000Z",
    },
  ],
  questions: [
    {
      id: "q1",
      careerId: "his",
      text: "Primera",
      timeLimitSeconds: 20,
      options: [
        { id: "a", text: "Atenas" },
        { id: "b", text: "Roma" },
      ],
      correctOptionId: "a",
    },
    {
      id: "q2",
      careerId: "his",
      text: "Segunda",
      timeLimitSeconds: 10,
      options: [
        { id: "c", text: "XV" },
        { id: "d", text: "XIX" },
      ],
      correctOptionId: "d",
    },
  ],
};

const first = bank.questions[0];
const second = bank.questions[1];

describe("startAttempt", () => {
  it("rechaza una carrera inexistente o sin preguntas", () => {
    expect(startAttempt(bank, "no-existe").ok).toBe(false);
    expect(startAttempt(bank, "vacia").ok).toBe(false);
  });

  it("arma el intento en el orden del banco", () => {
    const started = startAttempt(bank, "his");
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(started.attempt.questionIds).toEqual(["q1", "q2"]);
    expect(questionsForCareer(bank, "his").map((question) => question.id)).toEqual([
      "q1",
      "q2",
    ]);
  });
});

describe("respuestas", () => {
  it("cuenta una respuesta correcta y una incorrecta sin usar la velocidad", () => {
    const started = startAttempt(bank, "his");
    if (!started.ok) throw new Error("el intento no empezó");

    const correct = answerAttempt(started.attempt, first, "a");
    const wrong = answerAttempt(correct, second, "c");
    const summary = summarizeAttempt(questionsForCareer(bank, "his"), wrong);

    expect(correct.answers[0]).toEqual({
      questionId: "q1",
      selectedOptionId: "a",
      correct: true,
    });
    expect(wrong.answers[1]).toEqual({
      questionId: "q2",
      selectedOptionId: "c",
      correct: false,
    });
    expect(summary).toMatchObject({ correct: 1, total: 2 });
  });

  it("marca el tiempo vencido como incorrecto y sin opción", () => {
    const started = startAttempt(bank, "his");
    if (!started.ok) throw new Error("el intento no empezó");

    const timedOut = timeoutAttempt(started.attempt, first);
    expect(timedOut.answers).toEqual([
      { questionId: "q1", selectedOptionId: null, correct: false },
    ]);

    const summary = summarizeAttempt([first], timedOut);
    expect(summary.rows[0]).toMatchObject({
      correct: false,
      selectedOptionText: null,
      correctOptionText: "Atenas",
    });
  });

  it("ignora una respuesta duplicada o de otra pregunta", () => {
    const started = startAttempt(bank, "his");
    if (!started.ok) throw new Error("el intento no empezó");

    const once = answerAttempt(started.attempt, first, "a");
    expect(answerAttempt(once, first, "b")).toBe(once);
    expect(answerAttempt(started.attempt, second, "d")).toBe(started.attempt);
    expect(timeoutAttempt(once, first)).toBe(once);
  });
});

describe("remainingSeconds", () => {
  it("no baja de cero", () => {
    expect(remainingSeconds(1_000, 20, 1_000)).toBe(20);
    expect(remainingSeconds(1_000, 20, 21_000)).toBe(0);
    expect(remainingSeconds(1_000, 20, 40_000)).toBe(0);
  });
});
