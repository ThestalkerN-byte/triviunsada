import { describe, expect, it } from "vitest";
import { parseExportedBank } from "@/domain/bank-schema";
import unsadaBank from "./unsada-bank.json";

const careerNames = [
  "Ciencias Agropecuarias",
  "Informática y Tecnología",
  "Gestión Ambiental",
  "Tecnicatura Universitaria en Mantenimiento Industrial",
];

describe("plantilla UNSAdA", () => {
  const parsed = parseExportedBank(unsadaBank);

  it("tiene el formato del banco exportado", () => {
    expect(parsed.success).toBe(true);
  });

  it("trae cuatro carreras de 50 preguntas, con tres opciones y una correcta", () => {
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const { careers, questions } = parsed.data;

    expect(careers.map((career) => career.name)).toEqual(careerNames);
    expect(questions).toHaveLength(200);

    for (const career of careers) {
      expect(career.name.length).toBeLessThanOrEqual(80);
      const own = questions.filter((question) => question.careerId === career.id);
      expect(own).toHaveLength(50);
      for (const question of own) {
        expect(question.text.length).toBeLessThanOrEqual(280);
        expect(question.timeLimitSeconds).toBe(20);
        expect(question.options).toHaveLength(3);
        expect(question.options.map((option) => option.text.length).every((length) => length <= 400)).toBe(
          true,
        );
        expect(question.options.filter((option) => option.id === question.correctOptionId)).toHaveLength(
          1,
        );
      }
    }
  });
});
