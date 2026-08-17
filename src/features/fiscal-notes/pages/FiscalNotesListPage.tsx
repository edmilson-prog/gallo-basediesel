import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ScrollProgressBar } from "@/features/shell/components/ScrollProgressBar";
import { useCurrentStore } from "@/features/multistore";
import type { FiscalNoteStatus } from "@/shared/types";
import { FiscalNotesHeader } from "../components/list/FiscalNotesHeader";
import { FiscalNotesKpis } from "../components/list/FiscalNotesKpis";
import { FiscalNotesTable } from "../components/list/FiscalNotesTable";
import { useFiscalNotesList } from "../hooks/useFiscalNotesList";
import { FISCAL_NOTES_STRINGS } from "../i18n/pt-BR";

type Filter = "all" | FiscalNoteStatus;

export function FiscalNotesListPage() {
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  const { currentStoreId } = useCurrentStore();
  const navigate = useNavigate();
  const s = FISCAL_NOTES_STRINGS;

  const { notes, total, isLoading, isError, refetch } = useFiscalNotesList({
    storeId: currentStoreId,
    status: filter === "all" ? undefined : filter,
    search: search || undefined,
  });

  const filters: Array<{ key: Filter; label: string }> = [
    { key: "all", label: s.list.filterAll },
    { key: "conferencia", label: s.list.filterConferencia },
    { key: "lancada", label: s.list.filterLancada },
  ];

  const goImport = () => void navigate({ to: "/app/suprimentos/importar" });

  return (
    <div className="flex h-full flex-col">
      <FiscalNotesHeader
        total={total}
        searchValue={search}
        onSearchChange={setSearch}
        onImport={goImport}
      />

      <div className="shrink-0 px-4 pt-4 md:px-6">
        <FiscalNotesKpis notes={notes} />
        <div className="mt-3 flex flex-wrap gap-2 pb-3">
          {filters.map((f) => (
            <Button
              key={f.key}
              size="sm"
              variant={filter === f.key ? "default" : "outline"}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Seam de altura zero: a linha de progresso mora na divisa exata entre o
          bloco fixo e a área rolável (ux-guidelines §2). */}
      <div className="relative h-0">
        <ScrollProgressBar container={scrollEl} />
      </div>

      {isError ? (
        <div className="grid flex-1 place-items-center gap-3 p-8 text-center">
          <p className="text-sm text-muted-foreground">{s.list.errorTitle}</p>
          <Button size="sm" variant="outline" onClick={() => void refetch()}>
            {s.list.retry}
          </Button>
        </div>
      ) : isLoading ? (
        <div className="flex-1 space-y-2 p-4 md:p-6">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="h-12 animate-pulse rounded-md bg-muted motion-reduce:animate-none"
            />
          ))}
        </div>
      ) : notes.length === 0 ? (
        <div className="grid flex-1 place-items-center gap-3 p-8 text-center">
          <p className="font-display text-lg font-extrabold uppercase text-foreground">
            {s.list.emptyTitle}
          </p>
          <p className="max-w-sm text-sm text-muted-foreground">{s.list.emptyDescription}</p>
          <Button size="sm" onClick={goImport}>
            {s.list.importCta}
          </Button>
        </div>
      ) : (
        <FiscalNotesTable
          notes={notes}
          scrollRef={setScrollEl}
          onOpen={(note) =>
            void navigate({ to: "/app/suprimentos/entrada/$id", params: { id: note.id } })
          }
        />
      )}
    </div>
  );
}
