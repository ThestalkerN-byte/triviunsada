"use client";

import {
  createCareer,
  createQuestion,
  deleteCareer,
  deleteQuestion,
  updateCareer,
  updateQuestion,
  type CommandResult,
  type QuestionInput,
} from "@/domain/bank-commands";
import { parseExportedBank } from "@/domain/bank-schema";
import unsadaBank from "@/content/unsada-bank.json";
import type { ExportedQuestionBank, Question, QuestionBank } from "@/domain/types";
import {
  BANK_STORAGE_KEY,
  createBrowserBankRepository,
  emptyQuestionBank,
  type LoadBankResult,
} from "@/persistence/bank-repository";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import type { ChangeEvent, FormEvent } from "react";

const fieldClass =
  "w-full rounded-xl border border-line bg-paper px-3 py-2 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const primaryClass =
  "inline-flex min-h-11 items-center justify-center rounded-full bg-accent px-4 font-medium text-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50";
const secondaryClass =
  "inline-flex min-h-11 items-center justify-center rounded-full border border-line bg-card px-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50";

type OptionDraft = {
  key: string;
  text: string;
};

type QuestionDraft = {
  text: string;
  timeLimitSeconds: string;
  options: OptionDraft[];
  correctKey: string;
};

type QuestionEditorState =
  | { mode: "create"; draft: QuestionDraft }
  | { mode: "edit"; questionId: string; draft: QuestionDraft };

function blankDraft(): QuestionDraft {
  const first = crypto.randomUUID();
  const second = crypto.randomUUID();
  return {
    text: "",
    timeLimitSeconds: "20",
    options: [
      { key: first, text: "" },
      { key: second, text: "" },
    ],
    correctKey: first,
  };
}

function draftFromQuestion(question: Question): QuestionDraft {
  return {
    text: question.text,
    timeLimitSeconds: String(question.timeLimitSeconds),
    options: question.options.map((option) => ({
      key: option.id,
      text: option.text,
    })),
    correctKey: question.correctOptionId,
  };
}

function questionInputFromDraft(
  careerId: string,
  draft: QuestionDraft,
): QuestionInput {
  return {
    careerId,
    text: draft.text,
    timeLimitSeconds: Number(draft.timeLimitSeconds.trim()),
    options: draft.options.map((option) => option.text),
    correctOptionIndex: draft.options.findIndex(
      (option) => option.key === draft.correctKey,
    ),
  };
}

function downloadBankFile(data: ExportedQuestionBank) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "triviunsada-banco.json";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function saveError(error: unknown): string {
  return error instanceof Error ? error.message : "No se pudo guardar el banco.";
}

let bankSnapshot: LoadBankResult | null = null;
const bankListeners = new Set<() => void>();

function emitBank() {
  for (const listener of bankListeners) listener();
}

function subscribeBank(listener: () => void) {
  bankListeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== BANK_STORAGE_KEY) return;
    bankSnapshot = createBrowserBankRepository().load();
    emitBank();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    bankListeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function getBankSnapshot() {
  if (bankSnapshot === null) {
    bankSnapshot = createBrowserBankRepository().load();
  }
  return bankSnapshot;
}

function getBankServerSnapshot() {
  return null;
}

function publishBank(next: LoadBankResult) {
  bankSnapshot = next;
  emitBank();
}

