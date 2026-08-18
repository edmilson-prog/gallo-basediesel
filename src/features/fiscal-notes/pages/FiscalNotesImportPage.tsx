import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Icon } from "@/components/Icon";
import { useCurrentStore } from "@/features/multistore";
import { XmlDropzone } from "../components/import/XmlDropzone";
import { ImportQueueItem, type IImportQueueEntry } from "../components/import/ImportQueueItem";
import { summarizeLinks } from "../engine/importNote";
import { ImportRejected, useImportNfe } from "../hooks/useImportNfe";
import { FISCAL_NOTES_STRINGS } from "../i18n/pt-BR";

export function FiscalNotesImportPage() {
  const { currentStoreId, isHydrating } = useCurrentStore();
  const { importFile, isImporting } = useImportNfe(currentStoreId);
  const [queue, setQueue] = useState<IImportQueueEntry[]>([]);
  const navigate = useNavigate();
  const s = FISCAL_NOTES_STRINGS;

  function patch(id: string, next: Partial<IImportQueueEntry>) {
    setQueue((entries) => entries.map((e) => (e.id === id ? { ...e, ...next } : e)));
  }

  async function handleFiles(files: File[]) {
    // Sequencial de propósito: paralelizar faria dois XML do mesmo fornecedor
    // novo criarem dois cadastros, porque ambos leriam "CNPJ não existe" antes
    // de qualquer escrita.
    for (const [index, file] of files.entries()) {
      const id = `${file.name}-${file.size}-${queue.length + index}`;
      setQueue((entries) => [{ id, filename: file.name, state: "processing" }, ...entries]);
      try {
        const outcome = await importFile(file);
        patch(id, {
          state: "done",
          noteId: outcome.note.id,
          noteNumber: outcome.note.number,
          supplierName: outcome.supplierName,
          supplierCreated: outcome.supplierCreated,
          counts: summarizeLinks(outcome.note.items),
        });
        toast.success(s.import.successToast(outcome.note.number, outcome.supplierCreated));
      } catch (error) {
        const message =
          error instanceof ImportRejected ? error.message : s.import.notXmlError(file.name);
        patch(id, { state: "failed", error: message });
        toast.error(message);
      }
    }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 flex-col gap-1 border-b border-border/40 bg-background/85 px-4 py-3 shadow-lg shadow-foreground/5 backdrop-blur-2xl backdrop-saturate-[1.8] supports-[backdrop-filter]:bg-background/50 md:px-6">
        <div className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-md bg-primary/10 text-primary">
            <Icon icon="mdi:file-upload-outline" size={20} aria-hidden />
          </div>
          <h1 className="font-display text-xl font-extrabold uppercase leading-none tracking-[0.01em] text-foreground">
            {s.importTitle}
          </h1>
        </div>
        <p className="max-w-3xl text-[12.5px] text-muted-foreground">{s.importSubtitle}</p>
      </header>

      <div className="min-h-0 flex-1 overflow-auto px-4 py-4 md:px-6">
        <div className="mx-auto flex max-w-4xl flex-col gap-4">
          <XmlDropzone onFiles={handleFiles} disabled={isImporting || isHydrating} />

          {queue.length > 0 && (
            <section className="overflow-hidden rounded-xl border border-border bg-card">
              <h2 className="border-b border-border px-4 py-3 text-sm font-bold text-foreground">
                {s.import.queueTitle}
              </h2>
              {queue.map((entry) => (
                <ImportQueueItem
                  key={entry.id}
                  entry={entry}
                  onReview={(noteId) =>
                    void navigate({ to: "/app/suprimentos/entrada/$id", params: { id: noteId } })
                  }
                />
              ))}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
