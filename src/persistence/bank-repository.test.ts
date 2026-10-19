import { describe, expect, it } from "vitest";
import type { ExportedQuestionBank } from "@/domain/types";
import {
  BANK_STORAGE_KEY,
  createBankRepository,
  emptyQuestionBank,
  type KeyValueStorage,
} from "./bank-repository";

function memoryStorage(): KeyValueStorage & { read(key: string): string | null } {
  const items = new Map<string, string>();
  return {
    getItem(key) {
      return items.get(key) ?? null;
    },
    setItem(key, value) {
      items.set(key, value);
    },
    read(key) {
      return items.get(key) ?? null;
    },
  };
}

const exportedBank: ExportedQuestionBank = {
  version: 1,
  exportedAt: "2026-10-15T12:00:00.000Z",
  careers: [
    {
      id: "arq",
      name: "Arquitectura",
      createdAt: "2026-10-15T12:00:00.000Z",
      updatedAt: "2026-10-15T12:00:00.000Z",
    },
  ],
  questions: [
    {
      id: "q1",
      careerId: "arq",
      text: "¿Qué es un dintel?",
      timeLimitSeconds: 20,
      options: [
        { id: "a", text: "Una abertura" },
        { id: "b", text: "Un cerramiento superior" },
      ],
      correctOptionId: "b",
    },
  ],
};

describe("createBankRepository", () => {
  it("devuelve un banco vacío cuando no hay nada guardado", () => {
    const storage = memoryStorage();
    expect(createBankRepository(storage).load()).toEqual({
      ok: true,
      bank: emptyQuestionBank(),
    });
  });

  it("no pisa un valor guardado que no se puede leer", () => {
    const storage = memoryStorage();
    storage.setItem(BANK_STORAGE_KEY, "{");
    const loaded = createBankRepository(storage).load();

    expect(loaded.ok).toBe(false);
    expect(storage.read(BANK_STORAGE_KEY)).toBe("{");
  });

  it("no reemplaza el banco si el JSON importado es inválido", () => {
    const storage = memoryStorage();
    const repository = createBankRepository(storage);
    repository.importBank(exportedBank);
    const before = storage.read(BANK_STORAGE_KEY);

    const result = repository.importBank({ version: 1 });

    expect(result).toEqual({
      ok: false,
      error: "El JSON no tiene el formato del banco de preguntas.",
    });
    expect(storage.read(BANK_STORAGE_KEY)).toBe(before);
    expect(repository.load().ok).toBe(true);
  });

  it("importa un banco válido y lo vuelve a leer", () => {
    const storage = memoryStorage();
    const repository = createBankRepository(storage);

    expect(repository.importBank(exportedBank)).toEqual({ ok: true });

    const loaded = repository.load();
    expect(loaded).toEqual({
      ok: true,
      bank: {
        version: 1,
        careers: exportedBank.careers,
        questions: exportedBank.questions,
      },
    });
  });

  it("exporta el banco con la fecha y no escribe si está dañado", () => {
    const storage = memoryStorage();
    const repository = createBankRepository(storage);
    repository.importBank(exportedBank);

    const exported = repository.exportBank(new Date("2026-10-16T00:00:00.000Z"));
    expect(exported.ok).toBe(true);
    if (exported.ok) {
      expect(exported.data.exportedAt).toBe("2026-10-16T00:00:00.000Z");
      expect(exported.data.careers).toEqual(exportedBank.careers);
    }

    storage.setItem(BANK_STORAGE_KEY, "{");
    expect(repository.exportBank().ok).toBe(false);
    expect(storage.read(BANK_STORAGE_KEY)).toBe("{");
  });
});