export function AdminPanel() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const careerId = searchParams.get("careerId");
  const stored = useSyncExternalStore(
    subscribeBank,
    getBankSnapshot,
    getBankServerSnapshot,
  );
  const [careerName, setCareerName] = useState("");
  const [careerError, setCareerError] = useState<string | null>(null);
  const [editingCareerId, setEditingCareerId] = useState<string | null>(null);
  const [editingCareerName, setEditingCareerName] = useState("");
  const [pendingDeleteCareerId, setPendingDeleteCareerId] = useState<string | null>(
    null,
  );
  const [questionEditor, setQuestionEditor] = useState<QuestionEditorState | null>(
    null,
  );
  const [questionError, setQuestionError] = useState<string | null>(null);
  const [pendingDeleteQuestionId, setPendingDeleteQuestionId] = useState<
    string | null
  >(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [pendingImport, setPendingImport] = useState<{
    name: string;
    data: unknown;
  } | null>(null);
  const [pendingClear, setPendingClear] = useState(false);
  const [questionCareerId, setQuestionCareerId] = useState(careerId);

  if (questionCareerId !== careerId) {
    setQuestionCareerId(careerId);
    setQuestionEditor(null);
    setQuestionError(null);
    setPendingDeleteQuestionId(null);
  }

  function selectCareer(id: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (id) params.set("careerId", id);
    else params.delete("careerId");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  function storeBank(bank: QuestionBank) {
    createBrowserBankRepository().save(bank);
    publishBank({ ok: true, bank });
  }

  function applyCommand(result: CommandResult, report: (error: string) => void) {
    if (!result.ok) {
      report(result.error);
      return false;
    }
    try {
      storeBank(result.bank);
    } catch (error) {
      report(saveError(error));
      return false;
    }
    report("");
    return true;
  }

  function createCareerFromForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!stored?.ok) return;
    const result = createCareer(stored.bank, careerName, new Date());
    const saved = applyCommand(result, (error) => setCareerError(error || null));
    if (!saved || !result.ok) return;
    setCareerName("");
    const created = result.bank.careers.at(-1);
    if (created) selectCareer(created.id);
  }

  function renameCareer(event: FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault();
    if (!stored?.ok) return;
    const result = updateCareer(stored.bank, id, editingCareerName, new Date());
    const saved = applyCommand(result, (error) => setCareerError(error || null));
    if (!saved) return;
    setEditingCareerId(null);
  }

  function confirmDeleteCareer(id: string) {
    if (!stored?.ok) return;
    const result = deleteCareer(stored.bank, id);
    const saved = applyCommand(result, (error) => setCareerError(error || null));
    if (!saved) return;
    setPendingDeleteCareerId(null);
    if (careerId === id) selectCareer(null);
  }

  function submitQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!stored?.ok || !questionEditor || !careerId) return;
    const input = questionInputFromDraft(careerId, questionEditor.draft);
    const result =
      questionEditor.mode === "create"
        ? createQuestion(stored.bank, input, new Date())
        : updateQuestion(
            stored.bank,
            { ...input, id: questionEditor.questionId },
            new Date(),
          );
    const saved = applyCommand(result, (error) => setQuestionError(error || null));
    if (!saved) return;
    setQuestionEditor(null);
  }

  function confirmDeleteQuestion(id: string) {
    if (!stored?.ok) return;
    const result = deleteQuestion(stored.bank, id);
    const saved = applyCommand(result, (error) => setQuestionError(error || null));
    if (!saved) return;
    setPendingDeleteQuestionId(null);
    if (questionEditor?.mode === "edit" && questionEditor.questionId === id) {
      setQuestionEditor(null);
    }
  }

  function exportFile() {
    const exported = createBrowserBankRepository().exportBank();
    if (!exported.ok) {
      setFileError(exported.error);
      return;
    }
    setFileError(null);
    downloadBankFile(exported.data);
  }

  async function pickFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    setPendingImport(null);
    if (!file) return;

    let data: unknown;
    try {
      data = JSON.parse(await file.text());
    } catch {
      setFileError("El archivo no es un JSON válido.");
      return;
    }

    const parsed = parseExportedBank(data);
    if (!parsed.success) {
      setFileError(parsed.error);
      return;
    }

    setFileError(null);
    setPendingImport({ name: file.name, data });
  }

  function offerTemplate() {
    setFileError(null);
    setPendingImport({ name: "Plantilla UNSAdA", data: unsadaBank });
  }

  function confirmImport() {
    if (!pendingImport || !stored) return;
    const repository = createBrowserBankRepository();
    const imported = repository.importBank(pendingImport.data);
    if (!imported.ok) {
      setFileError(imported.error);
      return;
    }
    const loaded = repository.load();
    publishBank(loaded);
    setPendingImport(null);
    setFileError(null);
    setPendingClear(false);
    if (loaded.ok && careerId && !loaded.bank.careers.some((career) => career.id === careerId)) {
      selectCareer(null);
    }
  }

  function confirmClear() {
    try {
      storeBank(emptyQuestionBank());
    } catch (error) {
      setFileError(saveError(error));
      return;
    }
    setPendingClear(false);
    setFileError(null);
    selectCareer(null);
  }

  if (stored === null) {
    return <p className="mt-8">Cargando el banco…</p>;
  }

  if (!stored.ok) {
    return (
      <div className="mt-8 grid gap-8">
        <p role="alert" className="max-w-xl text-red-800">
          {stored.error} No se modificó el banco.
        </p>
        {pendingClear ? (
          <div className="grid max-w-xl gap-3 rounded-2xl border border-line bg-card p-4">
            <p>¿Vaciar el banco dañado? Se pierde lo que haya quedado guardado.</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={primaryClass} onClick={confirmClear}>
                Vaciar banco
              </button>
              <button
                type="button"
                className={secondaryClass}
                onClick={() => setPendingClear(false)}
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className={secondaryClass} onClick={() => setPendingClear(true)}>
            Vaciar banco
          </button>
        )}
        <ArchiveSection
          canExport={false}
          fileError={fileError}
          pendingImport={pendingImport}
          onExport={exportFile}
          onPickFile={pickFile}
          onLoadTemplate={offerTemplate}
          onConfirmImport={confirmImport}
          onCancelImport={() => setPendingImport(null)}
        />
      </div>
    );
  }

  const bank = stored.bank;
  const selected = bank.careers.find((career) => career.id === careerId) ?? null;
  const questions = selected
    ? bank.questions.filter((question) => question.careerId === selected.id)
    : [];

  return (
    <div className="mt-8 grid gap-8">
      <div className="grid gap-8 lg:grid-cols-2">
        <section aria-labelledby="careers-heading" className="grid content-start gap-4">
          <h2 id="careers-heading" className="text-2xl">
            Carreras
          </h2>
          {careerError ? (
            <p role="alert" className="text-red-800">
              {careerError}
            </p>
          ) : null}
          {bank.careers.length === 0 ? (
            <p>Todavía no hay carreras. Creá la primera para cargar preguntas.</p>
          ) : (
            <ul className="grid gap-3">
              {bank.careers.map((career) => {
                const selectedCareer = career.id === selected?.id;
                const questionCount = bank.questions.filter(
                  (question) => question.careerId === career.id,
                ).length;
                return (
                  <li
                    key={career.id}
                    className={`grid gap-3 rounded-2xl border bg-card p-4 ${selectedCareer ? "border-accent" : "border-line"}`}
                  >
                    {editingCareerId === career.id ? (
                      <form
                        className="grid gap-3"
                        onSubmit={(event) => renameCareer(event, career.id)}
                      >
                        <label htmlFor={`rename-${career.id}`} className="text-sm">
                          Nuevo nombre
                        </label>
                        <input
                          id={`rename-${career.id}`}
                          className={fieldClass}
                          value={editingCareerName}
                          maxLength={80}
                          autoComplete="off"
                          onChange={(event) => setEditingCareerName(event.target.value)}
                        />
                        <div className="flex flex-wrap gap-2">
                          <button type="submit" className={primaryClass}>
                            Guardar
                          </button>
                          <button
                            type="button"
                            className={secondaryClass}
                            onClick={() => setEditingCareerId(null)}
                          >
                            Cancelar
                          </button>
                        </div>
                      </form>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="text-left text-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                          aria-pressed={selectedCareer}
                          onClick={() => selectCareer(career.id)}
                        >
                          {career.name}
                        </button>
                        <p className="text-sm">
                          {questionCount === 1
                            ? "1 pregunta"
                            : `${questionCount} preguntas`}
                        </p>
                        {pendingDeleteCareerId === career.id ? (
                          <div className="grid gap-3">
                            <p>¿Borrar {career.name} y todas sus preguntas?</p>
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                className={primaryClass}
                                onClick={() => confirmDeleteCareer(career.id)}
                              >
                                Borrar
                              </button>
                              <button
                                type="button"
                                className={secondaryClass}
                                onClick={() => setPendingDeleteCareerId(null)}
                              >
                                Cancelar
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              className={secondaryClass}
                              onClick={() => {
                                setEditingCareerId(career.id);
                                setEditingCareerName(career.name);
                                setPendingDeleteCareerId(null);
                                setCareerError(null);
                              }}
                            >
                              Renombrar
                            </button>
                            <button
                              type="button"
                              className={secondaryClass}
                              onClick={() => {
                                setPendingDeleteCareerId(career.id);
                                setEditingCareerId(null);
                                setCareerError(null);
                              }}
                            >
                              Borrar
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <form className="grid gap-3" onSubmit={createCareerFromForm}>
            <label htmlFor="career-name" className="text-sm">
              Nueva carrera
            </label>
            <input
              id="career-name"
              className={fieldClass}
              value={careerName}
              maxLength={80}
              autoComplete="off"
              onChange={(event) => setCareerName(event.target.value)}
            />
            <button type="submit" className={`${primaryClass} justify-self-start`}>
              Crear carrera
            </button>
          </form>
        </section>

        <section aria-labelledby="questions-heading" className="grid content-start gap-4">
          <h2 id="questions-heading" className="text-2xl">
            {selected ? `Preguntas de ${selected.name}` : "Preguntas"}
          </h2>
          {questionError ? (
            <p role="alert" className="text-red-800">
              {questionError}
            </p>
          ) : null}
          {!careerId ? (
            <p>Elegí una carrera para ver sus preguntas.</p>
          ) : null}
          {careerId && !selected ? (
            <p>Esa carrera no está en el banco.</p>
          ) : null}
          {selected && questions.length === 0 && !questionEditor ? (
            <p>Esta carrera todavía no tiene preguntas.</p>
          ) : null}
          {selected ? (
            <ul className="grid gap-3">
              {questions.map((question) => (
                <li key={question.id} className="grid gap-3 rounded-2xl border border-line bg-card p-4">
                  <p className="text-lg">{question.text}</p>
                  <p className="text-sm">
                    {question.timeLimitSeconds} segundos · {question.options.length}{" "}
                    opciones
                  </p>
                  {pendingDeleteQuestionId === question.id ? (
                    <div className="grid gap-3">
                      <p>¿Borrar esta pregunta?</p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className={primaryClass}
                          onClick={() => confirmDeleteQuestion(question.id)}
                        >
                          Borrar
                        </button>
                        <button
                          type="button"
                          className={secondaryClass}
                          onClick={() => setPendingDeleteQuestionId(null)}
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className={secondaryClass}
                        onClick={() => {
                          setQuestionEditor({
                            mode: "edit",
                            questionId: question.id,
                            draft: draftFromQuestion(question),
                          });
                          setQuestionError(null);
                          setPendingDeleteQuestionId(null);
                        }}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        className={secondaryClass}
                        onClick={() => {
                          setPendingDeleteQuestionId(question.id);
                          setQuestionError(null);
                        }}
                      >
                        Borrar
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : null}
          {selected && !questionEditor ? (
            <button
              type="button"
              className={`${primaryClass} justify-self-start`}
              onClick={() => {
                setQuestionEditor({ mode: "create", draft: blankDraft() });
                setQuestionError(null);
              }}
            >
              Nueva pregunta
            </button>
          ) : null}
          {selected && questionEditor ? (
            <QuestionForm
              draft={questionEditor.draft}
              submitLabel={
                questionEditor.mode === "create" ? "Guardar pregunta" : "Guardar cambios"
              }
              onChange={(draft) => setQuestionEditor({ ...questionEditor, draft })}
              onSubmit={submitQuestion}
              onCancel={() => {
                setQuestionEditor(null);
                setQuestionError(null);
              }}
            />
          ) : null}
        </section>
      </div>
      <ArchiveSection
        canExport
        fileError={fileError}
        pendingImport={pendingImport}
        onExport={exportFile}
        onPickFile={pickFile}
        onLoadTemplate={offerTemplate}
        onConfirmImport={confirmImport}
        onCancelImport={() => setPendingImport(null)}
      />
    </div>
  );
}

function QuestionForm({
  draft,
  submitLabel,
  onChange,
  onSubmit,
  onCancel,
}: {
  draft: QuestionDraft;
  submitLabel: string;
  onChange: (draft: QuestionDraft) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}) {
  function updateOption(key: string, text: string) {
    onChange({
      ...draft,
      options: draft.options.map((option) =>
        option.key === key ? { ...option, text } : option,
      ),
    });
  }

  function removeOption(key: string) {
    if (draft.options.length <= 2) return;
    const options = draft.options.filter((option) => option.key !== key);
    onChange({
      ...draft,
      options,
      correctKey: options.some((option) => option.key === draft.correctKey)
        ? draft.correctKey
        : options[0].key,
    });
  }

  function addOption() {
    if (draft.options.length >= 6) return;
    onChange({
      ...draft,
      options: [...draft.options, { key: crypto.randomUUID(), text: "" }],
    });
  }

  return (
    <form className="grid gap-4 rounded-2xl border border-line bg-card p-4" onSubmit={onSubmit}>
      <div className="grid gap-2">
        <label htmlFor="question-text" className="text-sm">
          Enunciado
        </label>
        <textarea
          id="question-text"
          className={fieldClass}
          value={draft.text}
          maxLength={280}
          rows={3}
          onChange={(event) => onChange({ ...draft, text: event.target.value })}
        />
      </div>
      <div className="grid gap-2">
        <label htmlFor="question-time" className="text-sm">
          Tiempo límite (segundos)
        </label>
        <input
          id="question-time"
          className={fieldClass}
          inputMode="numeric"
          value={draft.timeLimitSeconds}
          onChange={(event) =>
            onChange({ ...draft, timeLimitSeconds: event.target.value })
          }
        />
      </div>
      <fieldset className="grid gap-3">
        <legend className="text-sm">
          Opciones. Entre 2 y 6. Marcá la correcta.
        </legend>
        {draft.options.map((option, index) => (
          <div key={option.key} className="grid gap-2 sm:grid-cols-[auto_1fr_auto] sm:items-center">
            <label className="inline-flex min-h-11 items-center gap-2">
              <input
                type="radio"
                name="correct-option"
                checked={draft.correctKey === option.key}
                onChange={() => onChange({ ...draft, correctKey: option.key })}
              />
              Correcta
            </label>
            <input
              className={fieldClass}
              aria-label={`Texto de la opción ${index + 1}`}
              value={option.text}
              maxLength={400}
              onChange={(event) => updateOption(option.key, event.target.value)}
            />
            <button
              type="button"
              className={secondaryClass}
              disabled={draft.options.length <= 2}
              onClick={() => removeOption(option.key)}
            >
              Quitar
            </button>
          </div>
        ))}
      </fieldset>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={secondaryClass}
          disabled={draft.options.length >= 6}
          onClick={addOption}
        >
          Agregar opción
        </button>
        <button type="submit" className={primaryClass}>
          {submitLabel}
        </button>
        <button type="button" className={secondaryClass} onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

function ArchiveSection({
  canExport,
  fileError,
  pendingImport,
  onExport,
  onPickFile,
  onLoadTemplate,
  onConfirmImport,
  onCancelImport,
}: {
  canExport: boolean;
  fileError: string | null;
  pendingImport: { name: string; data: unknown } | null;
  onExport: () => void;
  onPickFile: (event: ChangeEvent<HTMLInputElement>) => void;
  onLoadTemplate: () => void;
  onConfirmImport: () => void;
  onCancelImport: () => void;
}) {
  return (
    <section aria-labelledby="file-heading" className="grid gap-4 border-t border-line pt-8">
      <h2 id="file-heading" className="text-2xl">
        Archivo
      </h2>
      <p className="max-w-xl">
        El JSON incluye todas las carreras y preguntas de este navegador.
      </p>
      {fileError ? (
        <p role="alert" className="text-red-800">
          {fileError}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        {canExport ? (
          <button type="button" className={primaryClass} onClick={onExport}>
            Descargar JSON
          </button>
        ) : null}
        <button type="button" className={secondaryClass} onClick={onLoadTemplate}>
          Cargar plantilla UNSAdA
        </button>
        <label className="grid gap-2 text-sm">
          Elegir un archivo JSON
          <input
            type="file"
            accept="application/json,.json"
            onChange={onPickFile}
          />
        </label>
      </div>
      {pendingImport ? (
        <div className="grid max-w-xl gap-3 rounded-2xl border border-line bg-card p-4">
          <p>
            {pendingImport.name} reemplaza todas las carreras y preguntas de este
            navegador.
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={primaryClass} onClick={onConfirmImport}>
              Reemplazar banco
            </button>
            <button type="button" className={secondaryClass} onClick={onCancelImport}>
              Cancelar
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
