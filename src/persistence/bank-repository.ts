import { parseExportedBank, parseQuestionBank } from "@/domain/bank-schema";
import type { ExportedQuestionBank, QuestionBank } from "@/domain/types";

export const BANK_STORAGE_KEY = "triviunsada.question-bank";

export type KeyValueStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export type LoadBankResult =
  | { ok: true; bank: QuestionBank }
  | { ok: false; error: string };

export type ExportBankResult =
  | { ok: true; data: ExportedQuestionBank }
  | { ok: false; error: string };

export type ImportBankResult = { ok: true } | { ok: false; error: string };

export type BankRepository = {
  load(): LoadBankResult;
  save(bank: QuestionBank): void;
  exportBank(now?: Date): ExportBankResult;
  importBank(raw: unknown): ImportBankResult;
};

export function emptyQuestionBank(): QuestionBank {
  return { version: 1, careers: [], questions: [] };
}

export function createBankRepository(storage: KeyValueStorage): BankRepository {
  return {
    load() {
      const raw = storage.getItem(BANK_STORAGE_KEY);
      if (raw === null) return { ok: true, bank: emptyQuestionBank() };

      try {
        const parsed = parseQuestionBank(JSON.parse(raw));
        if (!parsed.success) return { ok: false, error: parsed.error };
        return { ok: true, bank: parsed.data };
      } catch {
        return { ok: false, error: "El banco guardado no se puede leer." };
      }
    },

    save(bank) {
      const parsed = parseQuestionBank(bank);
      if (!parsed.success) {
        throw new Error(parsed.error);
      }
      storage.setItem(BANK_STORAGE_KEY, JSON.stringify(parsed.data));
    },

    exportBank(now = new Date()) {
      const loaded = this.load();
      if (!loaded.ok) return loaded;
      return {
        ok: true,
        data: {
          ...loaded.bank,
          exportedAt: now.toISOString(),
        },
      };
    },

    importBank(raw) {
      const parsed = parseExportedBank(raw);
      if (!parsed.success) return { ok: false, error: parsed.error };

      const bank: QuestionBank = {
        version: parsed.data.version,
        careers: parsed.data.careers,
        questions: parsed.data.questions,
      };
      storage.setItem(BANK_STORAGE_KEY, JSON.stringify(bank));
      return { ok: true };
    },
  };
}

export function createBrowserBankRepository(): BankRepository {
  if (typeof window === "undefined") {
    throw new Error("El banco local solo está disponible en el navegador.");
  }

  return createBankRepository(window.localStorage);
}
