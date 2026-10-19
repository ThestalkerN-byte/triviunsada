import type { Question, QuestionBank } from "./types";

const CAREER_NAME_MAX = 80;
const QUESTION_TEXT_MAX = 280;
const OPTION_TEXT_MAX = 400;

type IdFactory = () => string;

export type CommandResult =
  | { ok: true; bank: QuestionBank }
  | { ok: false; error: string };

export type QuestionInput = {
  careerId: string;
  text: string;
  timeLimitSeconds: number;
  options: string[];
  correctOptionIndex: number;
};

export type QuestionUpdateInput = QuestionInput & {
  id: string;
};

function newId(): string {
  return crypto.randomUUID();
}

function fail(error: string): CommandResult {
  return { ok: false, error };
}

function careerNameError(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return "El nombre de la carrera no puede estar vacío.";
  if (trimmed.length > CAREER_NAME_MAX) {
    return "El nombre de la carrera admite hasta 80 caracteres.";
  }
  return null;
}

function questionFields(
  input: QuestionInput,
  createId: IdFactory,
): { ok: true; question: Omit<Question, "id"> } | { ok: false; error: string } {
  const text = input.text.trim();
  if (!text) return { ok: false, error: "El enunciado no puede estar vacío." };
  if (text.length > QUESTION_TEXT_MAX) {
    return { ok: false, error: "El enunciado admite hasta 280 caracteres." };
  }
  if (!Number.isInteger(input.timeLimitSeconds) || input.timeLimitSeconds <= 0) {
    return {
      ok: false,
      error: "El tiempo límite tiene que ser un entero mayor a 0.",
    };
  }
  if (input.options.length < 2 || input.options.length > 6) {
    return {
      ok: false,
      error: "La pregunta tiene que tener entre 2 y 6 opciones.",
    };
  }

  const optionTexts = input.options.map((option) => option.trim());
  if (optionTexts.some((option) => option.length === 0)) {
    return { ok: false, error: "Cada opción tiene que tener texto." };
  }
  if (optionTexts.some((option) => option.length > OPTION_TEXT_MAX)) {
    return { ok: false, error: "Cada opción admite hasta 400 caracteres." };
  }
  if (
    !Number.isInteger(input.correctOptionIndex) ||
    input.correctOptionIndex < 0 ||
    input.correctOptionIndex >= optionTexts.length
  ) {
    return { ok: false, error: "Tenés que marcar una opción correcta." };
  }

  const options = optionTexts.map((option) => ({ id: createId(), text: option }));
  return {
    ok: true,
    question: {
      careerId: input.careerId,
      text,
      timeLimitSeconds: input.timeLimitSeconds,
      options,
      correctOptionId: options[input.correctOptionIndex].id,
    },
  };
}

export function createCareer(
  bank: QuestionBank,
  name: string,
  now: Date,
  createId: IdFactory = newId,
): CommandResult {
  const error = careerNameError(name);
  if (error) return fail(error);

  const timestamp = now.toISOString();
  return {
    ok: true,
    bank: {
      ...bank,
      careers: [
        ...bank.careers,
        {
          id: createId(),
          name: name.trim(),
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ],
    },
  };
}

export function updateCareer(
  bank: QuestionBank,
  id: string,
  name: string,
  now: Date,
): CommandResult {
  const error = careerNameError(name);
  if (error) return fail(error);
  if (!bank.careers.some((career) => career.id === id)) {
    return fail("No existe esa carrera.");
  }

  return {
    ok: true,
    bank: {
      ...bank,
      careers: bank.careers.map((career) =>
        career.id === id
          ? { ...career, name: name.trim(), updatedAt: now.toISOString() }
          : career,
      ),
    },
  };
}

export function deleteCareer(bank: QuestionBank, id: string): CommandResult {
  if (!bank.careers.some((career) => career.id === id)) {
    return fail("No existe esa carrera.");
  }

  return {
    ok: true,
    bank: {
      ...bank,
      careers: bank.careers.filter((career) => career.id !== id),
      questions: bank.questions.filter((question) => question.careerId !== id),
    },
  };
}

export function createQuestion(
  bank: QuestionBank,
  input: QuestionInput,
  _now: Date,
  createId: IdFactory = newId,
): CommandResult {
  if (!bank.careers.some((career) => career.id === input.careerId)) {
    return fail("No existe esa carrera.");
  }

  const questionId = createId();
  const fields = questionFields(input, createId);
  if (!fields.ok) return fields;

  return {
    ok: true,
    bank: {
      ...bank,
      questions: [...bank.questions, { id: questionId, ...fields.question }],
    },
  };
}

export function updateQuestion(
  bank: QuestionBank,
  input: QuestionUpdateInput,
  _now: Date,
  createId: IdFactory = newId,
): CommandResult {
  if (!bank.questions.some((question) => question.id === input.id)) {
    return fail("No existe esa pregunta.");
  }
  if (!bank.careers.some((career) => career.id === input.careerId)) {
    return fail("No existe esa carrera.");
  }

  const fields = questionFields(input, createId);
  if (!fields.ok) return fields;

  return {
    ok: true,
    bank: {
      ...bank,
      questions: bank.questions.map((question) =>
        question.id === input.id
          ? { id: input.id, ...fields.question }
          : question,
      ),
    },
  };
}

export function deleteQuestion(bank: QuestionBank, id: string): CommandResult {
  if (!bank.questions.some((question) => question.id === id)) {
    return fail("No existe esa pregunta.");
  }

  return {
    ok: true,
    bank: {
      ...bank,
      questions: bank.questions.filter((question) => question.id !== id),
    },
  };
}
