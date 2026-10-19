import { describe, expect, it } from "vitest";
import { parseExportedBank, questionSchema } from "./bank-schema";

const career = {
  id: "arquitectura",
  name: "Arquitectura",
  createdAt: "2026-10-12T00:00:00.000Z",
  updatedAt: "2026-10-12T00:00:00.000Z",
};

function option(id: string) {
  return { id, text: `Opción ${id}` };
}

function question(overrides: Record<string, unknown> = {}) {
  return {
    id: "pregunta-1",
    careerId: career.id,
    text: "¿Qué pieza ordena el acceso a un edificio?",
    timeLimitSeconds: 20,
    options: [option("a"), option("b")],
    correctOptionId: "a",
    ...overrides,
  };
}

const exportedBank = {
  version: 1 as const,
  exportedAt: "2026-10-12T22:00:00.000Z",
  careers: [career],
  questions: [question()],
};

describe("parseExportedBank", () => {
  it("acepta un banco exportado completo", () => {
    const parsed = parseExportedBank(exportedBank);
    expect(parsed.success).toBe(true);
  });

  it("rechaza un JSON que no es un banco", () => {
    const parsed = parseExportedBank({ version: 1 });
    expect(parsed.success).toBe(false);
  });
});

describe("questionSchema", () => {
  it("rechaza una pregunta con una sola opción", () => {
    const parsed = questionSchema.safeParse(question({ options: [option("a")] }));
    expect(parsed.success).toBe(false);
  });

  it("rechaza una pregunta con más de seis opciones", () => {
    const parsed = questionSchema.safeParse(
      question({
        options: ["a", "b", "c", "d", "e", "f", "g"].map(option),
      }),
    );
    expect(parsed.success).toBe(false);
  });

  it("rechaza una opción correcta que no existe", () => {
    const parsed = questionSchema.safeParse(
      question({ correctOptionId: "inexistente" }),
    );
    expect(parsed.success).toBe(false);
  });
});
