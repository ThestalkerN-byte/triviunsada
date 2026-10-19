import { describe, expect, it } from "vitest";
import {
  createCareer,
  createQuestion,
  deleteCareer,
  deleteQuestion,
  updateCareer,
  updateQuestion,
} from "./bank-commands";
import type { QuestionBank } from "./types";

function emptyQuestionBank(): QuestionBank {
  return { version: 1, careers: [], questions: [] };
}

const now = new Date("2026-10-15T12:00:00.000Z");
const later = new Date("2026-10-16T12:00:00.000Z");

function ids(values: string[]) {
  const pending = [...values];
  return () => {
    const next = pending.shift();
    if (!next) throw new Error("No quedan ids de prueba.");
    return next;
  };
}

function bankWithCareers(): QuestionBank {
  return {
    version: 1,
    careers: [
      {
        id: "arq",
        name: "Arquitectura",
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      },
      {
        id: "his",
        name: "Historia",
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      },
    ],
    questions: [
      {
        id: "q-arq",
        careerId: "arq",
        text: "¿Qué es un dintel?",
        timeLimitSeconds: 20,
        options: [
          { id: "a", text: "Una abertura" },
          { id: "b", text: "Un cerramiento superior" },
        ],
        correctOptionId: "b",
      },
      {
        id: "q-his",
        careerId: "his",
        text: "¿En qué siglo cayó Constantinopla?",
        timeLimitSeconds: 30,
        options: [
          { id: "c", text: "XV" },
          { id: "d", text: "XIX" },
        ],
        correctOptionId: "c",
      },
    ],
  };
}

describe("carreras", () => {
  it("crea una carrera con el nombre recortado y no muta el banco original", () => {
    const original = emptyQuestionBank();
    const result = createCareer(original, "  Arquitectura  ", now, ids(["arq"]));

    expect(original.careers).toEqual([]);
    expect(result).toEqual({
      ok: true,
      bank: {
        version: 1,
        careers: [
          {
            id: "arq",
            name: "Arquitectura",
            createdAt: now.toISOString(),
            updatedAt: now.toISOString(),
          },
        ],
        questions: [],
      },
    });
  });

  it("rechaza un nombre vacío o demasiado largo", () => {
    const bank = emptyQuestionBank();
    expect(createCareer(bank, "   ", now).ok).toBe(false);
    expect(createCareer(bank, "a".repeat(81), now).ok).toBe(false);
  });

  it("renombra una carrera y conserva la fecha de creación", () => {
    const result = updateCareer(bankWithCareers(), "arq", "Arquitectura y hábitat", later);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.bank.careers[0]).toEqual({
      id: "arq",
      name: "Arquitectura y hábitat",
      createdAt: now.toISOString(),
      updatedAt: later.toISOString(),
    });
  });

  it("borra la carrera y solo sus preguntas", () => {
    const result = deleteCareer(bankWithCareers(), "arq");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.bank.careers.map((career) => career.id)).toEqual(["his"]);
    expect(result.bank.questions.map((question) => question.id)).toEqual(["q-his"]);
  });
});

describe("preguntas", () => {
  it("crea una pregunta con la opción correcta indicada", () => {
    const result = createQuestion(
      bankWithCareers(),
      {
        careerId: "arq",
        text: "  ¿Qué pieza recibe el techo?  ",
        timeLimitSeconds: 20,
        options: [" El muro ", "La columna"],
        correctOptionIndex: 0,
      },
      now,
      ids(["q-nueva", "o1", "o2"]),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.bank.questions.at(-1)).toEqual({
      id: "q-nueva",
      careerId: "arq",
      text: "¿Qué pieza recibe el techo?",
      timeLimitSeconds: 20,
      options: [
        { id: "o1", text: "El muro" },
        { id: "o2", text: "La columna" },
      ],
      correctOptionId: "o1",
    });
  });

  it("rechaza opciones de menos, de más, texto vacío, tiempo inválido y correcta ausente", () => {
    const bank = bankWithCareers();
    const base = {
      careerId: "arq",
      text: "¿Pregunta?",
      timeLimitSeconds: 20,
      options: ["Una", "Otra"],
      correctOptionIndex: 0,
    };

    expect(createQuestion(bank, { ...base, options: ["Solo una"] }, now).ok).toBe(false);
    expect(
      createQuestion(
        bank,
        { ...base, options: ["1", "2", "3", "4", "5", "6", "7"] },
        now,
      ).ok,
    ).toBe(false);
    expect(createQuestion(bank, { ...base, text: "  " }, now).ok).toBe(false);
    expect(createQuestion(bank, { ...base, options: ["Una", "  "] }, now).ok).toBe(false);
    expect(createQuestion(bank, { ...base, timeLimitSeconds: 0 }, now).ok).toBe(false);
    expect(createQuestion(bank, { ...base, timeLimitSeconds: 1.5 }, now).ok).toBe(false);
    expect(createQuestion(bank, { ...base, correctOptionIndex: -1 }, now).ok).toBe(false);
  });

  it("actualiza la pregunta en su lugar", () => {
    const result = updateQuestion(
      bankWithCareers(),
      {
        id: "q-arq",
        careerId: "arq",
        text: "¿Qué es un arco?",
        timeLimitSeconds: 25,
        options: ["Una curva", "Un plano"],
        correctOptionIndex: 1,
      },
      later,
      ids(["n1", "n2"]),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.bank.questions.map((question) => question.id)).toEqual([
      "q-arq",
      "q-his",
    ]);
    expect(result.bank.questions[0]).toMatchObject({
      id: "q-arq",
      text: "¿Qué es un arco?",
      timeLimitSeconds: 25,
      correctOptionId: "n2",
    });
  });

  it("borra una pregunta y deja las demás", () => {
    const result = deleteQuestion(bankWithCareers(), "q-arq");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.bank.questions.map((question) => question.id)).toEqual(["q-his"]);
    expect(result.bank.careers).toHaveLength(2);
  });
});
