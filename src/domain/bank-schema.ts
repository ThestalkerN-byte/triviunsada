import { z } from "zod";
import type { ExportedQuestionBank, QuestionBank } from "./types";

const answerOptionSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
});

export const questionSchema = z
  .object({
    id: z.string().min(1),
    careerId: z.string().min(1),
    text: z.string().min(1),
    timeLimitSeconds: z.number().int().positive(),
    options: z.array(answerOptionSchema).min(2).max(6),
    correctOptionId: z.string().min(1),
  })
  .refine(
    (question) =>
      new Set(question.options.map((option) => option.id)).size ===
      question.options.length,
    "Las opciones de una pregunta tienen que ser distintas.",
  )
  .refine(
    (question) =>
      question.options.some((option) => option.id === question.correctOptionId),
    "La opción correcta no pertenece a la pregunta.",
  );

const careerSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

const questionBankFields = {
  version: z.literal(1),
  careers: z.array(careerSchema),
  questions: z.array(questionSchema),
};

function hasUniqueIds(ids: string[]): boolean {
  return new Set(ids).size === ids.length;
}

function questionsBelongToCareers(bank: QuestionBank): boolean {
  const careerIds = new Set(bank.careers.map((career) => career.id));
  return bank.questions.every((question) => careerIds.has(question.careerId));
}

function withBankRules<T extends QuestionBank>(schema: z.ZodType<T>) {
  return schema
    .refine(
      (bank) => hasUniqueIds(bank.careers.map((career) => career.id)),
      "Hay carreras repetidas en el banco.",
    )
    .refine(
      (bank) => hasUniqueIds(bank.questions.map((question) => question.id)),
      "Hay preguntas repetidas en el banco.",
    )
    .refine(
      questionsBelongToCareers,
      "Hay una pregunta asociada a una carrera que no existe.",
    );
}

export const questionBankSchema = withBankRules(z.object(questionBankFields));

export const exportedQuestionBankSchema = withBankRules(
  z.object({
    ...questionBankFields,
    exportedAt: z.string().min(1),
  }),
);

export function parseExportedBank(
  raw: unknown,
): { success: true; data: ExportedQuestionBank } | { success: false; error: string } {
  const parsed = exportedQuestionBankSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: "El JSON no tiene el formato del banco de preguntas.",
    };
  }

  const data: ExportedQuestionBank = parsed.data;
  return { success: true, data };
}

export function parseQuestionBank(
  raw: unknown,
): { success: true; data: QuestionBank } | { success: false; error: string } {
  const parsed = questionBankSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: "El banco guardado no tiene un formato válido.",
    };
  }

  const data: QuestionBank = parsed.data;
  return { success: true, data };
}
